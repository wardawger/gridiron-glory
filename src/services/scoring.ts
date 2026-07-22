import type {
  ScoringSettings, GameResult, WeeklyScore, ScoreBreakdown,
  LeaderboardEntry, LeagueMember, RosterEntry, CaptainPick,
  GameData, ManualBonus, TeamSeasonStats, StatRankingBonus,
  SpreadPick, DraftPick, FreeAgencyMove,
} from '../types';
import { STAT_BONUS_CATEGORIES, normalizeScoring } from '../types';
import { rosterAtWeek, currentRosters } from './roster';

export { P4_CONFERENCES, DRAFT_CONF_MIN, DRAFT_CONF_MAX } from '../types';

export function scoreGame(
  game: GameResult,
  settings: ScoringSettings,
  isCaptain: boolean,
): number {
  if (!game.result || !game.completed) return 0;

  let pts = 0;
  if (game.result === 'W') {
    pts += settings.win;
    if (game.opponent_rank != null) {
      pts += settings.win_ranked;
      if (game.opponent_rank <= 15) pts += settings.win_top15;
      if (game.opponent_rank <= 5)  pts += settings.win_top5;
    }
  } else {
    pts += settings.loss;
    if (game.is_g5_opponent) pts += settings.loss_g5;
  }

  return isCaptain ? pts * 2 : pts;
}

// ── Spread scoring ────────────────────────────────────────────────────────
// Determines if a team covered the spread given the final score.
// lockedSpread: negative = team is favored (must win by more than |spread|)
//               positive = team is underdog (can lose by less than spread or win)
// Returns true if covered, false if missed, null if game not complete.

export function didCoverSpread(
  game: GameResult,
  lockedSpread: number,
  isHome: boolean,
): boolean | null {
  if (!game.completed || game.home_score == null || game.away_score == null) return null;

  const homeMargin = game.home_score - game.away_score;
  const teamMargin = isHome ? homeMargin : -homeMargin;

  // Team covers if: actual margin > -lockedSpread
  // e.g. spread = -7 (favored by 7): must win by more than 7 → margin > 7
  // e.g. spread = +3 (underdog by 3): can lose by less than 3 → margin > -3
  return teamMargin > -lockedSpread;
}

export function scoreSpread(
  game: GameResult,
  settings: ScoringSettings,
  lockedSpread: number,
  isHome: boolean,
  baseGamePoints: number, // pre-captain base points for multiplier mode
): number {
  const covered = didCoverSpread(game, lockedSpread, isHome);
  if (covered === null) return 0; // game not complete yet

  if (settings.spread_is_multiplier) {
    // Multiplier mode: earn/lose a fraction of base game points
    const bonus = Math.round(Math.abs(baseGamePoints) * (settings.spread_points - 1));
    return covered ? bonus : -bonus;
  } else {
    // Flat points mode
    return covered ? settings.spread_points : -settings.spread_points;
  }
}

export function calcWeeklyScore(
  userId: string,
  week: number,
  roster: RosterEntry[],
  captainPicks: CaptainPick[],
  gameData: GameData,
  settings: ScoringSettings,
  spreadPicks: SpreadPick[] = [],
  freeAgencyMoves: FreeAgencyMove[] = [],
): WeeklyScore {
  const captainPick = captainPicks.find(
    p => p.user_id === userId && p.week === week
  );
  const captainTeamId = captainPick?.team_id ?? null;

  const weekSpreadPicks = spreadPicks.filter(
    p => p.user_id === userId && p.week === week
  );
  const spreadTeamIds = weekSpreadPicks.map(p => p.team_id);

  const breakdown: ScoreBreakdown[] = roster.map(entry => {
    const game      = gameData[entry.team_id]?.[week] ?? null;
    const isCaptain = entry.team_id === captainTeamId;
    const gamePts   = game ? scoreGame(game, settings, isCaptain) : 0;

    // Spread points for this team this week
    let spreadPts = 0;
    if (settings.spread_enabled && game) {
      const spreadPick = weekSpreadPicks.find(p => p.team_id === entry.team_id);
      if (spreadPick) {
        // If commissioner already resolved it, use stored points
        if (spreadPick.points !== null && spreadPick.result !== null) {
          spreadPts = spreadPick.points;
        } else {
          // Auto-score from game data
          const baseGamePts = game ? scoreGame(game, settings, false) : 0;
          const isHome = (game as any).is_home ?? true;
          spreadPts = scoreSpread(game, settings, spreadPick.locked_spread, isHome, baseGamePts);
        }
      }
    }

    return {
      team_id:      entry.team_id,
      team_name:    entry.team_name,
      points:       gamePts + spreadPts,
      is_captain:   isCaptain,
      spread_points: spreadPts,
      game,
    };
  });

  const faPoints = freeAgencyMoves
    .filter(m => m.user_id === userId && m.week === week)
    .reduce((s, m) => s + m.penalty_points, 0);

  return {
    user_id:         userId,
    week,
    points:          breakdown.reduce((s, b) => s + b.points, 0) + faPoints,
    captain_team_id: captainTeamId,
    spread_team_ids: spreadTeamIds,
    breakdown,
    fa_points:       faPoints,
  };
}

