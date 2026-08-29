import { useEffect, useState } from 'react';
import type { LiveGameStatus } from '../types';
import { fetchScoreboard } from '../services/cfbd';

const POLL_MS = 20_000;

// Only polls while `enabled` (the Scoreboard page being mounted) — unlike
// useCfbData's 30-minute background cycle, this hits CFBD's live endpoint
// on a much faster interval, so it stays scoped to the one page that
// actually needs it rather than running for every signed-in user all the
// time. Returns a Map keyed by lowercased team name; empty outside live
// windows (CFBD's /scoreboard only returns in-progress games).
export function useLiveScoreboard(enabled: boolean): Map<string, LiveGameStatus> {
  const [scoreboard, setScoreboard] = useState<Map<string, LiveGameStatus>>(new Map());

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const poll = async () => {
      const data = await fetchScoreboard();
      if (!cancelled) setScoreboard(data);
    };

    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [enabled]);

  return scoreboard;
}
