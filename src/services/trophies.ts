import type {
  LeagueMember, DraftPick, CaptainPick, SpreadPick, FreeAgencyMove, ManualBonus,
  GameData, ScoringSettings, BonusType, TrophyCategoryId, TrophyCategory,
  TrophySnapshot, TrophyTeamRef, TrophyWinner,
} from '../types';
import { normalizeScoring } from '../types';
import { isP4Conference } from './scoring';
import { calcWeeklyScore } from './scoring';
import { rosterAtWeek } from './roster';

export const TROPHY_META: Record<TrophyCategoryId, { label: string; description: string }> = {
  undefeated_team:            { label: 'Undefeated',          description: 'Drafted a team that finished with zero losses' },
  captain_pick:                { label: 'Captain',             description: 'Named a team as weekly captain' },
  beat_spread:                 { label: 'Beat the Spread',     description: 'Covered the spread on a pick' },
  used_free_agency:            { label: 'Free Agent',          description: 'Made a free agency swap' },
  heisman_winner:               { label: 'Heisman',             description: 'Drafted the Heisman winner' },
  p4_conf_champion:            { label: 'Conference Champion', description: 'Drafted Power 4 conference champions' },
  negative_week:                { label: 'Underwater',          description: 'Posted a negative-point week' },
  first_losing_record_draft:  { label: 'First to Fall',       description: 'First in the league to draft a team with a losing record' },
  g5_team:                      { label: 'G5 Gambler',          description: 'Drafted a Group of 5 team' },
  independent_team:            { label: 'Lone Wolf',           description: 'Drafted an FBS independent' },
  bad_week_tier:                { label: 'Rock Bottom',         description: 'Dropped a brutal single-week score' },
  made_cfp:                     { label: 'Playoff Bound',       description: 'Drafted a team that made the CFP' },
  made_conf_championship:      { label: 'Title Game',          description: "Drafted a team that made its conference championship" },
};

export const BAD_WEEK_THRESHOLDS = [-10, -20, -30, -40];

function winnerFor(
  member: LeagueMember,
  teams: TrophyTeamRef[],
  opts?: { tier?: number; detail?: string },
): TrophyWinner {
  return {
    user_id: member.user_id,
    display_name: member.display_name,
    avatar_type: member.avatar_type,
    avatar_value: member.avatar_value,
    teams,
    tier: opts?.tier,
    detail: opts?.detail,
  };
}

interface TeamInfo { team_id: string; team_name: string; team_logo: string; conference: string; }

// Global team_id → info lookup, merged from every draft pick and free agency
// move in the league. Used to resolve names/logos/conferences for records
// that don't carry the full team shape themselves (ManualBonus, SpreadPick).
function buildTeamInfoMap(draftPicks: DraftPick[], freeAgencyMoves: FreeAgencyMove[]): Map<string, TeamInfo> {
  const map = new Map<string, TeamInfo>();
  draftPicks.forEach(p => {
    map.set(p.team_id, { team_id: p.team_id, team_name: p.team_name, team_logo: p.team_logo, conference: p.team_conference });
  });
  freeAgencyMoves.forEach(m => {
    map.set(m.added_team_id, { team_id: m.added_team_id, team_name: m.added_team_name, team_logo: m.added_team_logo, conference: m.added_team_conference });
    if (!map.has(m.dropped_team_id)) {
      map.set(m.dropped_team_id, { team_id: m.dropped_team_id, team_name: m.dropped_team_name, team_logo: m.dropped_team_logo, conference: m.dropped_team_conference });
    }
  });
  return map;
}

function computeUndefeated(members: LeagueMember[], draftPicks: DraftPick[], gameData: GameData): TrophyWinner[] {
  const winners: TrophyWinner[] = [];
  members.forEach(member => {
    const seen = new Set<string>();
    const teams: TrophyTeamRef[] = [];
    draftPicks.filter(p => p.user_id === member.user_id).forEach(pick => {
      if (seen.has(pick.team_id)) return;
      const games = Object.values(gameData[pick.team_id] ?? {});
      const completed = games.filter(g => g.completed && g.result);
      if (completed.length > 0 && completed.every(g => g.result === 'W')) {
        seen.add(pick.team_id);
        teams.push({ team_id: pick.team_id, team_name: pick.team_name, team_logo: pick.team_logo });
      }
    });
    if (teams.length > 0) winners.push(winnerFor(member, teams));
  });
  return winners;
}

function computeCaptainPick(members: LeagueMember[], captainPicks: CaptainPick[], teamInfo: Map<string, TeamInfo>): TrophyWinner[] {
  const winners: TrophyWinner[] = [];
  members.forEach(member => {
    const teamIds = new Set(captainPicks.filter(c => c.user_id === member.user_id).map(c => c.team_id));
    if (teamIds.size === 0) return;
    const teams = Array.from(teamIds).map(id => {
      const info = teamInfo.get(id);
      return { team_id: id, team_name: info?.team_name ?? id, team_logo: info?.team_logo ?? '' };
    });
    winners.push(winnerFor(member, teams));
  });
  return winners;
}

