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

// What a captain pick was worth before the multiplier was configurable.
// Rows from that era carry no locked_multiplier and must keep scoring at 2.
export const LEGACY_CAPTAIN_MULTIPLIER = 2;

export function scoreGame(
  game: GameResult,
  settings: ScoringSettings,
  isCaptain: boolean,
  // Multiplier actually in force for this pick. calcWeeklyScore passes the
  // value frozen onto the pick when it was made; other callers get the
  // league's current setting.
  captainMultiplier?: number,
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

  if (!isCaptain) return pts;
  return pts * (captainMultiplier ?? settings.captain_multiplier ?? LEGACY_CAPTAIN_MULTIPLIER);
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

  return spreadPointsForOutcome(settings, side, outcome, baseGamePoints);
}

// Points a pick earns for a known (decided or pushed) outcome. Split out of
// scoreSpread so a commissioner override — which forces the outcome rather
// than deriving it from the score — awards exactly what auto-scoring would
// have for that same outcome, in every point mode.
export function spreadPointsForOutcome(
  settings: ScoringSettings,
  side: 'cover' | 'against',
  outcome: 'covered' | 'missed' | 'push',
  baseGamePoints: number,
): number {
  if (outcome === 'push') return 0;
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
  const weekCaptainPicks = captainPicks.filter(
    p => p.user_id === userId && p.week === week
  );
  const captainMultiplierByTeam = new Map(
    weekCaptainPicks.map(p => [p.team_id, p.locked_multiplier ?? LEGACY_CAPTAIN_MULTIPLIER])
  );

  // Setting fewer captains than the league minimum forfeits every captain
  // bonus that week. Only enforced from the week the minimum last changed,
  // so raising it mid-season leaves finished weeks scored as they were.
  const minPerWeek = settings.captain_min_per_week ?? 0;
  const captainForfeited =
    minPerWeek > 0 &&
    week >= (settings.captain_min_effective_week ?? 0) &&
    weekCaptainPicks.length < minPerWeek;

  const weekSpreadPicks = spreadPicks.filter(
    p => p.user_id === userId && p.week === week
  );
  const spreadTeamIds = weekSpreadPicks.map(p => p.team_id);

  const weekBenchTeamIds = new Set(
    benchPicks.filter(p => p.user_id === userId && p.week === week).map(p => p.team_id)
  );

  const breakdown: ScoreBreakdown[] = roster.map(entry => {
    const game      = gameData[entry.team_id]?.[week] ?? null;
    const isCaptain = captainMultiplierByTeam.has(entry.team_id);
    // Forfeiting drops the multiplier to 1 rather than clearing is_captain:
    // the manager did pick this team, and the UI needs to say so while
    // showing that it earned nothing.
    const captainMultiplier = isCaptain && !captainForfeited
      ? captainMultiplierByTeam.get(entry.team_id)!
      : 1;
    // A benched team never scores, regardless of captain status or spread
    // pick — bench overrides both rather than needing separate validation
    // to keep a benched team from also being captain/spread-picked.
    const isBenched = settings.bench_enabled && weekBenchTeamIds.has(entry.team_id);
    const gamePts   = (game && !isBenched) ? scoreGame(game, settings, isCaptain, captainMultiplier) : 0;

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
      captain_multiplier: captainMultiplier,
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
    captain_team_ids: weekCaptainPicks.map(p => p.team_id),
    captain_forfeited: captainForfeited,
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
    if (total === 0) continue;

    // Tie at the cutoff boundary: every team matching the boundary value
    // qualifies, not just whichever one happened to land first in sort
    // order. Two teams can easily post the identical value for a stat
    // (rushing TDs, sacks, etc.), and picking one winner by incidental
    // array-iteration order isn't a rule any manager could ever verify —
    // Math.min(...) clamps the boundary index for the degenerate case
    // where top_count/bottom_count is >= the number of ranked teams, which
    // should still mean "everyone qualifies" exactly as before.
    const topBoundaryVal = cat.top_enabled && cat.top_count > 0
      ? ranked[Math.min(cat.top_count, total) - 1].val as number
      : null;
    const botBoundaryVal = cat.bottom_enabled && cat.bottom_count > 0
      ? ranked[total - Math.min(cat.bottom_count, total)].val as number
      : null;

    ranked.forEach((entry, idx) => {
      const rank = idx + 1;
      const isTop = topBoundaryVal !== null && (entry.val as number) >= topBoundaryVal;
      const isBot = !isTop && botBoundaryVal !== null && (entry.val as number) <= botBoundaryVal;
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
