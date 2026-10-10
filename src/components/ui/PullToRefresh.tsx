import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';

const THRESHOLD = 70;
const MAX_PULL = 110;

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

// Pull-down-to-refresh for the installed app. Browsers supply their own in a
// normal tab, but a standalone PWA has none, so this fills the gap. Only
// engages when the page is scrolled to the very top and the touch isn't
// inside a horizontally/vertically scrollable inner region or an open dialog.
export function PullToRefresh({ onRefresh }: { onRefresh: () => void | Promise<unknown> }) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    if (!isStandalone()) return;

    const insideScroller = (el: EventTarget | null) => {
      let n = el as HTMLElement | null;
      while (n && n !== document.body) {
        if (n.getAttribute?.('role') === 'dialog') return true;
        const oy = getComputedStyle(n).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) return true;
        n = n.parentElement;
      }
      return false;
    };

    const onStart = (e: TouchEvent) => {
      if (window.scrollY > 0 || insideScroller(e.target)) { startY.current = null; return; }
      startY.current = e.touches[0].clientY;
    };
    const onMove = (e: TouchEvent) => {
      if (startY.current === null) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) { pullRef.current = 0; setPull(0); return; }
      pullRef.current = Math.min(MAX_PULL, dy * 0.5);
      setPull(pullRef.current);
    };
    const onEnd = async () => {
      const reached = pullRef.current >= THRESHOLD;
      startY.current = null;
      pullRef.current = 0;
      setPull(0);
      if (!reached) return;
      setRefreshing(true);
      try { await onRefreshRef.current(); } finally { setRefreshing(false); }
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  if (pull === 0 && !refreshing) return null;
  const offset = refreshing ? 48 : pull * 0.7;
  return (
    <div
      className="md:hidden fixed inset-x-0 z-30 flex justify-center pointer-events-none"
      style={{ top: 'calc(env(safe-area-inset-top) + 56px)', transform: `translateY(${offset}px)`, opacity: refreshing ? 1 : Math.min(1, pull / THRESHOLD) }}
      aria-hidden="true"
    >
      <div className="w-9 h-9 rounded-full bg-turf-800 border border-turf-700 shadow-lg flex items-center justify-center">
        <RefreshCw
          className={`w-4 h-4 text-field-400 ${refreshing ? 'animate-spin' : ''}`}
          style={refreshing ? undefined : { transform: `rotate(${pull * 3}deg)` }}
        />
      </div>
    </div>
  );
}
