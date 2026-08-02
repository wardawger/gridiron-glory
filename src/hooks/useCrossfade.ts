import { useState, useRef, useEffect, useCallback } from 'react';

// Both hooks below share one rule: don't cut instantly between states —
// keep the outgoing content around just long enough to fade out, then
// swap. 120ms exit, matching content-fade-out in tailwind.config.js.
const EXIT_DURATION_MS = 120;

// For a small named set of mutually-exclusive views (tabs, toggle buttons):
// `active` changes the instant you call `select` (so the clicked control
// highlights immediately), but `panelClass(id)` keeps showing the outgoing
// panel — fading it out — for EXIT_DURATION_MS before the incoming one
// takes over and fades in. Callers keep every panel mounted (hidden via
// the class returned here) rather than conditionally rendering, so the
// swap has something to animate between.
export function useTabCrossfade<T extends string>(initial: T) {
  const [active, setActive] = useState<T>(initial);
  const [displayed, setDisplayed] = useState<T>(initial);
  const [exiting, setExiting] = useState(false);
  const activeRef = useRef(initial);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const select = useCallback((next: T) => {
    if (activeRef.current === next) return;
    activeRef.current = next;
    setActive(next);
    setExiting(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setDisplayed(next);
      setExiting(false);
    }, EXIT_DURATION_MS);
  }, []);

  const panelClass = useCallback((id: T) =>
    displayed === id ? (exiting ? 'animate-content-fade-out' : 'animate-content-fade-in') : 'hidden',
  [displayed, exiting]);

  return { active, select, panelClass };
}

// For a single boolean-gated panel (a settings sub-section revealed by a
// toggle): mirrors `visible` into `shown`, but delays flipping `shown` back
// to false by EXIT_DURATION_MS so the panel can fade out first instead of
// disappearing the instant the toggle flips. Callers still conditionally
// render on `shown` (not always-mounted) — a single optional panel doesn't
// need every state simultaneously in the tree the way a tab set does.
export function useCrossfadeVisibility(visible: boolean) {
  const [shown, setShown] = useState(visible);
  const [exiting, setExiting] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (visible) {
      setShown(true);
      setExiting(false);
      return;
    }
    setExiting(true);
    timeoutRef.current = setTimeout(() => {
      setShown(false);
      setExiting(false);
    }, EXIT_DURATION_MS);
  }, [visible]);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  return { shown, className: exiting ? 'animate-content-fade-out' : 'animate-content-fade-in' };
}
