import { useState, useEffect, useCallback } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type {
  League, LeagueMember, DraftPick, CaptainPick,
  ManualBonus, RosterEntry,
} from '../types';

export function useLeague(user: User | null) {
  const [allLeagues, setAllLeagues]     = useState<League[]>([]);
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(null);
  const [members, setMembers]           = useState<LeagueMember[]>([]);
  const [draftPicks, setDraftPicks]     = useState<DraftPick[]>([]);
  const [captainPicks, setCaptainPicks] = useState<CaptainPick[]>([]);
  const [manualBonuses, setManualBonuses] = useState<ManualBonus[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);

  const league = allLeagues.find(l => l.id === selectedLeagueId) ?? null;

  const rosters = new Map<string, RosterEntry[]>();
  draftPicks.forEach(pick => {
    if (!rosters.has(pick.user_id)) rosters.set(pick.user_id, []);
    rosters.get(pick.user_id)!.push({
      team_id:         pick.team_id,
      team_name:       pick.team_name,
      team_logo:       pick.team_logo,
      team_conference: pick.team_conference,
      team_color:      '#052e16',
    });
  });

  const myMembership = members.find(m => m.user_id === user?.id);
  const isCommissioner = myMembership?.role === 'commissioner';

  // Load all leagues this user belongs to
  const loadAllLeagues = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    setError(null);

    try {
      const { data: memberships, error: memErr } = await supabase
        .from('league_members')
        .select('league_id, leagues(*)')
        .eq('user_id', user.id);

      if (memErr) throw memErr;
      if (!memberships || memberships.length === 0) {
        setAllLeagues([]);
        setSelectedLeagueId(null);
        setLoading(false);
        return;
      }

      const leagues = memberships.map((m: any) => m.leagues as League);
      setAllLeagues(leagues);

      // Select stored league or default to first
      const stored = localStorage.getItem(`gridiron_league_${user.id}`);
      const toSelect = stored && leagues.find(l => l.id === stored)
        ? stored
        : leagues[0].id;

      setSelectedLeagueId(toSelect);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load leagues');
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Load data for the selected league
  const loadLeagueData = useCallback(async (leagueId: string) => {
    const [membersRes, picksRes, captainRes, bonusRes] = await Promise.all([
      supabase.from('league_members').select('*').eq('league_id', leagueId),
      supabase.from('draft_picks').select('*').eq('league_id', leagueId).order('pick_number'),
      supabase.from('captain_picks').select('*').eq('league_id', leagueId),
      supabase.from('manual_bonuses').select('*').eq('league_id', leagueId),
    ]);

    if (membersRes.data)  setMembers(membersRes.data);
    if (picksRes.data)    setDraftPicks(picksRes.data);
    if (captainRes.data)  setCaptainPicks(captainRes.data);
    if (bonusRes.data)    setManualBonuses(bonusRes.data);
  }, []);

  useEffect(() => { loadAllLeagues(); }, [loadAllLeagues]);

  useEffect(() => {
    if (!selectedLeagueId) return;
    loadLeagueData(selectedLeagueId);
  }, [selectedLeagueId, loadLeagueData]);

  // Switch to a different league
  const switchLeague = (leagueId: string) => {
    if (!user) return;
    setSelectedLeagueId(leagueId);
    localStorage.setItem(`gridiron_league_${user.id}`, leagueId);
    // Clear current league data while loading new one
    setMembers([]);
    setDraftPicks([]);
    setCaptainPicks([]);
    setManualBonuses([]);
  };

  // Real-time subscription for the selected league
  useEffect(() => {
    if (!league) return;
    const channel = supabase
      .channel(`league:${league.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'draft_picks',
        filter: `league_id=eq.${league.id}`,
      }, payload => {
        if (payload.eventType === 'INSERT') {
          setDraftPicks(prev => [...prev, payload.new as DraftPick].sort((a, b) => a.pick_number - b.pick_number));
        } else if (payload.eventType === 'DELETE') {
          setDraftPicks(prev => prev.filter(p => p.id !== payload.old.id));
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'leagues',
        filter: `id=eq.${league.id}`,
      }, payload => {
        setAllLeagues(prev => prev.map(l => l.id === league.id ? payload.new as League : l));
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'captain_picks',
        filter: `league_id=eq.${league.id}`,
      }, () => {
        supabase.from('captain_picks').select('*').eq('league_id', league.id)
          .then(({ data }) => { if (data) setCaptainPicks(data); });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [league?.id]);

  // ─── Actions ──────────────────────────────────────────────────────────────

  const createLeague = async (name: string, maxTeams: number, playerCount: number) => {
    if (!user) return { error: 'Not logged in' };

    const { data: lg, error: lgErr } = await supabase
      .from('leagues')
      .insert({
        name,
        created_by: user.id,
        max_teams_per_user: maxTeams,
        draft_order: [user.id],
        draft_status: 'pending',
        draft_current_pick: 1,
        scoring: {
          win: 1, win_ranked: 1, win_top15: 2, win_top5: 3, loss: -1, loss_g5: -5,
        },
      })
      .select()
      .single();

    if (lgErr) return { error: lgErr.message };

    const { error: memErr } = await supabase.from('league_members').insert({
      league_id: lg.id,
      user_id:   user.id,
      display_name: user.user_metadata?.display_name ?? user.email ?? 'Commissioner',
      role: 'commissioner',
    });

    if (memErr) return { error: memErr.message };

    // Add new league to list and switch to it
    setAllLeagues(prev => [...prev, lg]);
    setSelectedLeagueId(lg.id);
    localStorage.setItem(`gridiron_league_${user.id}`, lg.id);

    return { league: lg };
  };

  const sendInvite = async (email: string) => {
    if (!league) return { error: 'No league' };
    const { data, error } = await supabase
      .from('invites')
      .insert({ league_id: league.id, invited_email: email, invited_by: user!.id })
      .select()
      .single();
    if (error) return { error: error.message };
    return { token: data.token };
  };

  const startDraft = async (orderedUserIds: string[]) => {
    if (!league) return;
    await supabase.from('leagues').update({
      draft_status: 'active',
      draft_order: orderedUserIds,
      draft_current_pick: 1,
    }).eq('id', league.id);
  };

  const makeDraftPick = async (teamId: string, teamName: string, teamLogo: string, teamConf: string) => {
    if (!league || !user) return { error: 'Not ready' };
    const pickNum = league.draft_current_pick;
    const totalPicks = league.max_teams_per_user * league.draft_order.length;
    if (pickNum > totalPicks) return { error: 'Draft is over' };

    const round = Math.ceil(pickNum / league.draft_order.length);

    const { error: pickErr } = await supabase.from('draft_picks').insert({
      league_id:       league.id,
      user_id:         user.id,
      team_id:         teamId,
      team_name:       teamName,
      team_logo:       teamLogo,
      team_conference: teamConf,
      round,
      pick_number: pickNum,
    });
    if (pickErr) return { error: pickErr.message };

    const next = pickNum + 1;
    await supabase.from('leagues').update({
      draft_current_pick: next,
      draft_status: next > totalPicks ? 'complete' : 'active',
    }).eq('id', league.id);

    return {};
  };

  const resetDraft = async () => {
    if (!league) return { error: 'No league' };

    const { error: deleteErr } = await supabase
      .from('draft_picks')
      .delete()
      .eq('league_id', league.id);

    if (deleteErr) return { error: deleteErr.message };

    const { error: updateErr } = await supabase
      .from('leagues')
      .update({
        draft_status: 'pending',
        draft_current_pick: 1,
        draft_order: [],
      })
      .eq('id', league.id);

    if (updateErr) return { error: updateErr.message };

    setDraftPicks([]);
    return {};
  };

  const setCaptain = async (week: number, teamId: string) => {
    if (!league || !user) return;
    const uses = captainPicks.filter(p => p.user_id === user.id && p.team_id === teamId).length;
    const existing = captainPicks.find(p => p.user_id === user.id && p.week === week);
    if (existing?.team_id === teamId) {
      await supabase.from('captain_picks').delete().eq('id', existing.id);
    } else {
      if (!existing && uses >= 2) return;
      await supabase.from('captain_picks').upsert({
        league_id: league.id,
        user_id:   user.id,
        team_id:   teamId,
        week,
      }, { onConflict: 'league_id,user_id,week' });
    }
  };

  const addManualBonus = async (bonus: Omit<ManualBonus, 'id' | 'awarded_at' | 'awarded_by' | 'league_id'>) => {
    if (!league || !user) return;
    const { data, error } = await supabase.from('manual_bonuses').insert({
      ...bonus,
      league_id:  league.id,
      awarded_by: user.id,
    }).select().single();
    if (!error && data) setManualBonuses(prev => [...prev, data]);
  };

  const removeManualBonus = async (id: string) => {
    await supabase.from('manual_bonuses').delete().eq('id', id);
    setManualBonuses(prev => prev.filter(b => b.id !== id));
  };

  const updateWeek = async (week: number) => {
    if (!league) return;
    await supabase.from('leagues').update({ current_week: week }).eq('id', league.id);
  };

  const updateScoring = async (scoring: League['scoring']) => {
    if (!league) return;
    await supabase.from('leagues').update({ scoring }).eq('id', league.id);
  };

  const removeFromRoster = async (userId: string, teamId: string) => {
    if (!league) return;
    await supabase.from('draft_picks')
      .delete()
      .eq('league_id', league.id)
      .eq('user_id', userId)
      .eq('team_id', teamId);
    setDraftPicks(prev => prev.filter(p => !(p.user_id === userId && p.team_id === teamId)));
  };

  return {
    league, allLeagues, selectedLeagueId,
    members, draftPicks, captainPicks, manualBonuses,
    rosters, myMembership, isCommissioner, loading, error,
    switchLeague, createLeague, sendInvite, startDraft, makeDraftPick, resetDraft,
    setCaptain, addManualBonus, removeManualBonus,
    updateWeek, updateScoring, removeFromRoster, reload: loadAllLeagues,
  };
}
