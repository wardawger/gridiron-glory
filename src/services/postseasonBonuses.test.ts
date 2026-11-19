import { describe, it, expect } from 'vitest';
import { computeAutoBonuses } from './postseasonBonuses';
import { DEFAULT_SCORING, normalizeScoring } from '../types';

const scoring = normalizeScoring({ ...DEFAULT_SCORING });
const members = [{ user_id: 'u1' }, { user_id: 'u2' }] as any;
const draftPicks = [
  { team_id: 'A', team_name: 'Alpha', user_id: 'u1', team_conference: 'SEC', team_logo: '' },
  { team_id: 'B', team_name: 'Bravo', user_id: 'u2', team_conference: 'ACC', team_logo: '' },
] as any;

const g = (week: number, kind: string, result: 'W' | 'L' | null, completed = true) =>
  ({ week, game_kind: kind, result, completed, opponent: 'X', opponent_id: 'x' });

function run(gameData: any, manualBonuses: any[] = []) {
  return computeAutoBonuses({ leagueId: 'L', members, draftPicks, freeAgencyMoves: [], gameData, scoring, manualBonuses });
}
const types = (bs: any[], user?: string) => bs.filter(b => !user || b.user_id === user).map(b => b.type).sort();

describe('computeAutoBonuses', () => {
  it('awards bowl eligibility at six wins and ineligibility below it, once the season is done', () => {
    const wins = (n: number, total = 12) => Object.fromEntries(Array.from({ length: total }, (_, i) => [i + 1, g(i + 1, 'regular', i < n ? 'W' : 'L')]));
    const bonuses = run({ A: wins(6), B: wins(5) });
    expect(types(bonuses, 'u1')).toEqual(['bowl_eligible']);
    expect(types(bonuses, 'u2')).toEqual(['not_bowl_eligible']);
  });

  it('waits until every regular-season game has been played', () => {
    const games: any = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, g(i + 1, 'regular', 'W')]));
    games[12] = g(12, 'regular', null, false);
    expect(run({ A: games })).toEqual([]);
  });

  it('awards conference championship appearance and win', () => {
    const lost = run({ A: { 14: g(14, 'conference_championship', 'L') } });
    expect(types(lost).filter(t => t.endsWith('_cc'))).toEqual(['make_cc']);
    const won = run({ A: { 14: g(14, 'conference_championship', 'W') } });
    expect(types(won).filter(t => t.endsWith('_cc'))).toEqual(['make_cc', 'win_cc']);
  });

  it('awards the cumulative CFP ladder and the title', () => {
    const champ = run({ A: { 16: g(16, 'cfp_quarterfinal', 'W'), 18: g(18, 'cfp_semifinal', 'W'), 21: g(21, 'cfp_championship', 'W') } });
    expect(types(champ)).toEqual(['make_cfp', 'make_cfp_final', 'make_cfp_quarterfinal', 'make_cfp_semifinal', 'win_cfp_championship']);
    const firstRoundExit = run({ B: { 16: g(16, 'cfp_first_round', 'L') } });
    expect(types(firstRoundExit)).toEqual(['make_cfp']);
  });

  it('counts only non-CFP bowl wins as win_bowl', () => {
    expect(types(run({ A: { 17: g(17, 'bowl', 'W') } }))).toEqual(['win_bowl']);
    expect(types(run({ A: { 17: g(17, 'bowl', 'L') } }))).toEqual([]);
    expect(types(run({ A: { 17: g(17, 'cfp_first_round', 'W') } }))).not.toContain('win_bowl');
  });

  it('lets a commissioner-entered bonus replace the calculated one', () => {
    const manual = [{ user_id: 'u1', type: 'win_bowl', team_id: 'A' }];
    expect(run({ A: { 17: g(17, 'bowl', 'W') } }, manual)).toEqual([]);
  });

  it('uses the league-configured point values', () => {
    const custom = normalizeScoring({ ...DEFAULT_SCORING, bonus_points: { win_bowl: 7 } as any });
    const out = computeAutoBonuses({ leagueId: 'L', members, draftPicks, freeAgencyMoves: [], gameData: { A: { 17: g(17, 'bowl', 'W') } } as any, scoring: custom, manualBonuses: [] });
    expect(out[0].points).toBe(7);
  });
});

import { isCaptainEligibleGame } from './gameKinds';
import { calcWeeklyScore } from './scoring';

describe('captain eligibility', () => {
  it('blocks conference championships and playoff rounds, allows bowls and regular games', () => {
    for (const k of ['conference_championship', 'cfp_first_round', 'cfp_quarterfinal', 'cfp_semifinal', 'cfp_championship'])
      expect(isCaptainEligibleGame({ game_kind: k as any })).toBe(false);
    for (const k of ['regular', 'bowl']) expect(isCaptainEligibleGame({ game_kind: k as any })).toBe(true);
    expect(isCaptainEligibleGame(undefined)).toBe(true);
  });
  it('scores a captain pick on a conference championship at 1x', () => {
    const mk = (kind: string) => ({ A: { 14: { ...g(14, kind, 'W'), team_score: 30, opponent_score: 10, is_home: true } } }) as any;
    const score = (kind: string) => calcWeeklyScore('u1', 14, [{ team_id: 'A', team_name: 'Alpha' }] as any,
      [{ user_id: 'u1', team_id: 'A', week: 14, locked_multiplier: 2 }] as any, mk(kind), scoring);
    const normal = score("regular").points, cc = score("conference_championship");
    expect(cc.breakdown[0].is_captain).toBe(false);
    expect(normal).toBeGreaterThan(cc.points);
  });
});
