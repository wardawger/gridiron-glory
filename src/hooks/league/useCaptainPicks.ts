import { useCallback, type MutableRefObject } from 'react';
import type { User } from '@supabase/supabase-js';
import posthog from 'posthog-js';
import { supabase } from '../../lib/supabase';
import type { League, CaptainPick } from '../../types';
import { normalizeScoring } from '../../types';
import type { SetState } from './useLeagueCore';

export function useCaptainPicks(
  setCaptainPicks: SetState<CaptainPick[]>,
  leagueRef: MutableRefObject<League | null>,
  userRef: MutableRefObject<User | null>,
  captainPicksRef: MutableRefObject<CaptainPick[]>,
) {
  // Toggles one team's captaincy for a week. A week may now hold several
  // captains (up to scoring.captain_max_per_week), so this adds and removes
  // individual picks rather than replacing "the" pick for the week.
  const setCaptain = useCallback(async (week: number, teamId: string) => {
    const league = leagueRef.current;
    const user   = userRef.current;
    const captainPicks = captainPicksRef.current;
    if (!league || !user) { console.warn('[setCaptain] no league or user'); return; }

    const scoring = normalizeScoring(league.scoring);
    const mine = captainPicks.filter(p => p.user_id === user.id);
    const existing = mine.find(p => p.week === week && p.team_id === teamId);

    if (existing) {
      // Remove this captain — update local state immediately
      setCaptainPicks(prev => prev.filter(p => p.id !== existing.id));
      const { error } = await supabase.from('captain_picks').delete().eq('id', existing.id);
      if (!error) posthog.capture('captain_removed', { week });
      return;
    }

    // Both caps are checked here as well as in the UI: the UI disables the
    // control, this stops a stale client from writing past the limit.
    const weekCount = mine.filter(p => p.week === week).length;
    if (weekCount >= scoring.captain_max_per_week) return;

    const teamUses = mine.filter(p => p.team_id === teamId).length;
    if (teamUses >= scoring.captain_max_per_team_season) return;

    // Freeze the multiplier at pick time so a later settings change cannot
    // rescore this week.
    const lockedMultiplier = scoring.captain_multiplier;
    const tempId = `temp-${Date.now()}-${teamId}`;
    const newPick: CaptainPick = {
      id: tempId,
      league_id: league.id,
      user_id:   user.id,
      team_id:   teamId,
      week,
      picked_at: new Date().toISOString(),
      locked_multiplier: lockedMultiplier,
    };
    setCaptainPicks(prev => [...prev, newPick]);

    const { data, error } = await supabase.from('captain_picks').insert({
      league_id: league.id,
      user_id:   user.id,
      team_id:   teamId,
      week,
      locked_multiplier: lockedMultiplier,
    }).select().single();

    if (error) {
      // Roll the optimistic row back rather than leaving a pick on screen
      // that does not exist on the server.
      setCaptainPicks(prev => prev.filter(p => p.id !== tempId));
      console.warn('[setCaptain] insert failed', error.message);
      return;
    }
    if (data) {
      setCaptainPicks(prev => prev.map(p => (p.id === tempId ? data as CaptainPick : p)));
      posthog.capture('captain_selected', { week });
    }
  }, []);

  return { setCaptain };
}
