import type {
  BonusType, DraftPick, FreeAgencyMove, GameData, GameResult, LeagueMember, ManualBonus, ScoringSettings,
} from '../types';
import { rosterAtWeek } from './roster';
import { LAST_SCORED_WEEK, REGULAR_SEASON_LAST_WEEK } from './postseasonWeeks';
import { CFP_KINDS } from './gameKinds';

// Bowl eligibility needs six wins.
const BOWL_ELIGIBLE_WINS = 6;
export const AUTO_BONUS_AWARDER = 'auto';

interface Inputs {
  leagueId: string;
  members: LeagueMember[];
  draftPicks: DraftPick[];
  freeAgencyMoves: FreeAgencyMove[];
  gameData: GameData;
  scoring: ScoringSettings;
  // Real (commissioner-entered) bonuses. An entry for the same manager, type,
  // and team replaces the calculated one, so commissioners keep the final say.
  manualBonuses: ManualBonus[];
}

const key = (userId: string, type: BonusType, teamId: string) => `${userId}|${type}|${teamId}`;

// Bonuses the app can work out from results alone: bowl eligibility and
// bowl wins, conference championship appearances and wins, and each College
// Football Playoff level. Awards, coach firings, and stat-ranking bonuses
// are not derivable here and stay commissioner-entered (or computed elsewhere).
// Each bonus goes to whoever rostered the team in the week it was earned.
export function computeAutoBonuses({ leagueId, members, draftPicks, freeAgencyMoves, gameData, scoring, manualBonuses }: Inputs): ManualBonus[] {
  const taken = new Set(manualBonuses.map(b => key(b.user_id, b.type, b.team_id)));
  const out: ManualBonus[] = [];
  const nameOf = new Map<string, string>();
  draftPicks.forEach(p => nameOf.set(p.team_id, p.team_name));
  freeAgencyMoves.forEach(m => { nameOf.set(m.added_team_id, m.added_team_name); });

  // owner of a team in a given week (null if nobody held it)
  const rosterCache = new Map<string, Set<string>>();
  const ownerOf = (teamId: string, week: number): string | null => {
    for (const m of members) {
      const ck = `${m.user_id}|${week}`;
      let ids = rosterCache.get(ck);
      if (!ids) {
        ids = new Set(rosterAtWeek(m.user_id, week, draftPicks, freeAgencyMoves).map(t => t.team_id));
        rosterCache.set(ck, ids);
      }
      if (ids.has(teamId)) return m.user_id;
    }
    return null;
  };

  const award = (type: BonusType, teamId: string, week: number) => {
    const points = scoring.bonus_points[type];
    if (!points) return;
    const userId = ownerOf(teamId, week);
    if (!userId || taken.has(key(userId, type, teamId))) return;
    taken.add(key(userId, type, teamId));
    out.push({
      id: `auto:${type}:${userId}:${teamId}`,
      league_id: leagueId,
      user_id: userId,
      type,
      team_id: teamId,
      team_name: nameOf.get(teamId) ?? '',
      points,
      note: 'Calculated by the app',
      awarded_at: '',
      awarded_by: AUTO_BONUS_AWARDER,
    });
  };

  for (const teamId of nameOf.keys()) {
    const games = gameData[teamId];
    if (!games) continue;
    const entries = Object.entries(games)
      .map(([w, g]) => [Number(w), g as GameResult] as const)
      .filter(([w]) => w <= LAST_SCORED_WEEK)
      .sort((a, b) => a[0] - b[0]);

    const ofKind = (kinds: string[]) => entries.filter(([, g]) => g.game_kind && kinds.includes(g.game_kind));

    // Conference championship: made it once the game exists; won it on a W.
    for (const [w, g] of ofKind(['conference_championship'])) {
      award('make_cc', teamId, w);
      if (g.completed && g.result === 'W') award('win_cc', teamId, w);
    }

    // College Football Playoff ladder (cumulative, like the manual awards).
    for (const [w, g] of ofKind(CFP_KINDS)) {
      const kind = g.game_kind;
      award('make_cfp', teamId, w);
      if (kind === 'cfp_quarterfinal' || kind === 'cfp_semifinal' || kind === 'cfp_championship') award('make_cfp_quarterfinal', teamId, w);
      if (kind === 'cfp_semifinal' || kind === 'cfp_championship') award('make_cfp_semifinal', teamId, w);
      if (kind === 'cfp_championship') {
        award('make_cfp_final', teamId, w);
        if (g.completed && g.result === 'W') award('win_cfp_championship', teamId, w);
      }
    }

    // Non-CFP bowl win.
    for (const [w, g] of ofKind(['bowl'])) {
      if (g.completed && g.result === 'W') award('win_bowl', teamId, w);
    }

    // Bowl eligibility: settled once every regular-season game (including a
    // conference championship) has been played. Six wins make a team eligible.
    const regular = entries.filter(([w]) => w <= REGULAR_SEASON_LAST_WEEK);
    if (regular.length > 0 && regular.every(([, g]) => g.completed)) {
      const wins = regular.filter(([, g]) => g.result === 'W').length;
      award(wins >= BOWL_ELIGIBLE_WINS ? 'bowl_eligible' : 'not_bowl_eligible', teamId, REGULAR_SEASON_LAST_WEEK);
    }
  }
  return out;
}
