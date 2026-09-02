import type { LeaderboardEntry, DraftPick, LeagueMember, RosterEntry, StatRankingBonus, StatBonusCategory } from '../types';
import { STAT_BONUS_CATEGORIES, STAT_BONUS_LABELS } from '../types';

export interface RosterAnalytics {
  user_id: string;
  display_name: string;
  avg_rank: number;
  top25_avg: number;
  bot25_avg: number;
  best_pick: { team_name: string; team_logo: string; points: number } | null;
  worst_pick: { team_name: string; team_logo: string; points: number } | null;
  best_team: { team_name: string; team_logo: string; rank: number } | null;
  worst_team: { team_name: string; team_logo: string; rank: number } | null;
  over_under_pts: number;
  over_under_avg: number;
  draft_pick_numbers: number[];
  wins: number;
  losses: number;
  captain_actual: number;
  captain_optimal: number;
  captain_efficiency: number | null; // % of best-possible captain bonus actually captured
}

export interface UndraftedTeam {
  team_id: string;
  team_name: string;
  rank: number;
}

export interface DraftValuePoint {
  team_name: string;
  team_logo: string;
  pick_number: number;
  rank: number;
  display_name: string;
  user_id: string;
}

// Compute per-user analytics and undrafted top teams
export function computeAnalytics(
  entries: LeaderboardEntry[],
  draftPicks: DraftPick[],
  apRankings: { team_name: string; team_id?: string; rank: number }[],
): {
  analytics: RosterAnalytics[];
  undrafted: UndraftedTeam[];
  scatterPoints: DraftValuePoint[];
} {
  const scatterPoints: DraftValuePoint[] = [];
  const rankMap = new Map<string, number>(); // team_id → AP rank
  const rankByName = new Map<string, number>(); // team_name → AP rank
  apRankings.forEach(r => {
    if (r.team_id) rankMap.set(r.team_id, r.rank);
    rankByName.set(r.team_name.toLowerCase(), r.rank);
  });

  // Currently-rostered team ids (draft + free agency swaps), not just original draft picks
  const draftedTeamIds = new Set(entries.flatMap(e => e.roster.map(t => t.team_id)));

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
      return { team_id: t.team_id, team_name: t.team_name, team_logo: t.team_logo, rank };
    }).sort((a, b) => a.rank - b.rank);

    // Unranked teams carry the 999 sentinel — exclude them before slicing
    // into quartiles, or they sort into the "bottom 25%" and drag averages
    // toward 999 (e.g. a "999.0" Bottom 25% Rank for a lightly-ranked roster).
    const rankedTeams = teamRanks.filter(t => t.rank < 999);
    const rn = rankedTeams.length;
    const top25n = Math.max(1, Math.ceil(rn * 0.25));
    const bot25n = Math.max(1, Math.ceil(rn * 0.25));

    const avg = (arr: number[]) => arr.length ? +(arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(1) : 0;

    const top25Ranks = rankedTeams.slice(0, top25n).map(t => t.rank);
    const bot25Ranks = rankedTeams.slice(rn - bot25n).map(t => t.rank);
    const allRanks    = rankedTeams.map(t => t.rank);

    // Best/worst picks by total season points
    const teamPtsArr = roster.map(t => ({
      team_name: t.team_name,
      team_logo: t.team_logo,
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
        scatterPoints.push({
          team_name: t.team_name, team_logo: t.team_logo, pick_number: pickNum, rank: apRank,
          display_name: entry.display_name, user_id: entry.user_id,
        });
      }
    });

    // Win/loss record across every completed game any rostered team played this season
    let wins = 0, losses = 0;
    // Captain efficiency: actual captain bonus captured vs. the best possible each week
    // (highest-scoring eligible team), ignoring the twice-per-team season cap.
    let captainActual = 0;
    let captainOptimal = 0;
    entry.weekly_scores.forEach(ws => {
      let weekBest = -Infinity;
      let hasGame = false;
      ws.breakdown.forEach(b => {
        if (!b.game?.completed) return;
        if (b.game.result === 'W') wins++;
        else if (b.game.result === 'L') losses++;

        const gamePts  = b.points - b.spread_points;
        const basePts  = b.is_captain ? gamePts / 2 : gamePts;
        hasGame = true;
        if (basePts > weekBest) weekBest = basePts;
        if (b.is_captain) captainActual += basePts;
      });
      if (hasGame) captainOptimal += Math.max(weekBest, 0);
    });
    const captainEfficiency = captainOptimal > 0 ? Math.round((captainActual / captainOptimal) * 100) : null;

    return {
      user_id:      entry.user_id,
      display_name: entry.display_name,
      avg_rank:     avg(allRanks),
      top25_avg:    avg(top25Ranks),
      bot25_avg:    avg(bot25Ranks),
      best_pick:    teamPtsArr[0] ?? null,
      worst_pick:   teamPtsArr[teamPtsArr.length - 1] ?? null,
      best_team:    rankedTeams[0] ?? null,
      worst_team:   rankedTeams[rankedTeams.length - 1] ?? null,
      over_under_pts: overUnderTotal,
      over_under_avg: rankedCount > 0 ? +(overUnderTotal / rankedCount).toFixed(1) : 0,
      draft_pick_numbers: roster.map(t => pickMap.get(t.team_id) ?? 0).filter(Boolean).sort((a, b) => a - b),
      wins, losses,
      captain_actual: captainActual,
      captain_optimal: captainOptimal,
      captain_efficiency: captainEfficiency,
    };
  });

  // Best undrafted ranked teams
  const undrafted: UndraftedTeam[] = apRankings
    .filter(r => r.team_id && !draftedTeamIds.has(r.team_id))
    .slice(0, 10)
    .map(r => ({ team_id: r.team_id!, team_name: r.team_name, rank: r.rank }));

  return { analytics, undrafted, scatterPoints };
}

