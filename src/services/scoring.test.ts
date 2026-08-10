import { describe, it, expect } from 'vitest';
import {
  isP4Conference, confCategory, scoreGame, didCoverSpread, scoreSpread, buildLeaderboard, calcWeeklyScore,
} from './scoring';
import { DEFAULT_SCORING } from '../types';
import type { GameResult, GameData, LeagueMember, DraftPick, CaptainPick, TeamSeasonStats, ScoreCorrection } from '../types';

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
    start_time_tbd: false,
    is_home: true,
    venue: null,
    tv: null,
    weather_condition: null,
    weather_temp: null,
    wind_speed: null,
    game_indoors: false,
    ...overrides,
  };
}

describe('isP4Conference / confCategory', () => {
  it('recognizes the 4 P4 conferences', () => {
    expect(isP4Conference('SEC')).toBe(true);
    expect(isP4Conference('Big Ten')).toBe(true);
    expect(isP4Conference('Big 12')).toBe(true);
    expect(isP4Conference('ACC')).toBe(true);
  });

  it('treats everything else as non-P4', () => {
    expect(isP4Conference('Mountain West')).toBe(false);
    expect(isP4Conference('FBS Independents')).toBe(false);
    expect(isP4Conference('Pac-12')).toBe(false);
  });

  it('confCategory returns the conference name itself for P4, and the G5 sentinel otherwise', () => {
    expect(confCategory('SEC')).toBe('SEC');
    expect(confCategory('ACC')).toBe('ACC');
    expect(confCategory('Sun Belt')).toBe('G5');
    expect(confCategory('FBS Independents')).toBe('G5');
  });
});

describe('scoreGame', () => {
  it('awards base win points', () => {
    const game = makeGame({ opponent_rank: null });
    expect(scoreGame(game, DEFAULT_SCORING, false)).toBe(DEFAULT_SCORING.win);
  });

  it('stacks ranked-opponent bonuses for top-15 and top-5 wins', () => {
    const top20 = makeGame({ opponent_rank: 20 });
    expect(scoreGame(top20, DEFAULT_SCORING, false)).toBe(DEFAULT_SCORING.win + DEFAULT_SCORING.win_ranked);

    const top15 = makeGame({ opponent_rank: 15 });
    expect(scoreGame(top15, DEFAULT_SCORING, false)).toBe(
      DEFAULT_SCORING.win + DEFAULT_SCORING.win_ranked + DEFAULT_SCORING.win_top15
    );

    const top5 = makeGame({ opponent_rank: 5 });
    expect(scoreGame(top5, DEFAULT_SCORING, false)).toBe(
      DEFAULT_SCORING.win + DEFAULT_SCORING.win_ranked + DEFAULT_SCORING.win_top15 + DEFAULT_SCORING.win_top5
    );
  });

  it('applies the G5 loss penalty only on losses to G5 opponents', () => {
    const lossToG5 = makeGame({ result: 'L', is_g5_opponent: true, home_score: 10, away_score: 30 });
    expect(scoreGame(lossToG5, DEFAULT_SCORING, false)).toBe(DEFAULT_SCORING.loss + DEFAULT_SCORING.loss_g5);

    const lossToP4 = makeGame({ result: 'L', is_g5_opponent: false, home_score: 10, away_score: 30 });
    expect(scoreGame(lossToP4, DEFAULT_SCORING, false)).toBe(DEFAULT_SCORING.loss);
  });

  it('doubles points for the captain', () => {
    const game = makeGame({ opponent_rank: 20 });
    const base = scoreGame(game, DEFAULT_SCORING, false);
    expect(scoreGame(game, DEFAULT_SCORING, true)).toBe(base * 2);
  });

  it('scores 0 for an incomplete game', () => {
    const game = makeGame({ completed: false, result: null });
    expect(scoreGame(game, DEFAULT_SCORING, false)).toBe(0);
  });
});

