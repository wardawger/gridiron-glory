import { Bell, Loader2 } from 'lucide-react';
import { usePushNotifications, type PushKind } from '../../hooks/usePushNotifications';

const OPTIONS: { kind: PushKind; label: string; hint: string }[] = [
  { kind: 'scores', label: 'Final scores', hint: 'When a game for one of your teams ends' },
  { kind: 'captain', label: 'Captain reminder', hint: "Game day, if you haven't set your captain" },
  { kind: 'bets', label: 'Bets reminder', hint: 'Leagues with spread betting, if picks are open' },
  { kind: 'lineup', label: 'Lineup reminder', hint: "Leagues with a bench, if starters aren't set" },
];

export function NotificationSettings({ userId }: { userId: string }) {
  const push = usePushNotifications(userId);

  return (
    <div className="card p-5 space-y-4">
      <h3 className="font-medium text-white text-sm flex items-center gap-2">
        <Bell className="w-4 h-4 text-field-400" aria-hidden="true" /> Notifications
      </h3>

      {push.state === 'needs-install' && (
        <p className="text-sm text-turf-400">
          On iPhone and iPad, notifications work once Gridiron Glory is added to your home screen. Install it, open it from there, and come back here.
        </p>
      )}
      {push.state === 'unsupported' && (
        <p className="text-sm text-turf-400">This browser doesn&rsquo;t support push notifications.</p>
      )}
      {push.state === 'unconfigured' && (
        <p className="text-sm text-turf-400">Notifications aren&rsquo;t configured for this deployment yet.</p>
      )}

      {push.state === 'ready' && (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-turf-300">
              {push.subscribed ? 'On for this device.' : push.permission === 'denied' ? 'Blocked in device settings.' : 'Off for this device.'}
            </p>
            <div className="flex gap-2">
              {push.subscribed && (
                <button type="button" className="btn-ghost btn-sm" onClick={push.sendTest}>Send test</button>
              )}
              <button
                type="button"
                className={push.subscribed ? 'btn-ghost btn-sm' : 'btn-primary btn-sm'}
                disabled={push.busy || push.permission === 'denied'}
                onClick={push.subscribed ? push.disable : push.enable}
              >
                {push.busy && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
                {push.subscribed ? 'Turn off' : 'Turn on'}
              </button>
            </div>
          </div>

          <ul className="divide-y divide-turf-800">
            {OPTIONS.map(({ kind, label, hint }) => (
              <li key={kind} className="flex items-center justify-between gap-3 py-2.5">
                <label htmlFor={`push-${kind}`} className="min-w-0 flex-1">
                  <span className="block text-sm text-white">{label}</span>
                  <span className="block text-xs text-turf-500">{hint}</span>
                </label>
                <input
                  id={`push-${kind}`}
                  type="checkbox"
                  className="w-5 h-5 accent-field-500 flex-shrink-0"
                  checked={push.prefs[kind]}
                  onChange={e => push.setPref(kind, e.target.checked)}
                />
              </li>
            ))}
          </ul>
        </>
      )}

      {push.error && <p className="text-sm text-red-400" role="alert">{push.error}</p>}
    </div>
  );
}