function computeBeatSpread(members: LeagueMember[], spreadPicks: SpreadPick[], teamInfo: Map<string, TeamInfo>): TrophyWinner[] {
  const winners: TrophyWinner[] = [];
  members.forEach(member => {
    const seen = new Set<string>();
    const teams: TrophyTeamRef[] = [];
    spreadPicks.filter(p => p.user_id === member.user_id && p.result === 'covered').forEach(p => {
      if (seen.has(p.team_id)) return;
      seen.add(p.team_id);
      const info = teamInfo.get(p.team_id);
      teams.push({ team_id: p.team_id, team_name: info?.team_name ?? p.team_id, team_logo: info?.team_logo ?? '' });
    });
    if (teams.length > 0) winners.push(winnerFor(member, teams));
  });
  return winners;
}

function computeUsedFreeAgency(members: LeagueMember[], freeAgencyMoves: FreeAgencyMove[]): TrophyWinner[] {
  const winners: TrophyWinner[] = [];
  members.forEach(member => {
    const seen = new Set<string>();
    const teams: TrophyTeamRef[] = [];
    freeAgencyMoves.filter(m => m.user_id === member.user_id).forEach(m => {
      if (seen.has(m.added_team_id)) return;
      seen.add(m.added_team_id);
      teams.push({ team_id: m.added_team_id, team_name: m.added_team_name, team_logo: m.added_team_logo });
    });
    if (teams.length > 0) winners.push(winnerFor(member, teams));
  });
  return winners;
}

function computeBonusCategory(
  members: LeagueMember[],
  manualBonuses: ManualBonus[],
  teamInfo: Map<string, TeamInfo>,
  bonusType: BonusType,
): TrophyWinner[] {
  const winners: TrophyWinner[] = [];
  members.forEach(member => {
    const seen = new Set<string>();
    const teams: TrophyTeamRef[] = [];
    manualBonuses.filter(b => b.user_id === member.user_id && b.type === bonusType).forEach(b => {
      if (seen.has(b.team_id)) return;
      seen.add(b.team_id);
      teams.push({ team_id: b.team_id, team_name: b.team_name, team_logo: teamInfo.get(b.team_id)?.team_logo ?? '' });
    });
    if (teams.length > 0) winners.push(winnerFor(member, teams));
  });
  return winners;
}

// Tiered 1-4: distinct P4 conferences where the user has a 'win_cc' bonus,
// cross-referenced against team conference since ManualBonus has no
// team_conference field of its own.
function computeP4ConfChampion(members: LeagueMember[], manualBonuses: ManualBonus[], teamInfo: Map<string, TeamInfo>): TrophyWinner[] {
  const winners: TrophyWinner[] = [];
  members.forEach(member => {
    const winCcBonuses = manualBonuses.filter(b => b.user_id === member.user_id && b.type === 'win_cc');
    if (winCcBonuses.length === 0) return;
    const confToBonus = new Map<string, ManualBonus>();
    winCcBonuses.forEach(b => {
      const conf = teamInfo.get(b.team_id)?.conference;
      if (conf && isP4Conference(conf) && !confToBonus.has(conf)) confToBonus.set(conf, b);
    });
    if (confToBonus.size === 0) return;
    const teams = Array.from(confToBonus.values()).map(b => ({
      team_id: b.team_id, team_name: b.team_name, team_logo: teamInfo.get(b.team_id)?.team_logo ?? '',
    }));
    winners.push(winnerFor(member, teams, { tier: confToBonus.size, detail: `${confToBonus.size} of 4 P4 conferences` }));
  });
  return winners;
}

function computeConferenceDraft(
  members: LeagueMember[],
  draftPicks: DraftPick[],
  predicate: (conference: string) => boolean,
): TrophyWinner[] {
  const winners: TrophyWinner[] = [];
  members.forEach(member => {
    const seen = new Set<string>();
    const teams: TrophyTeamRef[] = [];
    draftPicks.filter(p => p.user_id === member.user_id && predicate(p.team_conference)).forEach(p => {
      if (seen.has(p.team_id)) return;
      seen.add(p.team_id);
      teams.push({ team_id: p.team_id, team_name: p.team_name, team_logo: p.team_logo });
    });
    if (teams.length > 0) winners.push(winnerFor(member, teams));
  });
  return winners;
}

// League-wide, single recipient: earliest draft pick (by picked_at) of a
// team that currently has more losses than wins among completed games.
function computeFirstLosingRecordDraft(members: LeagueMember[], draftPicks: DraftPick[], gameData: GameData): TrophyWinner[] {
  let best: { pick: DraftPick; member: LeagueMember } | null = null;

  draftPicks.forEach(pick => {
    const games = Object.values(gameData[pick.team_id] ?? {});
    const completed = games.filter(g => g.completed && g.result);
    const wins = completed.filter(g => g.result === 'W').length;
    const losses = completed.filter(g => g.result === 'L').length;
    if (losses <= wins) return;

    const member = members.find(m => m.user_id === pick.user_id);
    if (!member) return;
    if (!best || pick.picked_at < best.pick.picked_at) best = { pick, member };
  });

  if (!best) return [];
  const { pick, member } = best as { pick: DraftPick; member: LeagueMember };
  return [winnerFor(
    member,
    [{ team_id: pick.team_id, team_name: pick.team_name, team_logo: pick.team_logo }],
    { detail: new Date(pick.picked_at).toLocaleDateString() },
  )];
}

