import { useCallback, type MutableRefObject } from 'react';
import type { User } from '@supabase/supabase-js';
import posthog from 'posthog-js';
import { supabase } from '../../lib/supabase';
import type { League, CaptainPick } from '../../types';
import type { SetState } from './useLeagueCore';

export function useCaptainPicks(
  setCaptainPicks: SetState<CaptainPick[]>,
  leagueRef: MutableRefObject<League | null>,
  userRef: MutableRefObject<User | null>,
  captainPicksRef: MutableRefObject<CaptainPick[]>,
) {
  const setCaptain = useCallback(async (week: number, teamId: string) => {
    const league = leagueRef.current;
    const user   = userRef.current;
    const captainPicks = captainPicksRef.current;
    if (!league || !user) { console.warn('[setCaptain] no league or user'); return; }
    const uses = captainPicks.filter(p => p.user_id === user.id && p.team_id === teamId).length;
    const existing = captainPicks.find(p => p.user_id === user.id && p.week === week);

    if (existing?.team_id === teamId) {
      // Remove captain — update local state immediately
      setCaptainPicks(prev => prev.filter(p => p.id !== existing.id));
      const { error } = await supabase.from('captain_picks').delete().eq('id', existing.id);
      if (!error) posthog.capture('captain_removed', { week });
    } else {
      if (!existing && uses >= 2) return;
      // Replace or add captain — update local state immediately
      const newPick: CaptainPick = {
        id: existing?.id ?? `temp-${Date.now()}`,
        league_id: league.id,
        user_id:   user.id,
        team_id:   teamId,
        week,
        picked_at: new Date().toISOString(),
      };
      if (existing) {
        // Replace existing week pick
        setCaptainPicks(prev => prev.map(p =>
          p.id === existing.id ? { ...newPick, id: existing.id } : p
        ));
      } else {
        setCaptainPicks(prev => [...prev, newPick]);
      }
      const { data } = await supabase.from('captain_picks').upsert({
        league_id: league.id,
        user_id:   user.id,
        team_id:   teamId,
        week,
      }, { onConflict: 'league_id,user_id,week' }).select().single();
      // Update with real ID from server
      if (data) {
        setCaptainPicks(prev => prev.map(p =>
          p.id === newPick.id ? data as CaptainPick : p
        ));
        posthog.capture('captain_selected', { week });
      }
    }
  }, []);

  return { setCaptain };
}
