import { describe, it, expect } from 'vitest';
import { computeDueNotifications, type LeagueSnapshot } from './notifications';
import { DEFAULT_SCORING } from '../types';

const NOW = new Date('2026-10-10T15:00:00Z'); // 11:00 America/New_York (EDT)

function game(over: Record<string, unknown> = {}) {
  return {
    week: 6, opponent: 'Opp', opponent_id: 'x', opponent_rank: null, opponent_logo: null,
    opponent_color: null, result: null, is_g6_opponent: false, home_score: null, away_score: null,
    completed: false, start_date: '2026-10-10T20:00:00Z', is_home: true, ...over,
  };
}

function snap(over: { scoring?: object; games?: Record<string, unknown>; captain?: number; bench?: number; spread?: number } = {}): LeagueSnapshot {
  const rows = (n: number, extra = {}) =>
    Array.from({ length: n }, (_, i) => ({ id: String(i), league_id: 'L', user_id: 'u1', team_id: `t${i}`, week: 6, ...extra }));
  return {
    league: { id: 'L', name: 'Test League', current_week: 6, scoring: { ...DEFAULT_SCORING, ...over.scoring } } as any,
    members: [{ user_id: 'u1' } as any],
    draftPicks: [{ id: 'd', league_id: 'L', user_id: 'u1', team_id: 'a', team_name: 'Alpha', team_logo: '', team_conference: 'SEC', round: 1, pick_number: 1, picked_at: '' } as any],
    moves: [],
    captainPicks: rows(over.captain ?? 0) as any,
    benchPicks: rows(over.bench ?? 0) as any,
    spreadPicks: rows(over.spread ?? 0) as any,
    gameData: { a: { 6: game(over.games) } } as any,
  };
}

describe('computeDueNotifications', () => {
  it('sends a morning captain reminder on game day when none is set', () => {
    const due = computeDueNotifications(snap(), NOW);
    expect(due.map(d => d.kind)).toEqual(['captain']);
    expect(due[0].dedupe_key).toMatch(/:morning$/);
  });

  it('sends nothing when the captain is already set', () => {
    expect(computeDueNotifications(snap({ captain: 1 }), NOW)).toEqual([]);
  });

  it('is quiet before 9am local on game day', () => {
    expect(computeDueNotifications(snap(), new Date('2026-10-10T11:00:00Z'))).toEqual([]);
  });

  it('is quiet when the game is on a later day', () => {
    expect(computeDueNotifications(snap({ games: { start_date: '2026-10-11T20:00:00Z' } }), NOW)).toEqual([]);
  });

  it('switches to the pre-lock stage within an hour of kickoff', () => {
    const due = computeDueNotifications(snap({ games: { start_date: '2026-10-10T15:30:00Z' } }), NOW);
    expect(due[0].dedupe_key).toMatch(/:pre$/);
  });

  it('stops reminding once the team has kicked off', () => {
    expect(computeDueNotifications(snap({ games: { start_date: '2026-10-10T14:00:00Z' } }), NOW)).toEqual([]);
  });

  it('only reminds about bets when spread betting is enabled', () => {
    const off = computeDueNotifications(snap({ captain: 1 }), NOW);
    expect(off).toEqual([]);
    const on = computeDueNotifications(snap({ captain: 1, scoring: { spread_enabled: true, spread_max_per_week: 2 }, spread: 1 }), NOW);
    expect(on.map(d => d.kind)).toEqual(['bets']);
    expect(on[0].body).toContain('1 spread pick left');
  });

  it('only reminds about lineup when the bench is enabled and short', () => {
    const scoring = { bench_enabled: true, bench_count: 2, starters_count: 8 };
    expect(computeDueNotifications(snap({ captain: 1, scoring, bench: 2 }), NOW)).toEqual([]);
    const due = computeDueNotifications(snap({ captain: 1, scoring, bench: 1 }), NOW);
    expect(due.map(d => d.kind)).toEqual(['lineup']);
  });

  it('sends a final-score alert for a recently completed game', () => {
    const due = computeDueNotifications(
      snap({ captain: 1, games: { completed: true, result: 'W', home_score: 34, away_score: 10, start_date: '2026-10-10T12:00:00Z' } }),
      NOW,
    );
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ kind: 'scores', title: 'Final: Alpha 34-10' });
  });

  it('ignores old completed games', () => {
    const due = computeDueNotifications(
      snap({ captain: 1, games: { completed: true, result: 'W', home_score: 34, away_score: 10, start_date: '2026-10-01T12:00:00Z' } }),
      NOW,
    );
    expect(due).toEqual([]);
  });
});
