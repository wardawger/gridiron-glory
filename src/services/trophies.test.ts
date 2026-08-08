import { describe, it, expect } from 'vitest';
import { computeTrophies } from './trophies';
import { DEFAULT_SCORING } from '../types';
import type {
  GameResult, GameData, LeagueMember, DraftPick, CaptainPick, SpreadPick, FreeAgencyMove, ManualBonus,
} from '../types';

function makeGame(overrides: Partial<GameResult> = {}): GameResult {
  return {
    week: 1,
    opponent: 'Rival U',
    opponent_id: 'opp-1',
    opponent_rank: null,
    opponent_logo: null,
    result: 'W',
    is_g5_opponent: false,
    home_score: 30,
    away_score: 10,
    completed: true,
    start_date: '2026-09-05',
    is_home: true,
    venue: null,
    tv: null,
    ...overrides,
  };
}

const members: LeagueMember[] = [
  { league_id: 'L', user_id: 'u1', display_name: 'Alice', role: 'commissioner', joined_at: '2026-01-01', avatar_type: 'initial', avatar_value: '' },
  { league_id: 'L', user_id: 'u2', display_name: 'Bob', role: 'member', joined_at: '2026-01-01', avatar_type: 'initial', avatar_value: '' },
];

function pick(overrides: Partial<DraftPick>): DraftPick {
  return {
    id: 'p', league_id: 'L', user_id: 'u1', team_id: 't1', team_name: 'Team One', team_logo: '',
    team_conference: 'SEC', round: 1, pick_number: 1, picked_at: '2026-08-01T00:00:00Z', ...overrides,
  };
}

function bonus(overrides: Partial<ManualBonus>): ManualBonus {
  return {
    id: 'b', league_id: 'L', user_id: 'u1', type: 'win_cc', team_id: 't1', team_name: 'Team One',
    points: 10, note: '', awarded_at: '', awarded_by: 'u1', ...overrides,
  };
}

