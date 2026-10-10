// netlify/functions/lib/push.mjs
//
// Shared Supabase REST + web-push delivery helpers for the notification
// functions. Uses the service-role key, so only import from server code.
//
// Required Netlify env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY,
// VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto: or https: URL).

import webpush from 'web-push';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;

let vapidReady = false;
export function ensureVapid() {
  if (vapidReady) return true;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) return false;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  vapidReady = true;
  return true;
}

export function sbHeaders(extra = {}) {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...extra };
}

export async function sbGet(pathWithQuery) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathWithQuery}`, { headers: sbHeaders() });
  if (!res.ok) throw new Error(`Supabase GET ${pathWithQuery} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function sbDeleteByEndpoint(endpoint) {
  await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, {
    method: 'DELETE', headers: sbHeaders(),
  });
}

// Claims a dedupe key atomically. Returns true only for the caller that
// actually inserted the row, so overlapping runs never double-send.
export async function claimLogKey(row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/notification_log?on_conflict=user_id,dedupe_key`, {
    method: 'POST',
    headers: sbHeaders({ Prefer: 'resolution=ignore-duplicates,return=representation' }),
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`notification_log insert failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return Array.isArray(data) && data.length > 0;
}

// Sends one payload to every subscription; prunes ones the push service says
// are gone (404/410). Returns the number delivered.
export async function sendToSubscriptions(subs, payload) {
  let delivered = 0;
  await Promise.all(subs.map(async sub => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        { TTL: 60 * 60 * 6, urgency: 'high' },
      );
      delivered++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) await sbDeleteByEndpoint(sub.endpoint);
      else console.error('[push] send failed', e.statusCode, e.body ?? e.message);
    }
  }));
  return delivered;
}
