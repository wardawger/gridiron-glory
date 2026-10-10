import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export type PushKind = 'scores' | 'captain' | 'bets' | 'lineup';
export type PushPrefs = Record<PushKind, boolean>;

const DEFAULT_PREFS: PushPrefs = { scores: true, captain: true, bets: true, lineup: true };
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

// 'needs-install' = iOS Safari/Chrome tab: push only works once the PWA is on the home screen.
export type PushSupport = 'unsupported' | 'needs-install' | 'unconfigured' | 'ready';

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

function support(): PushSupport {
  if (isIos() && !isStandalone()) return 'needs-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (!VAPID_PUBLIC_KEY) return 'unconfigured';
  return 'ready';
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

export function usePushNotifications(userId: string) {
  const [state] = useState<PushSupport>(support);
  const [subscribed, setSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default',
  );
  const [prefs, setPrefs] = useState<PushPrefs>(DEFAULT_PREFS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (state !== 'ready') return;
    let cancelled = false;
    (async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (!cancelled) setSubscribed(!!sub);
      const { data } = await supabase.from('notification_prefs').select('*').eq('user_id', userId).maybeSingle();
      if (!cancelled && data) setPrefs({ scores: data.scores, captain: data.captain, bets: data.bets, lineup: data.lineup });
    })();
    return () => { cancelled = true; };
  }, [state, userId]);

  const enable = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') { setError('Notifications are blocked. Allow them in your device settings, then try again.'); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!) as BufferSource,
      });
      const json = sub.toJSON();
      const { error: dbErr } = await supabase.from('push_subscriptions').upsert({
        user_id: userId,
        endpoint: json.endpoint,
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
        user_agent: navigator.userAgent.slice(0, 200),
      }, { onConflict: 'endpoint' });
      if (dbErr) throw dbErr;
      setSubscribed(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not enable notifications.');
    } finally {
      setBusy(false);
    }
  }, [userId]);

  const disable = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not disable notifications.');
    } finally {
      setBusy(false);
    }
  }, []);

  const setPref = useCallback(async (kind: PushKind, value: boolean) => {
    const previous = prefs;
    setPrefs({ ...prefs, [kind]: value });
    const { error: dbErr } = await supabase.from('notification_prefs')
      .upsert({ user_id: userId, ...previous, [kind]: value, updated_at: new Date().toISOString() });
    if (dbErr) { setPrefs(previous); setError(dbErr.message); }
  }, [prefs, userId]);

  const sendTest = useCallback(async () => {
    setError(null);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/.netlify/functions/send-test-push', {
      method: 'POST',
      headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
    });
    if (!res.ok) setError((await res.json().catch(() => null))?.error ?? 'Test failed.');
  }, []);

  return { state, subscribed, permission, prefs, busy, error, enable, disable, setPref, sendTest };
}
