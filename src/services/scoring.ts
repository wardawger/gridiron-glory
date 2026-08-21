import type {
  ScoringSettings, GameResult, WeeklyScore, ScoreBreakdown,
  LeaderboardEntry, LeagueMember, RosterEntry, CaptainPick,
  GameData, ManualBonus, TeamSeasonStats, StatRankingBonus,
  SpreadPick, DraftPick, FreeAgencyMove, ScoreCorrection, BenchPick,
} from '../types';
import { STAT_BONUS_CATEGORIES, normalizeScoring } from '../types';
import { rosterAtWeek, currentRosters } from './roster';

export { P4_CONFERENCES } from '../types';
import { P4_CONFERENCES as P4_CONF_LIST } from '../types';

export function isP4Conference(conference: string): boolean {
  return (P4_CONF_LIST as readonly string[]).includes(conference);
}

// Every non-P4 conference shares one combined G5 limit rather than each
// having its own — this collapses any non-P4 conference name to the 'G5'
// bucket so callers can track counts/minimums per category uniformly.
export function confCategory(conference: string): string {
  return isP4Conference(conference) ? conference : 'G5';
}

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
// Determines whether the team covered, missed, or pushed the spread given
// the final score. lockedSpread: negative = team is favored (must win by
// more than |spread|); positive = team is underdog (can lose by less than
// spread or win). Returns null if the game isn't complete yet.

export function getSpreadOutcome(
  game: GameResult,
  lockedSpread: number,
  isHome: boolean,
): 'covered' | 'missed' | 'push' | null {
  if (!game.completed || game.home_score == null || game.away_score == null) return null;

  const homeMargin = game.home_score - game.away_score;
  const teamMargin = isHome ? homeMargin : -homeMargin;

  // A push is an exact tie against the line (only possible with an integer
  // spread) — actual margin equals -lockedSpread precisely.
  // e.g. spread = -7 (favored by 7): margin > 7 covers, margin === 7 pushes.
  if (teamMargin === -lockedSpread) return 'push';
  return teamMargin > -lockedSpread ? 'covered' : 'missed';
}

// Whether a pick won its bet — shared by live scoring and anything else
// (e.g. trophy computation) that needs to know win/loss without
// duplicating the cover/against flip. Only meaningful for a decided
// (non-push) outcome; callers must exclude 'push' themselves.
export function didWinSpreadPick(
  side: 'cover' | 'against',
  outcome: 'covered' | 'missed',
): boolean {
  return side === 'cover' ? outcome === 'covered' : outcome === 'missed';
}

