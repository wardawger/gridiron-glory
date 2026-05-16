import { useState, useEffect } from 'react';
import type { CfbTeam, GameData, APRanking, TeamSeasonStats, SpreadData } from '../types';
import { fetchFbsTeams, fetchSeasonData, fetchRankings, fetchTeamRecords, fetchSeasonStats, fetchSpreads } from '../services/cfbd';

interface CfbState {
  teams: CfbTeam[];
  gameData: GameData;
  rankings: APRanking[];
  records: Map<string, { wins: number; losses: number }>;
  seasonStats: Map<string, TeamSeasonStats>;
  // spreadData[week] = map of teamId → locked spread (null if no line)
  spreadData: Record<number, SpreadData>;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  refreshSpreads: (week: number) => Promise<void>;
}

export function useCfbData(): CfbState {
  const [teams, setTeams]             = useState<CfbTeam[]>([]);
  const [gameData, setGameData]       = useState<GameData>({});
  const [rankings, setRankings]       = useState<APRanking[]>([]);
  const [records, setRecords]         = useState<Map<string, { wins: number; losses: number }>>(new Map());
  const [seasonStats, setSeasonStats] = useState<Map<string, TeamSeasonStats>>(new Map());
  const [spreadData, setSpreadData]   = useState<Record<number, SpreadData>>({});
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [tick, setTick]               = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const t = await fetchFbsTeams();
        if (cancelled) return;
        setTeams(t);
        const [gd, rk, rec, stats] = await Promise.all([
          fetchSeasonData(t),
          fetchRankings(t),
          fetchTeamRecords(),
          fetchSeasonStats(t),
        ]);
        if (cancelled) return;
        setGameData(gd);
        setRankings(rk);
        setRecords(rec);
        setSeasonStats(stats);
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? 'Failed to load CFB data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [tick]);

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
      const data = await fetchSpreads(teams, year, week);
      setSpreadData(prev => ({ ...prev, [week]: data }));
    } catch (e) {
      console.warn('[CFB] Failed to fetch spreads:', e);
    }
  };

  return {
    teams, gameData, rankings, records, seasonStats, spreadData,
    loading, error,
    refresh: () => setTick(t => t + 1),
    refreshSpreads,
  };
}