// ─── Stat ranking bonuses ─────────────────────────────────────────────────

const TOP_N = 3;

export function calcStatRankingBonuses(
  rosters: Map<string, RosterEntry[]>,
  seasonStats: Map<string, TeamSeasonStats>,
  isPreview: boolean,
  rawSettings: ScoringSettings,
): Map<string, StatRankingBonus[]> {
  const settings = normalizeScoring(rawSettings);
  const allDraftedIds = new Set<string>();
  rosters.forEach(roster => roster.forEach(t => allDraftedIds.add(t.team_id)));

  const result = new Map<string, StatRankingBonus[]>();
  rosters.forEach((_, userId) => result.set(userId, []));

  for (const stat of STAT_BONUS_CATEGORIES) {
    const topOn = settings.stat_bonus_top3_enabled && settings.stat_bonus_top3_categories[stat];
    const botOn = settings.stat_bonus_bottom3_enabled && settings.stat_bonus_bottom3_categories[stat];
    if (!topOn && !botOn) continue;

    const ranked = Array.from(allDraftedIds)
      .map(id => ({ id, val: seasonStats.get(id)?.[stat] ?? null }))
      .filter(x => x.val !== null)
      .sort((a, b) => (b.val as number) - (a.val as number));

    const total = ranked.length;
    const statPoints = settings.stat_bonus_points[stat];

    ranked.forEach((entry, idx) => {
      const rank = idx + 1;
      const isTop = rank <= TOP_N;
      const isBot = !isTop && rank > total - TOP_N;
      if (isTop && !topOn) return;
      if (isBot && !botOn) return;
      if (!isTop && !isBot) return;

      const pts = isTop ? statPoints : -statPoints;

      rosters.forEach((roster, userId) => {
        const team = roster.find(t => t.team_id === entry.id);
        if (!team) return;

        result.get(userId)!.push({
          team_id:   entry.id,
          team_name: team.team_name,
          stat,
          rank,
          points:    pts,
          value:     entry.val as number,
          isPreview,
        });
      });
    });
  }

  return result;
}

export function buildLeaderboard(
  members: LeagueMember[],
  draftPicks: DraftPick[],
  captainPicks: CaptainPick[],
  gameData: GameData,
  settings: ScoringSettings,
  manualBonuses: ManualBonus[],
  seasonStats: Map<string, TeamSeasonStats>,
  confChampComplete: boolean,
  spreadPicks: SpreadPick[] = [],
  freeAgencyMoves: FreeAgencyMove[] = [],
  currentWeek = 0,
  totalWeeks = 17,
): LeaderboardEntry[] {
  const rosters = currentRosters(members, draftPicks, freeAgencyMoves, currentWeek);
  const statBonuses = calcStatRankingBonuses(rosters, seasonStats, !confChampComplete, settings);

  return members
    .map(member => {
      const roster = rosters.get(member.user_id) ?? [];
      const weekly: WeeklyScore[] = [];

      for (let w = 0; w <= totalWeeks; w++) {
        const weekRoster = rosterAtWeek(member.user_id, w, draftPicks, freeAgencyMoves);
        weekly.push(calcWeeklyScore(
          member.user_id, w, weekRoster, captainPicks, gameData, settings, spreadPicks, freeAgencyMoves
        ));
      }

      const weeklyTotal = weekly.reduce((s, w) => s + w.points, 0);
      const bonusPoints = manualBonuses
        .filter(b => b.user_id === member.user_id)
        .reduce((s, b) => s + b.points, 0);
      const statPoints = (statBonuses.get(member.user_id) ?? [])
        .reduce((s, b) => s + b.points, 0);

      return {
        user_id:       member.user_id,
        display_name:  member.display_name,
        total_points:  weeklyTotal + bonusPoints + statPoints,
        weekly_scores: weekly,
        bonus_points:  bonusPoints,
        stat_bonuses:  statBonuses.get(member.user_id) ?? [],
        stat_points:   statPoints,
        roster,
      };
    })
    .sort((a, b) => b.total_points - a.total_points);
}

export function getPickOwner(pickNumber: number, draftOrder: string[]): string {
  const n = draftOrder.length;
  if (n === 0) return '';
  const idx = pickNumber - 1;
  const round = Math.floor(idx / n);
  const posInRound = idx % n;
  const seat = round % 2 === 0 ? posInRound : n - 1 - posInRound;
  return draftOrder[seat];
}

export function totalPicksForRounds(rounds: number, players: number): number {
  return rounds * players;
}