export function scoreSpread(
  game: GameResult,
  settings: ScoringSettings,
  lockedSpread: number,
  isHome: boolean,
  baseGamePoints: number, // pre-captain base points for multiplier mode
  side: 'cover' | 'against' = 'cover',
): number {
  const outcome = getSpreadOutcome(game, lockedSpread, isHome);
  if (outcome === null) return 0; // game not complete yet
  if (outcome === 'push') return 0; // push: no points awarded or taken, either side

  const won = didWinSpreadPick(side, outcome);

  // Commissioner-overridden flat penalty on a loss, independent of flat vs
  // multiplier mode. Off by default — with the toggle off, a loss costs
  // exactly what it always has (the negated win reward, below).
  if (!won && settings.spread_miss_penalty_enabled) {
    return -Math.abs(settings.spread_miss_penalty_points);
  }

  if (settings.spread_is_multiplier) {
    // Multiplier mode: earn/lose a fraction of base game points
    const bonus = Math.round(Math.abs(baseGamePoints) * (settings.spread_points - 1));
    return won ? bonus : -bonus;
  } else {
    // Flat points mode
    return won ? settings.spread_points : -settings.spread_points;
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
  scoreCorrections: ScoreCorrection[] = [],
  benchPicks: BenchPick[] = [],
): WeeklyScore {
  const captainPick = captainPicks.find(
    p => p.user_id === userId && p.week === week
  );
  const captainTeamId = captainPick?.team_id ?? null;

  const weekSpreadPicks = spreadPicks.filter(
    p => p.user_id === userId && p.week === week
  );
  const spreadTeamIds = weekSpreadPicks.map(p => p.team_id);

  const weekBenchTeamIds = new Set(
    benchPicks.filter(p => p.user_id === userId && p.week === week).map(p => p.team_id)
  );

  const breakdown: ScoreBreakdown[] = roster.map(entry => {
    const game      = gameData[entry.team_id]?.[week] ?? null;
    const isCaptain = entry.team_id === captainTeamId;
    // A benched team never scores, regardless of captain status or spread
    // pick — bench overrides both rather than needing separate validation
    // to keep a benched team from also being captain/spread-picked.
    const isBenched = settings.bench_enabled && weekBenchTeamIds.has(entry.team_id);
    const gamePts   = (game && !isBenched) ? scoreGame(game, settings, isCaptain) : 0;

    // Spread points for this team this week
    let spreadPts = 0;
    if (settings.spread_enabled && game && !isBenched) {
      const spreadPick = weekSpreadPicks.find(p => p.team_id === entry.team_id);
      if (spreadPick) {
        // If commissioner already resolved it, use stored points
        if (spreadPick.points !== null && spreadPick.result !== null) {
          spreadPts = spreadPick.points;
        } else {
          // Auto-score from game data
          const baseGamePts = game ? scoreGame(game, settings, false) : 0;
          const isHome = (game as any).is_home ?? true;
          spreadPts = scoreSpread(game, settings, spreadPick.locked_spread, isHome, baseGamePts, spreadPick.side ?? 'cover');
        }
      }
    }

    return {
      team_id:      entry.team_id,
      team_name:    entry.team_name,
      points:       gamePts + spreadPts,
      is_captain:   isCaptain,
      is_benched:   isBenched,
      spread_points: spreadPts,
      game,
    };
  });

  const faPoints = freeAgencyMoves
    .filter(m => m.user_id === userId && m.week === week)
    .reduce((s, m) => s + m.penalty_points, 0);

  const correctionPoints = scoreCorrections
    .filter(c => c.user_id === userId && c.week === week)
    .reduce((s, c) => s + c.points, 0);

  return {
    user_id:         userId,
    week,
    points:          breakdown.reduce((s, b) => s + b.points, 0) + faPoints + correctionPoints,
    captain_team_id: captainTeamId,
    spread_team_ids: spreadTeamIds,
    bench_team_ids:  Array.from(weekBenchTeamIds),
    breakdown,
    fa_points:       faPoints,
    correction_points: correctionPoints,
  };
}

// ─── Stat ranking bonuses ─────────────────────────────────────────────────

export function calcStatRankingBonuses(
  rosters: Map<string, RosterEntry[]>,
  seasonStats: Map<string, TeamSeasonStats>,
  isPreview: boolean,
  rawSettings: ScoringSettings,
): Map<string, StatRankingBonus[]> {
  const settings = normalizeScoring(rawSettings);
  const result = new Map<string, StatRankingBonus[]>();
  rosters.forEach((_, userId) => result.set(userId, []));

  if (!settings.stat_bonus_enabled) return result;

  const allDraftedIds = new Set<string>();
  rosters.forEach(roster => roster.forEach(t => allDraftedIds.add(t.team_id)));

  for (const stat of STAT_BONUS_CATEGORIES) {
    const cat = settings.stat_bonus_categories[stat];
    if (!cat.top_enabled && !cat.bottom_enabled) continue;

    const ranked = Array.from(allDraftedIds)
      .map(id => ({ id, val: seasonStats.get(id)?.[stat] ?? null }))
      .filter(x => x.val !== null)
      .sort((a, b) => (b.val as number) - (a.val as number));

    const total = ranked.length;

    ranked.forEach((entry, idx) => {
      const rank = idx + 1;
      const isTop = cat.top_enabled && rank <= cat.top_count;
      const isBot = !isTop && cat.bottom_enabled && rank > total - cat.bottom_count;
      if (!isTop && !isBot) return;

      const pts = isTop ? cat.top_points : cat.bottom_points;

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
  scoreCorrections: ScoreCorrection[] = [],
  currentWeek = 0,
  totalWeeks = 17,
  benchPicks: BenchPick[] = [],
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
          member.user_id, w, weekRoster, captainPicks, gameData, settings, spreadPicks, freeAgencyMoves, scoreCorrections, benchPicks
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
        avatar_type:   member.avatar_type,
        avatar_value:  member.avatar_value,
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
