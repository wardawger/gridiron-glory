import type { User } from '@supabase/supabase-js';
import posthog from 'posthog-js';
import { supabase } from '../../lib/supabase';
import type { League, ManualBonus } from '../../types';
import type { SetState } from './useLeagueCore';

export function useManualBonuses(
  league: League | null,
  user: User | null,
  setManualBonuses: SetState<ManualBonus[]>,
) {
  const addManualBonus = async (bonus: Omit<ManualBonus, 'id' | 'awarded_at' | 'awarded_by' | 'league_id'>) => {
    if (!league || !user) return;
    const { data, error } = await supabase.from('manual_bonuses').insert({
      ...bonus,
      league_id:  league.id,
      awarded_by: user.id,
    }).select().single();
    if (!error && data) {
      setManualBonuses(prev => [...prev, data]);
      posthog.capture('manual_bonus_awarded', { bonus_type: bonus.type });
    }
  };

  const removeManualBonus = async (id: string) => {
    await supabase.from('manual_bonuses').delete().eq('id', id);
    setManualBonuses(prev => prev.filter(b => b.id !== id));
  };

  return { addManualBonus, removeManualBonus };
}
