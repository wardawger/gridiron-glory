import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Who's actually got the Draft Room open right now, via Supabase Realtime
// Presence — separate from league membership (which says who's *in* the
// league, not who's watching this exact moment). Scoped to its own channel
// per league so it doesn't interfere with useLeagueCore's postgres_changes
// subscription on the same league id.
export function useDraftPresence(
  leagueId: string | undefined,
  userId: string | undefined,
  displayName: string | undefined,
): Set<string> {
  const [online, setOnline] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!leagueId || !userId) { setOnline(new Set()); return; }

    const channel = supabase.channel(`draft-presence:${leagueId}`, {
      config: { presence: { key: userId } },
    });

    const syncOnline = () => {
      const state = channel.presenceState<{ user_id: string }>();
      setOnline(new Set(Object.keys(state)));
    };

    channel
      .on('presence', { event: 'sync' }, syncOnline)
      .subscribe(async status => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ user_id: userId, display_name: displayName ?? '' });
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [leagueId, userId, displayName]);

  return online;
}
