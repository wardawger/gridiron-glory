import type { DraftPick, FreeAgencyMove, LeagueMember, RosterEntry } from '../types';

const TEAM_COLOR = '#052e16';

/**
 * A user's roster is time-bound: the drafted baseline, with any free agency
 * swaps applied in order up through the given week. This lets past weeks keep
 * scoring the team that was actually owned that week, even after a later swap.
 */
export function rosterAtWeek(
  userId: string,
  week: number,
  draftPicks: DraftPick[],
  freeAgencyMoves: FreeAgencyMove[],
): RosterEntry[] {
  const roster = new Map<string, RosterEntry>();

  draftPicks
    .filter(p => p.user_id === userId)
    .forEach(p => {
      roster.set(p.team_id, {
        team_id: p.team_id,
        team_name: p.team_name,
        team_logo: p.team_logo,
        team_conference: p.team_conference,
        team_color: TEAM_COLOR,
      });
    });

  freeAgencyMoves
    .filter(m => m.user_id === userId && m.week <= week)
    .sort((a, b) => a.week - b.week || a.created_at.localeCompare(b.created_at))
    .forEach(m => {
      roster.delete(m.dropped_team_id);
      roster.set(m.added_team_id, {
        team_id: m.added_team_id,
        team_name: m.added_team_name,
        team_logo: m.added_team_logo,
        team_conference: m.added_team_conference,
        team_color: TEAM_COLOR,
      });
    });

  return Array.from(roster.values());
}

// Shared kickoff check — a team's spread pick, captain pick, or bench/starter
// status all lock once its game for the week has actually started. Extracted
// here (moved out of RosterView.tsx, its original single call site) so
// scoring.ts can use the same definition rather than duplicating it.
export function isGameKickedOff(startDate: string | null | undefined): boolean {
  if (!startDate) return false;
  return new Date(startDate) <= new Date();
}

// Free agency moves are always recorded at the league's current week, so a
// member's present-day roster is just their roster as of that week.
export function currentRosters(
  members: LeagueMember[],
  draftPicks: DraftPick[],
  freeAgencyMoves: FreeAgencyMove[],
  currentWeek: number,
): Map<string, RosterEntry[]> {
  const map = new Map<string, RosterEntry[]>();
  members.forEach(m => {
    map.set(m.user_id, rosterAtWeek(m.user_id, currentWeek, draftPicks, freeAgencyMoves));
  });
  return map;
}
