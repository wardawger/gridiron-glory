import { useState } from 'react';
import { WifiOff, AlertTriangle, RefreshCw } from 'lucide-react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

// Full-page fallback when the league couldn't be loaded at all. Without this,
// a failed load left the app with "no league" and it would offer the
// create-a-league flow to a user who simply had no connection.
export function LoadErrorScreen({ message, onRetry }: { message?: string | null; onRetry: () => void | Promise<unknown> }) {
  const online = useOnlineStatus();
  const [retrying, setRetrying] = useState(false);
  const retry = async () => { setRetrying(true); try { await onRetry(); } finally { setRetrying(false); } };
  const Icon = online ? AlertTriangle : WifiOff;
  return (
    <div className="min-h-dvh flex items-center justify-center px-6">
      <div className="max-w-sm text-center space-y-4">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-turf-800 border border-turf-700 flex items-center justify-center">
          <Icon className="w-7 h-7 text-amber-300" aria-hidden="true" />
        </div>
        <div className="space-y-1.5">
          <h1 className="font-display text-2xl tracking-wider text-white">
            {online ? "Couldn't load your league" : "You're offline"}
          </h1>
          <p className="text-sm text-turf-400">
            {online
              ? 'Something went wrong reaching the server. Your picks and standings are safe.'
              : 'Connect to the internet and Gridiron Glory will pick up where you left off.'}
          </p>
          {online && message && <p className="text-xs text-turf-600 break-words">{message}</p>}
        </div>
        <button type="button" onClick={retry} disabled={retrying} className="btn-primary">
          <RefreshCw className={`w-4 h-4 ${retrying ? 'animate-spin' : ''}`} aria-hidden="true" /> Try again
        </button>
      </div>
    </div>
  );
}
