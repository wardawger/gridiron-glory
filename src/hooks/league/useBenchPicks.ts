import { useCallback, type MutableRefObject } from 'react';
import type { User } from '@supabase/supabase-js';
import posthog from 'posthog-js';
import { supabase } from '../../lib/supabase';
import type { League, BenchPick } from '../../types';
import type { SetState } from './useLeagueCore';

export function useBenchPicks(
  setBenchPicks: SetState<BenchPick[]>,
  leagueRef: MutableRefObject<League | null>,
  userRef: MutableRefObject<User | null>,
  benchPicksRef: MutableRefObject<BenchPick[]>,
) {
  // Exact-count invariant means a lineup can never be "half set" — moving a
  // team requires swapping it with one on the other side, not an
  // independent toggle. Kickoff-lock (both teams must be pre-kickoff) is
  // checked by the caller, which has the game data this hook doesn't.
  const swapBench = useCallback(async (
    week: number,
    benchTeamId: string,
    starterTeamId: string,
  ): Promise<{ error?: string }> => {
    const league = leagueRef.current;
    const user   = userRef.current;
    const benchPicks = benchPicksRef.current;
    if (!league || !user) return { error: 'Not ready' };
    if (benchTeamId === starterTeamId) return {};

    const benchRow = benchPicks.find(
      p => p.user_id === user.id && p.week === week && p.team_id === benchTeamId
    );
    if (!benchRow) return { error: 'That team is not currently benched' };
    const alreadyBenched = benchPicks.some(
      p => p.user_id === user.id && p.week === week && p.team_id === starterTeamId
    );
    if (alreadyBenched) return { error: 'That team is already benched' };

    setBenchPicks(prev => prev.filter(p => p.id !== benchRow.id));

    const { error: delErr } = await supabase.from('bench_picks').delete().eq('id', benchRow.id);
    if (delErr) {
      setBenchPicks(prev => [...prev, benchRow]);
      return { error: delErr.message };
    }

    const { data: saved, error: insErr } = await supabase
      .from('bench_picks')
      .insert({
        league_id: league.id,
        user_id:   user.id,
        team_id:   starterTeamId,
        week,
        picked_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insErr) {
      // The promote (delete) already committed — restore it locally so the
      // UI doesn't show a mismatched count, but the swap's demote half
      // genuinely failed and needs to be surfaced.
      setBenchPicks(prev => [...prev, benchRow]);
      return { error: insErr.message };
    }

    if (saved) setBenchPicks(prev => [...prev, saved as BenchPick]);
    posthog.capture('bench_swap', { week });
    return {};
  }, []);

  // First visit to a week with no bench rows yet: seed a valid lineup so
  // the exact-count invariant holds immediately, no incomplete state ever
  // exists. Carries over the previous week's selection when it still
  // applies to this roster, otherwise benches the last `bench_count`
  // entries in roster order (a draft-order proxy for a fresh roster).
  const ensureBenchSeeded = useCallback(async (
    week: number,
    rosterTeamIds: string[],
  ): Promise<void> => {
    const league = leagueRef.current;
    const user   = userRef.current;
    const benchPicks = benchPicksRef.current;
    if (!league || !user || !league.scoring.bench_enabled) return;

    const benchCount = league.scoring.bench_count;
    if (benchCount <= 0) return;

    const existing = benchPicks.filter(p => p.user_id === user.id && p.week === week);
    if (existing.length > 0) return;

    const prevWeekBench = benchPicks
      .filter(p => p.user_id === user.id && p.week === week - 1 && rosterTeamIds.includes(p.team_id))
      .map(p => p.team_id);

    const toBench = prevWeekBench.length === benchCount
      ? prevWeekBench
      : rosterTeamIds.slice(-benchCount);

    if (toBench.length === 0) return;

    const rows = toBench.map(team_id => ({
      league_id: league.id,
      user_id:   user.id,
      team_id,
      week,
      picked_at: new Date().toISOString(),
    }));

    const { data: saved, error: err } = await supabase.from('bench_picks').insert(rows).select();
    if (!err && saved) {
      setBenchPicks(prev => [...prev, ...(saved as BenchPick[])]);
    }
  }, []);

  return { swapBench, ensureBenchSeeded };
}
