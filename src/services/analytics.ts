import type { LeaderboardEntry, DraftPick } from '../types';

export interface RosterAnalytics {
  user_id: string;
  display_name: string;
  avg_rank: number;
  top25_avg: number;
  mid50_avg: number;
  bot25_avg: number;
  best_pick: { team_name: string; points: number } | null;
  worst_pick: { team_name: string; points: number } | null;
  best_team: { team_name: string; rank: number } | null;
  worst_team: { team_name: string; rank: number } | null;
  over_under_pts: number;
  over_under_avg: number;
  draft_pick_numbers: number[];
}

export interface UndraftedTeam {
  team_name: string;
  rank: number;
}

// Compute per-user analytics and undrafted top teams
export function computeAnalytics(
  entries: LeaderboardEntry[],
  draftPicks: DraftPick[],
  apRankings: { team_name: string; team_id?: string; rank: number }[],
): {
  analytics: RosterAnalytics[];
  undrafted: UndraftedTeam[];
} {
  const rankMap = new Map<string, number>(); // team_id → AP rank
  const rankByName = new Map<string, number>(); // team_name → AP rank
  apRankings.forEach(r => {
    if (r.team_id) rankMap.set(r.team_id, r.rank);
    rankByName.set(r.team_name.toLowerCase(), r.rank);
  });

  const draftedTeamIds = new Set(draftPicks.map(p => p.team_id));

  // Per-user total points per team (summed across all weeks)
  const teamPointsMap = new Map<string, Map<string, number>>(); // userId → teamId → pts
  entries.forEach(entry => {
    const tmap = new Map<string, number>();
    entry.weekly_scores.forEach(ws => {
      ws.breakdown.forEach(b => {
        tmap.set(b.team_id, (tmap.get(b.team_id) ?? 0) + b.points);
      });
    });
    teamPointsMap.set(entry.user_id, tmap);
  });

  const analytics: RosterAnalytics[] = entries.map(entry => {
    const roster = entry.roster;
    const pickMap = new Map(
      draftPicks.filter(p => p.user_id === entry.user_id).map(p => [p.team_id, p.pick_number])
    );
    const tmap = teamPointsMap.get(entry.user_id) ?? new Map();

    // Get AP rank for each team (lower = better)
    const teamRanks = roster.map(t => {
      const rank = rankMap.get(t.team_id)
        ?? rankByName.get(t.team_name.toLowerCase())
        ?? 999;
      return { team_id: t.team_id, team_name: t.team_name, rank };
    }).sort((a, b) => a.rank - b.rank);

    const n = teamRanks.length;
    const top25n  = Math.max(1, Math.ceil(n * 0.25));
    const bot25n  = Math.max(1, Math.ceil(n * 0.25));
    const mid50n  = Math.max(1, n - top25n - bot25n);

    const avg = (arr: number[]) => arr.length ? +(arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(1) : 0;

    const top25Ranks  = teamRanks.slice(0, top25n).map(t => t.rank);
    const mid50Ranks  = teamRanks.slice(top25n, top25n + mid50n).map(t => t.rank);
    const bot25Ranks  = teamRanks.slice(top25n + mid50n).map(t => t.rank);
    const allRanks    = teamRanks.map(t => t.rank).filter(r => r < 999);

    // Best/worst picks by total season points
    const teamPtsArr = roster.map(t => ({
      team_name: t.team_name,
      points: tmap.get(t.team_id) ?? 0,
    })).filter(t => t.points !== 0).sort((a, b) => b.points - a.points);

    // Over/under: sum of (pick_number - ap_rank) for all ranked teams
    let overUnderTotal = 0;
    let rankedCount = 0;
    roster.forEach(t => {
      const pickNum = pickMap.get(t.team_id);
      const apRank  = rankMap.get(t.team_id) ?? rankByName.get(t.team_name.toLowerCase());
      if (pickNum != null && apRank != null && apRank < 999) {
        overUnderTotal += pickNum - apRank;
        rankedCount++;
      }
    });

    return {
      user_id:      entry.user_id,
      display_name: entry.display_name,
      avg_rank:     avg(allRanks),
      top25_avg:    avg(top25Ranks),
      mid50_avg:    avg(mid50Ranks),
      bot25_avg:    avg(bot25Ranks),
      best_pick:    teamPtsArr[0] ?? null,
      worst_pick:   teamPtsArr[teamPtsArr.length - 1] ?? null,
      best_team:    teamRanks[0]?.rank < 999 ? teamRanks[0] : null,
      worst_team:   teamRanks[teamRanks.length - 1]?.rank < 999 ? teamRanks[teamRanks.length - 1] : null,
      over_under_pts: overUnderTotal,
      over_under_avg: rankedCount > 0 ? +(overUnderTotal / rankedCount).toFixed(1) : 0,
      draft_pick_numbers: roster.map(t => pickMap.get(t.team_id) ?? 0).filter(Boolean).sort((a, b) => a - b),
    };
  });

  // Best undrafted ranked teams
  const undrafted: UndraftedTeam[] = apRankings
    .filter(r => r.team_id && !draftedTeamIds.has(r.team_id))
    .slice(0, 10)
    .map(r => ({ team_name: r.team_name, rank: r.rank }));

  return { analytics, undrafted };
}

// Color scale: green (good) → yellow → red (bad), normalized to array
export function heatColor(value: number, allValues: number[], higherIsBetter: boolean): string {
  if (allValues.length === 0) return 'transparent';
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  if (min === max) return 'rgba(34,197,94,0.15)';
  const norm = (value - min) / (max - min); // 0 = min, 1 = max
  const score = higherIsBetter ? norm : 1 - norm; // 1 = best
  if (score >= 0.67) return 'rgba(34,197,94,0.20)';
  if (score >= 0.33) return 'rgba(251,191,36,0.18)';
  return 'rgba(239,68,68,0.20)';
}