describe('computeTrophies', () => {
  it('awards undefeated only to teams with all completed games won', () => {
    const draftPicks = [
      pick({ team_id: 't1', team_name: 'Undefeated U', user_id: 'u1' }),
      pick({ team_id: 't2', team_name: 'One Loss U', user_id: 'u2', id: 'p2' }),
    ];
    const gameData: GameData = {
      t1: { 1: makeGame({ result: 'W' }), 2: makeGame({ week: 2, result: 'W' }) },
      t2: { 1: makeGame({ result: 'W' }), 2: makeGame({ week: 2, result: 'L' }) },
    };

    const snapshot = computeTrophies(members, draftPicks, [], [], [], [], gameData, DEFAULT_SCORING);
    const category = snapshot.categories.find(c => c.id === 'undefeated_team')!;

    expect(category.winners.map(w => w.user_id)).toEqual(['u1']);
    expect(category.winners[0].teams[0].team_name).toBe('Undefeated U');
  });

  it('tiers P4 conference champions by distinct conference count', () => {
    const draftPicks = [
      pick({ team_id: 't1', team_name: 'SEC Team', team_conference: 'SEC', user_id: 'u1' }),
      pick({ id: 'p2', team_id: 't2', team_name: 'Big Ten Team', team_conference: 'Big Ten', user_id: 'u1' }),
    ];
    const manualBonuses = [
      bonus({ id: 'b1', team_id: 't1', team_name: 'SEC Team', user_id: 'u1', type: 'win_cc' }),
      bonus({ id: 'b2', team_id: 't2', team_name: 'Big Ten Team', user_id: 'u1', type: 'win_cc' }),
    ];

    const snapshot = computeTrophies(members, draftPicks, [], [], [], manualBonuses, {}, DEFAULT_SCORING);
    const category = snapshot.categories.find(c => c.id === 'p4_conf_champion')!;

    expect(category.winners).toHaveLength(1);
    expect(category.winners[0].user_id).toBe('u1');
    expect(category.winners[0].tier).toBe(2);
  });

  it('does not count a win_cc bonus for a non-P4 team toward the conference champion tier', () => {
    const draftPicks = [pick({ team_id: 't1', team_conference: 'Mountain West', user_id: 'u1' })];
    const manualBonuses = [bonus({ team_id: 't1', user_id: 'u1', type: 'win_cc' })];

    const snapshot = computeTrophies(members, draftPicks, [], [], [], manualBonuses, {}, DEFAULT_SCORING);
    const category = snapshot.categories.find(c => c.id === 'p4_conf_champion')!;

    expect(category.winners).toHaveLength(0);
  });

  it('awards "first to draft a losing-record team" to the earliest qualifying pick league-wide', () => {
    const draftPicks = [
      pick({ id: 'p1', team_id: 't1', user_id: 'u2', picked_at: '2026-08-05T00:00:00Z' }),
      pick({ id: 'p2', team_id: 't2', user_id: 'u1', picked_at: '2026-08-01T00:00:00Z' }),
    ];
    const gameData: GameData = {
      t1: { 1: makeGame({ result: 'L' }), 2: makeGame({ week: 2, result: 'L' }) }, // 0-2, later pick
      t2: { 1: makeGame({ result: 'L' }), 2: makeGame({ week: 2, result: 'L' }) }, // 0-2, earlier pick
    };

    const snapshot = computeTrophies(members, draftPicks, [], [], [], [], gameData, DEFAULT_SCORING);
    const category = snapshot.categories.find(c => c.id === 'first_losing_record_draft')!;

    expect(category.winners).toHaveLength(1);
    expect(category.winners[0].user_id).toBe('u1');
    expect(category.winners[0].teams[0].team_id).toBe('t2');
  });

  it('flags negative and tiered bad weeks from calcWeeklyScore, using only game/spread/FA points', () => {
    const draftPicks = [pick({ team_id: 't1', user_id: 'u1' })];
    const gameData: GameData = {
      // loss (-1) + G5 penalty (-5) = -6, not a "bad week" tier hit (threshold is -10)
      t1: { 1: makeGame({ result: 'L', is_g5_opponent: true, home_score: 10, away_score: 30 }) },
    };

    const snapshot = computeTrophies(members, draftPicks, [], [], [], [], gameData, DEFAULT_SCORING);
    const negative = snapshot.categories.find(c => c.id === 'negative_week')!;
    const badWeek = snapshot.categories.find(c => c.id === 'bad_week_tier')!;

    expect(negative.winners.map(w => w.user_id)).toEqual(['u1']);
    expect(negative.winners[0].detail).toContain('-6 pts');
    expect(badWeek.winners).toHaveLength(0); // -6 doesn't clear the -10 threshold
  });

  it('hides beat_spread and used_free_agency categories when their scoring toggles are off', () => {
    const snapshot = computeTrophies(members, [], [], [], [], [], {}, DEFAULT_SCORING);
    const ids = snapshot.categories.map(c => c.id);

    expect(ids).not.toContain('beat_spread');
    expect(ids).not.toContain('used_free_agency');
  });

  it('shows beat_spread and used_free_agency once their scoring toggles are on', () => {
    const scoring = { ...DEFAULT_SCORING, spread_enabled: true, free_agency_enabled: true };
    const draftPicks = [pick({ team_id: 't1', user_id: 'u1' })];
    const spreadPicks: SpreadPick[] = [
      { id: 's1', league_id: 'L', user_id: 'u1', team_id: 't1', week: 1, locked_spread: -7, picked_at: '', result: 'covered', points: 2, commissioner_override: false },
    ];
    const freeAgencyMoves: FreeAgencyMove[] = [
      { id: 'f1', league_id: 'L', user_id: 'u1', week: 1, dropped_team_id: 't1', dropped_team_name: 'Team One', dropped_team_logo: '', dropped_team_conference: 'SEC', added_team_id: 't2', added_team_name: 'Team Two', added_team_logo: '', added_team_conference: 'ACC', penalty_points: 0, created_at: '' },
    ];

    const snapshot = computeTrophies(members, draftPicks, [], spreadPicks, freeAgencyMoves, [], {}, scoring);
    const ids = snapshot.categories.map(c => c.id);

    expect(ids).toContain('beat_spread');
    expect(ids).toContain('used_free_agency');
  });
});