// ─── Statistical bonus board (Top 3 / Bottom 3 per category) ──────────────

export interface StatBoardEntry {
  team_id: string;
  team_name: string;
  team_logo: string;
  owner_name: string;
  rank: number;
  value: number;
  points: number;
}

export interface StatCategoryBoard {
  stat: StatBonusCategory;
  label: string;
  top: StatBoardEntry[];
  bottom: StatBoardEntry[];
}

// Reshapes calcStatRankingBonuses' per-user output into per-category
// leaderboards, so the UI can show *why* a bonus was awarded, not just
// the lump sum.
export function buildStatBonusBoard(
  statBonusesByUser: Map<string, StatRankingBonus[]>,
  rosters: Map<string, RosterEntry[]>,
  members: LeagueMember[],
): StatCategoryBoard[] {
  const memberName = (uid: string) => members.find(m => m.user_id === uid)?.display_name ?? 'Unknown';

  const boards = new Map<string, StatCategoryBoard>(
    STAT_BONUS_CATEGORIES.map(stat => [stat, { stat, label: STAT_BONUS_LABELS[stat], top: [], bottom: [] }])
  );

  statBonusesByUser.forEach((bonuses, userId) => {
    const roster = rosters.get(userId) ?? [];
    bonuses.forEach(b => {
      const board = boards.get(b.stat);
      if (!board) return;
      const team = roster.find(t => t.team_id === b.team_id);
      const entry: StatBoardEntry = {
        team_id:    b.team_id,
        team_name:  b.team_name,
        team_logo:  team?.team_logo ?? '',
        owner_name: memberName(userId),
        rank:       b.rank,
        value:      b.value,
        points:     b.points,
      };
      (b.points > 0 ? board.top : board.bottom).push(entry);
    });
  });

  boards.forEach(board => {
    board.top.sort((a, b) => a.rank - b.rank);
    board.bottom.sort((a, b) => a.rank - b.rank);
  });

  return STAT_BONUS_CATEGORIES.map(stat => boards.get(stat)!);
}

// Color scale: green (good) → yellow → red (bad), normalized to array
// Where a value sits inside a metric's own absolute domain, 0 (worst) to
// 1 (best). Absolute rather than min-max across the current league: relative
// scaling guaranteed exactly one "red" and one "green" manager no matter how
// close the real numbers were, so a 0.3 difference in average AP rank
// rendered as an alarm. It also let a sentinel 0 for "no ranked teams" score
// above everyone. Domains mirror the ones radarData already uses.
export type MetricTier = 'good' | 'mid' | 'poor' | 'none';

export function scalePosition(
  value: number | null | undefined,
  domain: [number, number],
): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const [worst, best] = domain;
  if (worst === best) return null;
  const pct = (value - worst) / (best - worst);
  return Math.max(0, Math.min(1, pct));
}

export function tierFor(
  value: number | null | undefined,
  domain: [number, number],
): MetricTier {
  const pos = scalePosition(value, domain);
  if (pos === null) return 'none';
  if (pos >= 0.67) return 'good';
  if (pos >= 0.33) return 'mid';
  return 'poor';
}
