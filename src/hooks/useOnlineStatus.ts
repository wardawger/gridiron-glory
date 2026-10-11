import { useEffect, useState } from 'react';

// Tracks navigator.onLine. The flag only reports "no network interface", not
// "server reachable", so it's a hint for UI copy rather than a guarantee.
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}
