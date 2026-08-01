import { describe, it, expect } from 'vitest';
import { rosterAtWeek, currentRosters } from './roster';
import type { DraftPick, FreeAgencyMove, LeagueMember } from '../types';

const draftPicks: DraftPick[] = [
  { id: 'p1', league_id: 'L', user_id: 'u1', team_id: 'team-a', team_name: 'Team A', team_logo: '', team_conference: 'SEC', round: 1, pick_number: 1, picked_at: '' },
  { id: 'p2', league_id: 'L', user_id: 'u1', team_id: 'team-b', team_name: 'Team B', team_logo: '', team_conference: 'ACC', round: 2, pick_number: 3, picked_at: '' },
];

// u1 drops Team A and adds Team C in week 5.
const freeAgencyMoves: FreeAgencyMove[] = [
  {
    id: 'm1', league_id: 'L', user_id: 'u1', week: 5,
    dropped_team_id: 'team-a', dropped_team_name: 'Team A', dropped_team_logo: '', dropped_team_conference: 'SEC',
    added_team_id: 'team-c', added_team_name: 'Team C', added_team_logo: '', added_team_conference: 'Sun Belt',
    penalty_points: -3, created_at: '2026-10-01T00:00:00Z',
  },
];

describe('rosterAtWeek', () => {
  it('returns just the drafted baseline before any swap week', () => {
    const roster = rosterAtWeek('u1', 4, draftPicks, freeAgencyMoves);
    const ids = roster.map(t => t.team_id).sort();
    expect(ids).toEqual(['team-a', 'team-b']);
  });

  it('applies the swap starting exactly on its effective week', () => {
    const roster = rosterAtWeek('u1', 5, draftPicks, freeAgencyMoves);
    const ids = roster.map(t => t.team_id).sort();
    expect(ids).toEqual(['team-b', 'team-c']);
  });

  it('keeps the swap applied for all later weeks', () => {
    const roster = rosterAtWeek('u1', 12, draftPicks, freeAgencyMoves);
    const ids = roster.map(t => t.team_id).sort();
    expect(ids).toEqual(['team-b', 'team-c']);
  });

  it('returns an empty roster for a user with no draft picks', () => {
    expect(rosterAtWeek('nobody', 10, draftPicks, freeAgencyMoves)).toEqual([]);
  });
});

describe('currentRosters', () => {
  const members: LeagueMember[] = [
    { league_id: 'L', user_id: 'u1', display_name: 'Alice', role: 'commissioner', joined_at: '', avatar_type: 'initial', avatar_value: '' },
  ];

  it('maps each member to their roster as of the given week', () => {
    const map = currentRosters(members, draftPicks, freeAgencyMoves, 5);
    const ids = (map.get('u1') ?? []).map(t => t.team_id).sort();
    expect(ids).toEqual(['team-b', 'team-c']);
  });
});
