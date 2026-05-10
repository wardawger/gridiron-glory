import type {
  ScoringSettings, GameResult, WeeklyScore, ScoreBreakdown,
  LeaderboardEntry, LeagueMember, RosterEntry, CaptainPick,
  GameData, ManualBonus,
} from '../types';

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

export function calcWeeklyScore(
  userId: string,
  week: number,
  roster: RosterEntry[],
  captainPicks: CaptainPick[],
  gameData: GameData,
  settings: ScoringSettings,
): WeeklyScore {
  const captainPick = captainPicks.find(
    p => p.user_id === userId && p.week === week
  );
  const captainTeamId = captainPick?.team_id ?? null;

  const breakdown: ScoreBreakdown[] = roster.map(entry => {
    const game = gameData[entry.team_id]?.[week] ?? null;
    const isCaptain = entry.team_id === captainTeamId;
    const pts = game ? scoreGame(game, settings, isCaptain) : 0;
    return {
      team_id:   entry.team_id,
      team_name: entry.team_name,
      points:    pts,
      is_captain: isCaptain,
      game,
    };
  });

  return {
    user_id: userId,
    week,
    points: breakdown.reduce((s, b) => s + b.points, 0),
    captain_team_id: captainTeamId,
    breakdown,
  };
}

export function buildLeaderboard(
  members: LeagueMember[],
  rosters: Map<string, RosterEntry[]>,
  captainPicks: CaptainPick[],
  gameData: GameData,
  settings: ScoringSettings,
  manualBonuses: ManualBonus[],
  totalWeeks = 17,
): LeaderboardEntry[] {
  return members
    .map(member => {
      const roster = rosters.get(member.user_id) ?? [];
      const weekly: WeeklyScore[] = [];

      for (let w = 0; w <= totalWeeks; w++) {
        weekly.push(calcWeeklyScore(member.user_id, w, roster, captainPicks, gameData, settings));
      }

      const weeklyTotal = weekly.reduce((s, w) => s + w.points, 0);
      const bonusPoints = manualBonuses
        .filter(b => b.user_id === member.user_id)
        .reduce((s, b) => s + b.points, 0);

      return {
        user_id:       member.user_id,
        display_name:  member.display_name,
        total_points:  weeklyTotal + bonusPoints,
        weekly_scores: weekly,
        bonus_points:  bonusPoints,
        roster,
      };
    })
    .sort((a, b) => b.total_points - a.total_points);
}

// Derive the correct pick position for a snake draft
// rounds × players, snaking every other round
export function getPickOwner(
  pickNumber: number,  // 1-based overall pick
  draftOrder: string[], // user IDs in round-1 order
): string {
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
