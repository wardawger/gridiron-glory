import type { User } from '@supabase/supabase-js';
import posthog from 'posthog-js';
import { supabase } from '../../lib/supabase';
import type { League, ScoreCorrection } from '../../types';
import type { SetState } from './useLeagueCore';

export function useScoreCorrections(
  league: League | null,
  user: User | null,
  isCommissioner: boolean,
  setScoreCorrections: SetState<ScoreCorrection[]>,
) {
  const addScoreCorrection = async (
    correction: Omit<ScoreCorrection, 'id' | 'league_id' | 'created_at' | 'created_by'>,
  ): Promise<{ error?: string }> => {
    if (!league || !user || !isCommissioner) return { error: 'Not authorized' };
    const { data, error } = await supabase.from('score_corrections').insert({
      ...correction,
      league_id:  league.id,
      created_by: user.id,
    }).select().single();
    if (error) return { error: error.message };
    if (data) {
      setScoreCorrections(prev => [...prev, data as ScoreCorrection]);
      posthog.capture('score_correction_added', { week: correction.week });
    }
    return {};
  };

  const removeScoreCorrection = async (id: string): Promise<{ error?: string }> => {
    if (!league || !isCommissioner) return { error: 'Not authorized' };
    const { error } = await supabase.from('score_corrections').delete().eq('id', id);
    if (error) return { error: error.message };
    setScoreCorrections(prev => prev.filter(c => c.id !== id));
    return {};
  };

  return { addScoreCorrection, removeScoreCorrection };
}
