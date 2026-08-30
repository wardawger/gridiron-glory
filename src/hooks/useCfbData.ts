import { useState, useEffect } from 'react';
import type { CfbTeam, GameData, APRanking, TeamSeasonStats, SpreadData, TeamRatings } from '../types';
import { fetchFbsTeams, fetchSeasonData, fetchRankings, fetchTeamRecords, fetchSeasonStats, fetchTeamRatings, fetchSpreads } from '../services/cfbd';
import { buildMockSeasonData, buildMockSeasonStats, MOCK_TEAMS } from '../services/mockSeasonData';

// Dev-only preview flag — never set in Netlify, so production always takes
// the real CFBD path. See src/services/mockSeasonData.ts.
const USE_MOCK_SEASON_DATA = import.meta.env.VITE_MOCK_SEASON_DATA === 'true';

interface CfbState {
  teams: CfbTeam[];
  gameData: GameData;
  rankings: APRanking[];
  records: Map<string, { wins: number; losses: number }>;
  seasonStats: Map<string, TeamSeasonStats>;
  teamRatings: Map<string, TeamRatings>;
  // spreadData[week] = map of teamId → locked spread (null if no line)
  spreadData: Record<number, SpreadData>;
  loading: boolean;
  // True once the very first load attempt (success or failure) has
  // finished, and never reset to false afterward — unlike `loading`, which
  // flips true again on every 30-minute auto-refresh/manual Refresh click.
  // `teams.length > 0` looks like a same-purpose check but isn't one:
  // teams resolves and is set well before gameData (they're sequential
  // fetches, not parallel), so there's a real window where teams is
  // populated but gameData is still {} — a consumer gating on teams.length
  // alone would treat that window as "loaded" and render real UI against
  // still-empty game data.
  hasLoadedOnce: boolean;
  error: string | null;
  refresh: () => void;
  refreshSpreads: (week: number) => Promise<void>;
}

// `enabled` gates every fetch on having a session. The CFBD proxy now
// requires an authenticated caller, and this hook mounts above the auth
// gate in App.tsx — without this it would fire on the login screen, take a
// row of 401s, and then never retry, because the effect's only other
// dependency is the 30-minute refresh tick. Passing auth state in means
// the load runs the moment a session appears. It also stops logged-out
// visitors from triggering a full season-data fetch they can't see.
export function useCfbData(enabled = true): CfbState {
  const [teams, setTeams]             = useState<CfbTeam[]>([]);
  const [gameData, setGameData]       = useState<GameData>({});
  const [rankings, setRankings]       = useState<APRanking[]>([]);
  const [records, setRecords]         = useState<Map<string, { wins: number; losses: number }>>(new Map());
  const [seasonStats, setSeasonStats] = useState<Map<string, TeamSeasonStats>>(new Map());
  const [teamRatings, setTeamRatings] = useState<Map<string, TeamRatings>>(new Map());
  const [spreadData, setSpreadData]   = useState<Record<number, SpreadData>>({});
  const [loading, setLoading]         = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [tick, setTick]               = useState(0);

  useEffect(() => {
    if (!enabled) {
      // Not an error state and not perpetually "loading" — there's just
      // nothing to fetch until someone signs in.
      setLoading(false);
      setHasLoadedOnce(true);
      return;
    }
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        if (USE_MOCK_SEASON_DATA) {
          // Skip fetchFbsTeams() entirely — it depends on the Netlify
          // Function proxy, which doesn't exist under plain `vite dev`, so
          // it would just return an empty list locally. Use a bundled real
          // team roster instead so mock games/ratings have something to
          // attach to.
          const t = MOCK_TEAMS;
          if (cancelled) return;
          setTeams(t);
          const mock = buildMockSeasonData(t);
          setGameData(mock.gameData);
          setRankings(mock.rankings);
          setRecords(mock.records);
          setSeasonStats(buildMockSeasonStats(t));
          setTeamRatings(new Map());
          return;
        }

        const t = await fetchFbsTeams();
        if (cancelled) return;
        setTeams(t);
        const gd = await fetchSeasonData(t);
        if (cancelled) return;
        const [rk, rec, stats, ratings] = await Promise.all([
          fetchRankings(t),
          fetchTeamRecords(),
          fetchSeasonStats(t),
          fetchTeamRatings(t, gd),
        ]);
        if (cancelled) return;
        setGameData(gd);
        setRankings(rk);
        setRecords(rec);
        setSeasonStats(stats);
        setTeamRatings(ratings);
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? 'Failed to load CFB data');
      } finally {
        if (!cancelled) {
          setLoading(false);
          setHasLoadedOnce(true);
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [tick, enabled]);

  // Auto-refresh every 30 minutes
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch spreads for a specific week on demand (called by RosterView when spread feature is on)
  const refreshSpreads = async (week: number) => {
    if (!teams.length) return;
    try {
      const now = new Date();
      const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
      const data = await fetchSpreads(teams, year, week, gameData);
      setSpreadData(prev => ({ ...prev, [week]: data }));
    } catch (e) {
      console.warn('[CFB] Failed to fetch spreads:', e);
    }
  };

  return {
    teams, gameData, rankings, records, seasonStats, teamRatings, spreadData,
    loading, hasLoadedOnce, error,
    refresh: () => setTick(t => t + 1),
    refreshSpreads,
  };
}
