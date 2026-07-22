import { useState, useEffect, useCallback, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type {
  League, LeagueMember, DraftPick, CaptainPick,
  ManualBonus, SpreadPick, FreeAgencyMove, LeagueRole,
} from '../types';
import { P4_CONFERENCES, DRAFT_CONF_MAX, DEFAULT_SCORING } from '../types';
import { rosterAtWeek, currentRosters } from '../services/roster';

export function useLeague(user: User | null) {
  const [allLeagues, setAllLeagues]     = useState<League[]>([]);
  const [allMemberships, setAllMemberships] = useState<Record<string, LeagueRole>>({});
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(null);
  const [members, setMembers]           = useState<LeagueMember[]>([]);
  const [draftPicks, setDraftPicks]     = useState<DraftPick[]>([]);
  const [captainPicks, setCaptainPicks] = useState<CaptainPick[]>([]);
  const [manualBonuses, setManualBonuses] = useState<ManualBonus[]>([]);
  const [spreadPicks, setSpreadPicks]   = useState<SpreadPick[]>([]);
  const [freeAgencyMoves, setFreeAgencyMoves] = useState<FreeAgencyMove[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);

  const league = allLeagues.find(l => l.id === selectedLeagueId) ?? null;

  const rosters = currentRosters(members, draftPicks, freeAgencyMoves, league?.current_week ?? 0);

  const myMembership = members.find(m => m.user_id === user?.id);
  const isCommissioner = myMembership?.role === 'commissioner';

  // Refs so action functions always have fresh values without stale closures
  const leagueRef = useRef(league);
  const userRef   = useRef(user);
  const captainPicksRef = useRef(captainPicks);
  const spreadPicksRef  = useRef(spreadPicks);
  const membersRef      = useRef(members);
  const draftPicksRef   = useRef(draftPicks);
  const freeAgencyMovesRef = useRef(freeAgencyMoves);
  leagueRef.current       = league;
  userRef.current         = user;
  captainPicksRef.current = captainPicks;
  spreadPicksRef.current  = spreadPicks;
  membersRef.current      = members;
  draftPicksRef.current   = draftPicks;
  freeAgencyMovesRef.current = freeAgencyMoves;

  const loadAllLeagues = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    setError(null);

    try {
      const { data: memberships, error: memErr } = await supabase
        .from('league_members')
        .select('league_id, role, leagues(*)')
        .eq('user_id', user.id);

      if (memErr) throw memErr;
      if (!memberships || memberships.length === 0) {
        setAllLeagues([]);
        setAllMemberships({});
        setSelectedLeagueId(null);
        setLoading(false);
        return;
      }

      const leagues = memberships.map((m: any) => m.leagues as League);
      setAllLeagues(leagues);
      setAllMemberships(Object.fromEntries(memberships.map((m: any) => [m.league_id, m.role as LeagueRole])));

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

  const loadLeagueData = useCallback(async (leagueId: string) => {
    const [membersRes, picksRes, captainRes, bonusRes, spreadRes, faRes] = await Promise.all([
      supabase.from('league_members').select('*').eq('league_id', leagueId),
      supabase.from('draft_picks').select('*').eq('league_id', leagueId).order('pick_number'),
      supabase.from('captain_picks').select('*').eq('league_id', leagueId),
      supabase.from('manual_bonuses').select('*').eq('league_id', leagueId),
      supabase.from('spread_picks').select('*').eq('league_id', leagueId),
      supabase.from('free_agency_moves').select('*').eq('league_id', leagueId),
    ]);

    if (membersRes.data)  setMembers(membersRes.data);
    if (picksRes.data)    setDraftPicks(picksRes.data);
    if (captainRes.data)  setCaptainPicks(captainRes.data);
    if (bonusRes.data)    setManualBonuses(bonusRes.data);
    if (spreadRes.data)   setSpreadPicks(spreadRes.data);
    if (faRes.data)       setFreeAgencyMoves(faRes.data);
  }, []);

  useEffect(() => { loadAllLeagues(); }, [loadAllLeagues]);

  useEffect(() => {
    if (!selectedLeagueId) return;
    loadLeagueData(selectedLeagueId);
  }, [selectedLeagueId, loadLeagueData]);

  const switchLeague = (leagueId: string) => {
    if (!user) return;
    setSelectedLeagueId(leagueId);
    localStorage.setItem(`gridiron_league_${user.id}`, leagueId);
    setMembers([]);
    setDraftPicks([]);
    setCaptainPicks([]);
    setManualBonuses([]);
    setSpreadPicks([]);
    setFreeAgencyMoves([]);
  };

  // Real-time subscriptions
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
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'spread_picks',
        filter: `league_id=eq.${league.id}`,
      }, () => {
        supabase.from('spread_picks').select('*').eq('league_id', league.id)
          .then(({ data }) => { if (data) setSpreadPicks(data); });
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'free_agency_moves',
        filter: `league_id=eq.${league.id}`,
      }, payload => {
        setFreeAgencyMoves(prev =>
          prev.some(m => m.id === (payload.new as FreeAgencyMove).id)
            ? prev
            : [...prev, payload.new as FreeAgencyMove]
        );
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
        scoring: DEFAULT_SCORING,
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
      .from('draft_picks').delete().eq('league_id', league.id);

    if (deleteErr) return { error: deleteErr.message };

    const { error: updateErr } = await supabase
      .from('leagues').update({
        draft_status: 'pending',
        draft_current_pick: 1,
        draft_order: [],
      }).eq('id', league.id);

    if (updateErr) return { error: updateErr.message };

    setDraftPicks([]);
    return {};
  };

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
      await supabase.from('captain_picks').delete().eq('id', existing.id);
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
      }
    }
  }, []);

  // ── Spread pick actions ──────────────────────────────────────────────────

  const setSpreadPick = useCallback(async (
    week: number,
    teamId: string,
    lockedSpread: number,
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
    return {};
  }, []);

  // Commissioner: override spread result
  const overrideSpreadResult = async (
    pickId: string,
    result: 'covered' | 'missed',
    points: number,
  ): Promise<{ error?: string }> => {
    if (!league || !isCommissioner) return { error: 'Not authorized' };
    const { error: err } = await supabase
      .from('spread_picks')
      .update({ result, points, commissioner_override: true })
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

  // ── Free agency actions ──────────────────────────────────────────────────

  const makeFreeAgencyMove = useCallback(async (
    droppedTeamId: string, droppedTeamName: string,
    addedTeamId: string, addedTeamName: string, addedTeamLogo: string, addedTeamConference: string,
  ): Promise<{ error?: string }> => {
    const league  = leagueRef.current;
    const user    = userRef.current;
    const members = membersRef.current;
    const draftPicks = draftPicksRef.current;
    const moves   = freeAgencyMovesRef.current;
    if (!league || !user) return { error: 'Not ready' };

    const settings = league.scoring;
    if (!settings.free_agency_enabled) return { error: 'Free agency is not enabled for this league' };

    const week = league.current_week;
    const myMoves = moves.filter(m => m.user_id === user.id);
    if (myMoves.length >= settings.fa_max_moves_per_season) {
      return { error: `You've reached the season limit of ${settings.fa_max_moves_per_season} moves` };
    }
    const myMovesThisWeek = myMoves.filter(m => m.week === week);
    if (myMovesThisWeek.length >= settings.fa_max_moves_per_week) {
      return { error: `You've reached this week's limit of ${settings.fa_max_moves_per_week} moves` };
    }

    const myRoster = rosterAtWeek(user.id, week, draftPicks, moves);
    if (!myRoster.some(t => t.team_id === droppedTeamId)) {
      return { error: 'You do not currently own that team' };
    }

    const allRosters = currentRosters(members, draftPicks, moves, week);
    const isTaken = Array.from(allRosters.values()).some(r => r.some(t => t.team_id === addedTeamId));
    if (isTaken) return { error: 'That team is already owned by another manager' };

    const isP4 = (P4_CONFERENCES as readonly string[]).includes(addedTeamConference);
    if (isP4) {
      const droppedTeam = myRoster.find(t => t.team_id === droppedTeamId);
      const currentConfCount = myRoster.filter(t => t.team_conference === addedTeamConference).length;
      const newConfCount = currentConfCount
        - (droppedTeam?.team_conference === addedTeamConference ? 1 : 0)
        + 1;
      if (newConfCount > DRAFT_CONF_MAX) {
        return { error: `Max ${DRAFT_CONF_MAX} teams from ${addedTeamConference}` };
      }
    }

    const droppedTeam = myRoster.find(t => t.team_id === droppedTeamId)!;
    const penaltyPoints = settings.fa_penalty_enabled ? -Math.abs(settings.fa_penalty_points) : 0;

    const { data, error: err } = await supabase.from('free_agency_moves').insert({
      league_id:              league.id,
      user_id:                user.id,
      week,
      dropped_team_id:        droppedTeamId,
      dropped_team_name:      droppedTeam.team_name,
      dropped_team_logo:      droppedTeam.team_logo,
      dropped_team_conference: droppedTeam.team_conference,
      added_team_id:          addedTeamId,
      added_team_name:        addedTeamName,
      added_team_logo:        addedTeamLogo,
      added_team_conference:  addedTeamConference,
      penalty_points:         penaltyPoints,
    }).select().single();

    if (err) return { error: err.message };
    if (data) setFreeAgencyMoves(prev => [...prev, data as FreeAgencyMove]);
    return {};
  }, []);

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

  // Update the display name for the current league membership only
  const updateDisplayName = async (name: string): Promise<{ error?: string }> => {
    if (!league || !user) return { error: 'Not ready' };
    const trimmed = name.trim();
    if (!trimmed) return { error: 'Display name cannot be empty' };

    const { error: err } = await supabase
      .from('league_members')
      .update({ display_name: trimmed })
      .eq('league_id', league.id)
      .eq('user_id', user.id);

    if (err) return { error: err.message };
    setMembers(prev => prev.map(m =>
      m.user_id === user.id ? { ...m, display_name: trimmed } : m
    ));
    return {};
  };

  return {
    league, allLeagues, allMemberships, selectedLeagueId,
    members, draftPicks, captainPicks, manualBonuses, spreadPicks, freeAgencyMoves,
    rosters, myMembership, isCommissioner, loading, error,
    switchLeague, createLeague, sendInvite, startDraft, makeDraftPick, resetDraft,
    setCaptain, addManualBonus, removeManualBonus,
    setSpreadPick, removeSpreadPick, overrideSpreadResult, clearSpreadOverride,
    updateWeek, updateScoring, removeFromRoster, makeFreeAgencyMove, updateDisplayName,
    reload: loadAllLeagues,
  };
}
