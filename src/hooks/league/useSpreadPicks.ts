import { useCallback, type MutableRefObject } from 'react';
import type { User } from '@supabase/supabase-js';
import posthog from 'posthog-js';
import { supabase } from '../../lib/supabase';
import type { League, SpreadPick, CaptainPick } from '../../types';
import type { SetState } from './useLeagueCore';

export function useSpreadPicks(
  league: League | null,
  isCommissioner: boolean,
  setSpreadPicks: SetState<SpreadPick[]>,
  leagueRef: MutableRefObject<League | null>,
  userRef: MutableRefObject<User | null>,
  spreadPicksRef: MutableRefObject<SpreadPick[]>,
  captainPicksRef: MutableRefObject<CaptainPick[]>,
) {
  const setSpreadPick = useCallback(async (
    week: number,
    teamId: string,
    lockedSpread: number,
    side: 'cover' | 'against' = 'cover',
  ): Promise<{ error?: string }> => {
    const league = leagueRef.current;
    const user   = userRef.current;
    const spreadPicks = spreadPicksRef.current;
    const captainPicks = captainPicksRef.current;
    if (!league || !user) return { error: 'Not ready' };
    const settings = league.scoring;

    // Validate: check season usage for this team
    const teamSeasonPicks = spreadPicks.filter(
      p => p.user_id === user.id && p.team_id === teamId
    );
    const alreadyThisWeek = teamSeasonPicks.find(p => p.week === week);
    if (!alreadyThisWeek && teamSeasonPicks.length >= settings.spread_max_per_team) {
      return { error: `This team has reached the season spread limit (${settings.spread_max_per_team})` };
    }

    // Validate: max picks per week
    const weekPicks = spreadPicks.filter(
      p => p.user_id === user.id && p.week === week && p.team_id !== teamId
    );
    if (!alreadyThisWeek && weekPicks.length >= settings.spread_max_per_week) {
      return { error: `You can only make ${settings.spread_max_per_week} spread picks per week` };
    }

    // Validate: captain stack rule
    if (!settings.spread_allow_captain_stack) {
      const captainThisWeek = captainPicks.find(
        p => p.user_id === user.id && p.week === week
      );
      if (captainThisWeek?.team_id === teamId) {
        return { error: 'Captain stacking is not allowed — pick a different team for the spread' };
      }
    }

    const { error: err } = await supabase.from('spread_picks').upsert({
      league_id:    league.id,
      user_id:      user.id,
      team_id:      teamId,
      week,
      locked_spread: lockedSpread,
      side,
      picked_at:    new Date().toISOString(),
      result:       null,
      points:       null,
      commissioner_override: false,
    }, { onConflict: 'league_id,user_id,team_id,week' });

    if (err) return { error: err.message };
    // Fetch the real record from Supabase to get the actual ID
    const { data: saved } = await supabase
      .from('spread_picks')
      .select('*')
      .eq('league_id', league.id)
      .eq('user_id', user.id)
      .eq('team_id', teamId)
      .eq('week', week)
      .single();
    if (saved) {
      setSpreadPicks(prev => {
        const without = prev.filter(p => !(p.user_id === user.id && p.team_id === teamId && p.week === week));
        return [...without, saved as SpreadPick];
      });
      posthog.capture('spread_pick_made', { week });
    }
    return {};
  }, []);

  const removeSpreadPick = useCallback(async (week: number, teamId: string): Promise<{ error?: string }> => {
    const league = leagueRef.current;
    const user   = userRef.current;
    const spreadPicks = spreadPicksRef.current;
    if (!league || !user) return { error: 'Not ready' };
    const pick = spreadPicks.find(
      p => p.user_id === user.id && p.week === week && p.team_id === teamId
    );
    if (!pick) return {};
    // Update local state immediately
    setSpreadPicks(prev => prev.filter(p => p.id !== pick.id));
    const { error: err } = await supabase
      .from('spread_picks').delete().eq('id', pick.id);
    if (err) {
      // Revert on error
      setSpreadPicks(prev => [...prev, pick]);
      return { error: err.message };
    }
    posthog.capture('spread_pick_removed', { week });
    return {};
  }, []);

  // Commissioner: override spread result
  const overrideSpreadResult = async (
    pickId: string,
    result: 'covered' | 'missed' | 'push',
    points: number,
  ): Promise<{ error?: string }> => {
    if (!league || !isCommissioner) return { error: 'Not authorized' };
    // A push is always worth 0, regardless of what the caller passes — enforced
    // here rather than trusted from every call site, matching the auto-scoring
    // path in scoreSpread().
    const resolvedPoints = result === 'push' ? 0 : points;
    const { error: err } = await supabase
      .from('spread_picks')
      .update({ result, points: resolvedPoints, commissioner_override: true })
      .eq('id', pickId);
    if (err) return { error: err.message };
    return {};
  };

  // Commissioner: clear override and let auto-scoring handle it
  const clearSpreadOverride = async (pickId: string): Promise<{ error?: string }> => {
    if (!league || !isCommissioner) return { error: 'Not authorized' };
    const { error: err } = await supabase
      .from('spread_picks')
      .update({ result: null, points: null, commissioner_override: false })
      .eq('id', pickId);
    if (err) return { error: err.message };
    return {};
  };

  return { setSpreadPick, removeSpreadPick, overrideSpreadResult, clearSpreadOverride };
}
