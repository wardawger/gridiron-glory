import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';

// Chromium's install event isn't in lib.dom yet.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'install_prompt_dismissed_at';
const DISMISS_DAYS = 30;

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  // iPadOS 13+ reports as a Mac; the touch-points check tells them apart.
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

function recentlyDismissed(): boolean {
  const at = Number(localStorage.getItem(DISMISSED_KEY));
  return !!at && Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
}

// Home-screen install nudge. Android/Chromium get a real one-tap install via
// beforeinstallprompt; iOS has no install API at all, so it gets a short
// how-to instead. Never shown inside the installed app, and a dismissal
// sticks for 30 days.
export function InstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [dismissed, setDismissed] = useState(() => isStandalone() || recentlyDismissed());

  useEffect(() => {
    if (dismissed) return;
    if (isIos()) { setShowIosHelp(true); return; }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setDismissed(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [dismissed]);

  if (dismissed || (!installEvent && !showIosHelp)) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    setDismissed(true);
  };

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === 'accepted') setDismissed(true); else dismiss();
  };

  return (
    <div
      role="region"
      aria-label="Install Gridiron Glory"
      className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-md card p-3 pr-2 flex items-center gap-3 shadow-xl shadow-black/50"
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="w-10 h-10 rounded-lg bg-field-500 flex items-center justify-center flex-shrink-0">
        {installEvent ? <Download className="w-5 h-5 text-turf-950" aria-hidden="true" /> : <Share className="w-5 h-5 text-turf-950" aria-hidden="true" />}
      </div>
      <div className="flex-1 min-w-0 text-sm">
        <p className="font-medium text-white">Add Gridiron Glory to your home screen</p>
        {showIosHelp ? (
          <p className="text-xs text-turf-400">Tap the Share button, then <span className="text-white">Add to Home Screen</span>.</p>
        ) : (
          <p className="text-xs text-turf-400">Opens full-screen like an app.</p>
        )}
      </div>
      {installEvent && <button type="button" onClick={install} className="btn-primary btn-sm flex-shrink-0">Install</button>}
      <button type="button" onClick={dismiss} aria-label="Dismiss install prompt" className="btn-ghost btn-sm flex-shrink-0 !px-2">
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
}
