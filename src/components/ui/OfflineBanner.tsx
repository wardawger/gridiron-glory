import { useEffect, useRef, useState } from 'react';
import { WifiOff, Wifi } from 'lucide-react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

// Slim status strip under the header. Offline: says the data on screen may be
// stale. On reconnect: flashes "Back online" and asks the app to refresh so
// scores don't stay frozen at whatever loaded before the drop.
export function OfflineBanner({ onReconnect }: { onReconnect: () => void }) {
  const online = useOnlineStatus();
  const wasOffline = useRef(false);
  const [showBack, setShowBack] = useState(false);
  const onReconnectRef = useRef(onReconnect);
  onReconnectRef.current = onReconnect;

  useEffect(() => {
    if (!online) { wasOffline.current = true; setShowBack(false); return; }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    setShowBack(true);
    onReconnectRef.current();
    const t = setTimeout(() => setShowBack(false), 3000);
    return () => clearTimeout(t);
  }, [online]);

  if (online && !showBack) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-medium border-b ${
        online
          ? 'bg-field-900/60 border-field-800 text-field-300'
          : 'bg-amber-950/70 border-amber-900/60 text-amber-200'
      }`}
    >
      {online ? <Wifi className="w-3.5 h-3.5" aria-hidden="true" /> : <WifiOff className="w-3.5 h-3.5" aria-hidden="true" />}
      {online ? 'Back online — refreshing' : "You're offline — showing the last data loaded"}
    </div>
  );
}