describe('didCoverSpread / scoreSpread', () => {
  it('a favorite covers only if it wins by more than the spread', () => {
    // Home team favored by 7 (spread = -7): must win by more than 7.
    const barelyCovers = makeGame({ home_score: 28, away_score: 20 }); // margin 8
    expect(didCoverSpread(barelyCovers, -7, true)).toBe(true);

    const justMisses = makeGame({ home_score: 27, away_score: 20 }); // margin 7
    expect(didCoverSpread(justMisses, -7, true)).toBe(false);
  });

  it('an underdog covers if it loses by less than the spread, or wins outright', () => {
    // Away team is a 3-point underdog (spread = +3 from away perspective).
    const coversAsLosingUnderdog = makeGame({ home_score: 20, away_score: 19 }); // away loses by 1
    expect(didCoverSpread(coversAsLosingUnderdog, 3, false)).toBe(true);

    const missesAsLosingUnderdog = makeGame({ home_score: 25, away_score: 19 }); // away loses by 6
    expect(didCoverSpread(missesAsLosingUnderdog, 3, false)).toBe(false);
  });

  it('returns null for an incomplete game', () => {
    const game = makeGame({ completed: false, home_score: null, away_score: null });
    expect(didCoverSpread(game, -7, true)).toBeNull();
  });

  it('flat mode awards/deducts a fixed point value', () => {
    const settings = { ...DEFAULT_SCORING, spread_is_multiplier: false, spread_points: 2 };
    const covered = makeGame({ home_score: 30, away_score: 10 });
    expect(scoreSpread(covered, settings, -7, true, 1)).toBe(2);
    const missed = makeGame({ home_score: 20, away_score: 17 });
    expect(scoreSpread(missed, settings, -7, true, 1)).toBe(-2);
  });

  it('multiplier mode scales off the base game points', () => {
    const settings = { ...DEFAULT_SCORING, spread_is_multiplier: true, spread_points: 1.5 };
    const covered = makeGame({ home_score: 30, away_score: 10 });
    // bonus = round(|basePts| * (multiplier - 1)) = round(4 * 0.5) = 2
    expect(scoreSpread(covered, settings, -7, true, 4)).toBe(2);
  });

  it('with the miss-penalty override off (default), a miss still costs the negated cover reward', () => {
    const flatSettings = { ...DEFAULT_SCORING, spread_is_multiplier: false, spread_points: 2 };
    const flatMissed = makeGame({ home_score: 20, away_score: 17 });
    expect(scoreSpread(flatMissed, flatSettings, -7, true, 1)).toBe(-2);

    const multiplierSettings = { ...DEFAULT_SCORING, spread_is_multiplier: true, spread_points: 1.5 };
    const multiplierMissed = makeGame({ home_score: 20, away_score: 17 });
    // bonus = round(|basePts| * (multiplier - 1)) = round(4 * 0.5) = 2, negated on a miss
    expect(scoreSpread(multiplierMissed, multiplierSettings, -7, true, 4)).toBe(-2);
  });

  it('with the miss-penalty override on, a miss costs the flat custom amount regardless of mode', () => {
    const flatSettings = {
      ...DEFAULT_SCORING, spread_is_multiplier: false, spread_points: 2,
      spread_miss_penalty_enabled: true, spread_miss_penalty_points: 5,
    };
    const flatMissed = makeGame({ home_score: 20, away_score: 17 });
    expect(scoreSpread(flatMissed, flatSettings, -7, true, 1)).toBe(-5);

    const multiplierSettings = {
      ...DEFAULT_SCORING, spread_is_multiplier: true, spread_points: 1.5,
      spread_miss_penalty_enabled: true, spread_miss_penalty_points: 5,
    };
    const multiplierMissed = makeGame({ home_score: 20, away_score: 17 });
    expect(scoreSpread(multiplierMissed, multiplierSettings, -7, true, 4)).toBe(-5);

    // A cover is unaffected by the override, in either mode.
    const flatCovered = makeGame({ home_score: 30, away_score: 10 });
    expect(scoreSpread(flatCovered, flatSettings, -7, true, 1)).toBe(2);
  });
});

