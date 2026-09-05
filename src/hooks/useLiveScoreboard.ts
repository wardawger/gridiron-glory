import { useEffect, useState } from 'react';
import { fetchScoreboard, type LiveScoreboardEntry } from '../services/cfbd';

const POLL_MS = 10_000;

// Only polls while `enabled` (the Scoreboard page being mounted) — unlike
// useCfbData's 30-minute background cycle, this hits CFBD's live endpoint
// on a much faster interval, so it stays scoped to the one page that
// actually needs it rather than running for every signed-in user all the
// time. Returns a Map keyed by lowercased team name to that team's entries
// (usually one, but can be more — see fetchScoreboard); empty outside live
// windows (CFBD's /scoreboard only returns in-progress games).
export function useLiveScoreboard(enabled: boolean): Map<string, LiveScoreboardEntry[]> {
  const [scoreboard, setScoreboard] = useState<Map<string, LiveScoreboardEntry[]>>(new Map());

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