interface WeeklyExtreme { week: number; points: number; }

// Each member's single worst-scoring week across the season, using the same
// game/spread/FA-penalty basis as calcWeeklyScore (manual/stat bonuses
// aren't week-scoped in this data model, so they're intentionally excluded).
function computeWeeklyExtremes(
  members: LeagueMember[],
  draftPicks: DraftPick[],
  captainPicks: CaptainPick[],
  gameData: GameData,
  scoring: ScoringSettings,
  spreadPicks: SpreadPick[],
  freeAgencyMoves: FreeAgencyMove[],
): Map<string, WeeklyExtreme | null> {
  const result = new Map<string, WeeklyExtreme | null>();
  members.forEach(member => {
    let worst: WeeklyExtreme | null = null;
    for (let w = 1; w <= 17; w++) {
      const roster = rosterAtWeek(member.user_id, w, draftPicks, freeAgencyMoves);
      if (roster.length === 0) continue;
      const weekly = calcWeeklyScore(member.user_id, w, roster, captainPicks, gameData, scoring, spreadPicks, freeAgencyMoves);
      if (!worst || weekly.points < worst.points) worst = { week: w, points: weekly.points };
    }
    result.set(member.user_id, worst);
  });
  return result;
}

function computeNegativeWeek(members: LeagueMember[], weeklyExtremes: Map<string, WeeklyExtreme | null>): TrophyWinner[] {
  const winners: TrophyWinner[] = [];
  members.forEach(member => {
    const worst = weeklyExtremes.get(member.user_id);
    if (!worst || worst.points >= 0) return;
    winners.push(winnerFor(member, [], { detail: `Week ${worst.week} · ${worst.points} pts` }));
  });
  return winners;
}

function computeBadWeekTier(members: LeagueMember[], weeklyExtremes: Map<string, WeeklyExtreme | null>): TrophyWinner[] {
  const winners: TrophyWinner[] = [];
  members.forEach(member => {
    const worst = weeklyExtremes.get(member.user_id);
    if (!worst) return;
    let tier = 0;
    BAD_WEEK_THRESHOLDS.forEach((threshold, i) => { if (worst.points <= threshold) tier = i + 1; });
    if (tier === 0) return;
    winners.push(winnerFor(member, [], { tier, detail: `Week ${worst.week} · ${worst.points} pts` }));
  });
  return winners;
}

export function computeTrophies(
  members: LeagueMember[],
  draftPicks: DraftPick[],
  captainPicks: CaptainPick[],
  spreadPicks: SpreadPick[],
  freeAgencyMoves: FreeAgencyMove[],
  manualBonuses: ManualBonus[],
  gameData: GameData,
  rawScoring: ScoringSettings,
): TrophySnapshot {
  const scoring = normalizeScoring(rawScoring);
  const teamInfo = buildTeamInfoMap(draftPicks, freeAgencyMoves);
  const weeklyExtremes = computeWeeklyExtremes(members, draftPicks, captainPicks, gameData, scoring, spreadPicks, freeAgencyMoves);

  const categories: TrophyCategory[] = [];
  const add = (id: TrophyCategoryId, winners: TrophyWinner[]) => {
    categories.push({ id, label: TROPHY_META[id].label, description: TROPHY_META[id].description, winners });
  };

  add('undefeated_team', computeUndefeated(members, draftPicks, gameData));
  add('captain_pick', computeCaptainPick(members, captainPicks, teamInfo));
  if (scoring.spread_enabled) add('beat_spread', computeBeatSpread(members, spreadPicks, teamInfo));
  if (scoring.free_agency_enabled) add('used_free_agency', computeUsedFreeAgency(members, freeAgencyMoves));
  add('heisman_winner', computeBonusCategory(members, manualBonuses, teamInfo, 'heisman_winner'));
  add('p4_conf_champion', computeP4ConfChampion(members, manualBonuses, teamInfo));
  add('negative_week', computeNegativeWeek(members, weeklyExtremes));
  add('first_losing_record_draft', computeFirstLosingRecordDraft(members, draftPicks, gameData));
  add('g5_team', computeConferenceDraft(members, draftPicks, conf => !isP4Conference(conf) && conf !== 'FBS Independents'));
  add('independent_team', computeConferenceDraft(members, draftPicks, conf => conf === 'FBS Independents'));
  add('bad_week_tier', computeBadWeekTier(members, weeklyExtremes));
  add('made_cfp', computeBonusCategory(members, manualBonuses, teamInfo, 'make_cfp'));
  add('made_conf_championship', computeBonusCategory(members, manualBonuses, teamInfo, 'make_cc'));

  return { computedAt: new Date().toISOString(), categories };
}