describe('buildLeaderboard', () => {
  const members: LeagueMember[] = [
    { league_id: 'L', user_id: 'u1', display_name: 'Alice', role: 'commissioner', joined_at: '2026-01-01', avatar_type: 'initial', avatar_value: '' },
    { league_id: 'L', user_id: 'u2', display_name: 'Bob', role: 'member', joined_at: '2026-01-01', avatar_type: 'initial', avatar_value: '' },
  ];

  const draftPicks: DraftPick[] = [
    { id: 'p1', league_id: 'L', user_id: 'u1', team_id: 't1', team_name: 'Team One', team_logo: '', team_conference: 'SEC', round: 1, pick_number: 1, picked_at: '' },
    { id: 'p2', league_id: 'L', user_id: 'u2', team_id: 't2', team_name: 'Team Two', team_logo: '', team_conference: 'Sun Belt', round: 1, pick_number: 2, picked_at: '' },
  ];

  const captainPicks: CaptainPick[] = [
    { id: 'c1', league_id: 'L', user_id: 'u1', team_id: 't1', week: 1, picked_at: '' },
  ];

  const gameData: GameData = {
    t1: { 1: makeGame({ week: 1, result: 'W', opponent_rank: 20 }) }, // win + ranked bonus, then doubled (captain)
    t2: { 1: makeGame({ week: 1, result: 'L', is_g5_opponent: true, home_score: 10, away_score: 30 }) }, // loss + G5 penalty
  };

  const seasonStats = new Map<string, TeamSeasonStats>();

  it('sums weekly game points, manual bonuses, and stat bonuses into total_points, sorted descending', () => {
    const settings = { ...DEFAULT_SCORING, stat_bonus_enabled: false };
    const manualBonuses = [
      { id: 'b1', league_id: 'L', user_id: 'u2', type: 'bowl_eligible' as const, team_id: 't2', team_name: 'Team Two', points: 5, note: '', awarded_at: '', awarded_by: 'u1' },
    ];

    const board = buildLeaderboard(
      members, draftPicks, captainPicks, gameData, settings, manualBonuses, seasonStats,
      true, [], [], [], 1, 1,
    );

    const alice = board.find(e => e.user_id === 'u1')!;
    const bob = board.find(e => e.user_id === 'u2')!;

    // Alice: win (1) + ranked bonus (1) = 2, doubled for captain = 4
    expect(alice.total_points).toBe((DEFAULT_SCORING.win + DEFAULT_SCORING.win_ranked) * 2);
    // Bob: loss (-1) + G5 penalty (-5) = -6, plus a +5 manual bonus = -1
    expect(bob.total_points).toBe(DEFAULT_SCORING.loss + DEFAULT_SCORING.loss_g5 + 5);

    // Sorted descending by total_points
    expect(board[0].user_id).toBe('u1');
  });
});

describe('calcWeeklyScore correction_points', () => {
  const roster = [{ team_id: 't1', team_name: 'Team One', team_logo: '', team_conference: 'SEC', team_color: '' }];
  const gameData: GameData = { t1: { 1: makeGame({ week: 1, result: 'W' }) } };

  function makeCorrection(overrides: Partial<ScoreCorrection> = {}): ScoreCorrection {
    return {
      id: 'c1', league_id: 'L', user_id: 'u1', week: 1, team_id: null, team_name: null,
      points: 3, note: '', created_at: '', created_by: 'commish',
      ...overrides,
    };
  }

  it('adds a matching correction into the week total and correction_points', () => {
    const score = calcWeeklyScore('u1', 1, roster, [], gameData, DEFAULT_SCORING, [], [], [makeCorrection({ points: 3 })]);
    expect(score.correction_points).toBe(3);
    expect(score.points).toBe(DEFAULT_SCORING.win + 3);
  });

  it('sums multiple corrections in the same week for the same user', () => {
    const corrections = [makeCorrection({ id: 'c1', points: 3 }), makeCorrection({ id: 'c2', points: -1 })];
    const score = calcWeeklyScore('u1', 1, roster, [], gameData, DEFAULT_SCORING, [], [], corrections);
    expect(score.correction_points).toBe(2);
  });

  it('excludes corrections for a different user or week', () => {
    const corrections = [
      makeCorrection({ id: 'c1', user_id: 'u2', points: 10 }),
      makeCorrection({ id: 'c2', week: 2, points: 10 }),
    ];
    const score = calcWeeklyScore('u1', 1, roster, [], gameData, DEFAULT_SCORING, [], [], corrections);
    expect(score.correction_points).toBe(0);
    expect(score.points).toBe(DEFAULT_SCORING.win);
  });

  it('defaults to no corrections when the param is omitted', () => {
    const score = calcWeeklyScore('u1', 1, roster, [], gameData, DEFAULT_SCORING);
    expect(score.correction_points).toBe(0);
  });
});
