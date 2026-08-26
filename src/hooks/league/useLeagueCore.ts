import { useState, useEffect, useCallback, useRef, type Dispatch, type SetStateAction } from 'react';
import type { User } from '@supabase/supabase-js';
import posthog from 'posthog-js';
import { supabase } from '../../lib/supabase';
import type {
  League, LeagueMember, DraftPick, CaptainPick,
  ManualBonus, SpreadPick, FreeAgencyMove, LeagueRole, AvatarType,
  SeasonHistory, SeasonHistoryEntry, WaiverClaim, TrophySnapshot, ScoreCorrection, BenchPick, Invite,
} from '../../types';
import { DEFAULT_SCORING } from '../../types';
import { currentRosters } from '../../services/roster';

// Owns every raw state atom for the league (members, picks, moves, etc.),
// both realtime/polling effects, and the actions that are either
// core-shared or too entangled with core to safely extract (league CRUD,
// draft actions, member management, season end/reset). The domain-specific
// action hooks (useCaptainPicks, useSpreadPicks, useFreeAgencyAndWaivers,
// useManualBonuses) are pure action-factories that take the state/setters/
// refs returned here as parameters — they own no state of their own, since
// the realtime effect below needs to call every domain's setter directly.
export function useLeagueCore(user: User | null) {
  const [allLeagues, setAllLeagues]     = useState<League[]>([]);
  const [allMemberships, setAllMemberships] = useState<Record<string, LeagueRole>>({});
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(null);
  const [members, setMembers]           = useState<LeagueMember[]>([]);
  const [draftPicks, setDraftPicks]     = useState<DraftPick[]>([]);
  const [captainPicks, setCaptainPicks] = useState<CaptainPick[]>([]);
  const [manualBonuses, setManualBonuses] = useState<ManualBonus[]>([]);
  const [spreadPicks, setSpreadPicks]   = useState<SpreadPick[]>([]);
  const [freeAgencyMoves, setFreeAgencyMoves] = useState<FreeAgencyMove[]>([]);
  const [waiverClaims, setWaiverClaims] = useState<WaiverClaim[]>([]);
  const [scoreCorrections, setScoreCorrections] = useState<ScoreCorrection[]>([]);
  const [benchPicks, setBenchPicks]     = useState<BenchPick[]>([]);
  const [invites, setInvites]           = useState<Invite[]>([]);
  const [seasonHistory, setSeasonHistory] = useState<SeasonHistory[]>([]);
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
  const waiverClaimsRef = useRef(waiverClaims);
  const benchPicksRef   = useRef(benchPicks);
  leagueRef.current       = league;
  userRef.current         = user;
  captainPicksRef.current = captainPicks;
  spreadPicksRef.current  = spreadPicks;
  membersRef.current      = members;
  draftPicksRef.current   = draftPicks;
  freeAgencyMovesRef.current = freeAgencyMoves;
  waiverClaimsRef.current = waiverClaims;
  benchPicksRef.current   = benchPicks;

  // silent=true skips the loading flag App.tsx uses to show a full-page
  // blocking spinner — used for background refreshes (e.g. after joining a
  // league via invite) where forcing every mounted route to unmount and
  // remount mid-flight would abort whatever it was doing.
  const loadAllLeagues = useCallback(async (silent = false) => {
    if (!user) { setLoading(false); return; }
    if (!silent) setLoading(true);
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
        if (!silent) setLoading(false);
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
      if (!silent) setLoading(false);
    }
  }, [user]);

  const loadLeagueData = useCallback(async (leagueId: string) => {
    const [membersRes, picksRes, captainRes, bonusRes, spreadRes, faRes, waiverRes, correctionRes, benchRes, invitesRes, historyRes] = await Promise.all([
      supabase.from('league_members').select('*').eq('league_id', leagueId),
      supabase.from('draft_picks').select('*').eq('league_id', leagueId).order('pick_number'),
      supabase.from('captain_picks').select('*').eq('league_id', leagueId),
      supabase.from('manual_bonuses').select('*').eq('league_id', leagueId),
      supabase.from('spread_picks').select('*').eq('league_id', leagueId),
      supabase.from('free_agency_moves').select('*').eq('league_id', leagueId),
      supabase.from('waiver_claims').select('*').eq('league_id', leagueId),
      supabase.from('score_corrections').select('*').eq('league_id', leagueId),
      supabase.from('bench_picks').select('*').eq('league_id', leagueId),
      // Empty for a non-commissioner — RLS scopes SELECT to commissioners
      // only, so this is a silent no-op rather than an error for members.
      supabase.from('invites').select('*').eq('league_id', leagueId).order('created_at', { ascending: false }),
      supabase.from('season_history').select('*').eq('league_id', leagueId).order('archived_at', { ascending: false }),
    ]);

    if (membersRes.data)    setMembers(membersRes.data);
    if (picksRes.data)      setDraftPicks(picksRes.data);
    if (captainRes.data)    setCaptainPicks(captainRes.data);
    if (bonusRes.data)      setManualBonuses(bonusRes.data);
    if (spreadRes.data)     setSpreadPicks(spreadRes.data);
    if (faRes.data)         setFreeAgencyMoves(faRes.data);
    if (waiverRes.data)     setWaiverClaims(waiverRes.data);
    if (correctionRes.data) setScoreCorrections(correctionRes.data);
    if (benchRes.data)      setBenchPicks(benchRes.data);
    if (invitesRes.data)    setInvites(invitesRes.data);
    if (historyRes.data)    setSeasonHistory(historyRes.data);
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
    setWaiverClaims([]);
    setScoreCorrections([]);
    setBenchPicks([]);
    setInvites([]);
    setSeasonHistory([]);
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
          const newPick = payload.new as DraftPick;
          setDraftPicks(prev => prev.some(p => p.id === newPick.id)
            ? prev
            : [...prev, newPick].sort((a, b) => a.pick_number - b.pick_number));
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
      .on('postgres_changes', {
        // '*' (not just INSERT) — status transitions (pending → processed/
        // cancelled) are written by the process-waivers scheduled function,
        // not by this client, so a full refetch is the simplest way to stay
        // in sync (mirrors the captain_picks/spread_picks pattern above).
        event: '*', schema: 'public', table: 'waiver_claims',
        filter: `league_id=eq.${league.id}`,
      }, () => {
        supabase.from('waiver_claims').select('*').eq('league_id', league.id)
          .then(({ data }) => { if (data) setWaiverClaims(data); });
      })
      .on('postgres_changes', {
        // '*' — corrections can be added and removed by the commissioner,
        // so a full refetch (matching spread_picks/captain_picks) is simpler
        // than free-agency's insert-only merge.
        event: '*', schema: 'public', table: 'score_corrections',
        filter: `league_id=eq.${league.id}`,
      }, () => {
        supabase.from('score_corrections').select('*').eq('league_id', league.id)
          .then(({ data }) => { if (data) setScoreCorrections(data); });
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'bench_picks',
        filter: `league_id=eq.${league.id}`,
      }, () => {
        supabase.from('bench_picks').select('*').eq('league_id', league.id)
          .then(({ data }) => { if (data) setBenchPicks(data); });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [league?.id]);

  // Fallback polling while a draft is active. Realtime should cover this,
  // but a live draft is exactly where a silently-misconfigured realtime
  // publication hurts most, so this keeps picks and turn order in sync
  // within a few seconds even if the subscription above isn't delivering.
  useEffect(() => {
    if (!league || league.draft_status !== 'active') return;
    const leagueId = league.id;

    const poll = async () => {
      const [picksRes, leagueRes] = await Promise.all([
        supabase.from('draft_picks').select('*').eq('league_id', leagueId).order('pick_number'),
        supabase.from('leagues').select('*').eq('id', leagueId).single(),
      ]);
      if (picksRes.data) setDraftPicks(picksRes.data);
      if (leagueRes.data) {
        setAllLeagues(prev => prev.map(l => l.id === leagueId ? leagueRes.data as League : l));
      }
    };

    const interval = setInterval(poll, 4000);
    return () => clearInterval(interval);
  }, [league?.id, league?.draft_status]);

  // ─── Actions ──────────────────────────────────────────────────────────────

  const createLeague = async (
    name: string,
    maxTeams: number,
    playerCount: number,
    bench?: { enabled: boolean; startersCount: number; benchCount: number },
  ) => {
    if (!user) return { error: 'Not logged in' };

    const scoring = bench
      ? {
          ...DEFAULT_SCORING,
          bench_enabled:  bench.enabled,
          starters_count: bench.startersCount,
          bench_count:    bench.benchCount,
        }
      : DEFAULT_SCORING;

    const { data: lg, error: lgErr } = await supabase
      .from('leagues')
      .insert({
        name,
        created_by: user.id,
        max_teams_per_user: maxTeams,
        draft_order: [user.id],
        draft_status: 'pending',
        draft_current_pick: 1,
        scoring,
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
    posthog.capture('league_created', {
      max_teams_per_user: maxTeams,
      player_count: playerCount,
    });

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
    posthog.capture('league_invite_created');
    setInvites(prev => [data as Invite, ...prev]);

    // Best-effort — the invite row (and its shareable /join/:token link)
    // already exists regardless of whether the email actually sends, so a
    // failure here never blocks or invalidates the invite itself.
    // The function now requires a session and checks server-side that the
    // caller commissions this league; it also looks the inviter's display
    // name up itself rather than accepting one from here, so that the
    // "X invited you" line in the email can't be forged.
    let emailSent = false;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/.netlify/functions/send-invite-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ inviteId: data.id }),
      });
      emailSent = res.ok;
    } catch {
      emailSent = false;
    }

    return { token: data.token, emailSent };
  };

  const startDraft = async (orderedUserIds: string[]) => {
    if (!league || orderedUserIds.length < 2) return;
    const { data, error } = await supabase.from('leagues').update({
      draft_status: 'active',
      draft_order: orderedUserIds,
      draft_current_pick: 1,
    }).eq('id', league.id).select().single();

    if (!error && data) {
      setAllLeagues(prev => prev.map(l => l.id === league.id ? data as League : l));
      posthog.capture('draft_started', { member_count: orderedUserIds.length });
    }
  };

  const makeDraftPick = async (teamId: string, teamName: string, teamLogo: string, teamConf: string) => {
    if (!league || !user) return { error: 'Not ready' };
    const pickNum = league.draft_current_pick;
    const totalPicks = league.max_teams_per_user * league.draft_order.length;
    if (pickNum > totalPicks) return { error: 'Draft is over' };

    const round = Math.ceil(pickNum / league.draft_order.length);

    const { data: pick, error: pickErr } = await supabase.from('draft_picks').insert({
      league_id:       league.id,
      user_id:         user.id,
      team_id:         teamId,
      team_name:       teamName,
      team_logo:       teamLogo,
      team_conference: teamConf,
      round,
      pick_number: pickNum,
    }).select().single();
    if (pickErr) return { error: pickErr.message };

    // Update locally right away rather than waiting on the realtime
    // round-trip — the realtime handler already de-dupes by id if this
    // insert's own broadcast arrives afterward.
    setDraftPicks(prev => prev.some(p => p.id === pick.id)
      ? prev
      : [...prev, pick as DraftPick].sort((a, b) => a.pick_number - b.pick_number));

    const next = pickNum + 1;
    const { data: updatedLeague, error: leagueErr } = await supabase.from('leagues').update({
      draft_current_pick: next,
      draft_status: next > totalPicks ? 'complete' : 'active',
    }).eq('id', league.id).select().single();

    if (!leagueErr && updatedLeague) {
      setAllLeagues(prev => prev.map(l => l.id === league.id ? updatedLeague as League : l));
    }
    posthog.capture('draft_pick_made', {
      pick_number: pickNum,
      round,
      team_conference: teamConf,
    });

    return {};
  };

  const resetDraft = async () => {
    if (!league) return { error: 'No league' };

    const { error: deleteErr } = await supabase
      .from('draft_picks').delete().eq('league_id', league.id);

    if (deleteErr) return { error: deleteErr.message };

    // Free agency swaps are layered on top of draft picks when computing a
    // roster, so they must also be cleared or a team acquired via free
    // agency would survive the reset and keep showing on the roster.
    const { error: faDeleteErr } = await supabase
      .from('free_agency_moves').delete().eq('league_id', league.id);

    if (faDeleteErr) return { error: faDeleteErr.message };

    // Best-effort — waiver_claims may not exist yet for leagues that
    // predate the migration, and that must never block a reset.
    await supabase.from('waiver_claims').delete().eq('league_id', league.id);

    const { data: updatedLeague, error: updateErr } = await supabase
      .from('leagues').update({
        draft_status: 'pending',
        draft_current_pick: 1,
        draft_order: [],
      }).eq('id', league.id).select().single();

    if (updateErr) return { error: updateErr.message };

    setDraftPicks([]);
    setFreeAgencyMoves([]);
    setWaiverClaims([]);
    if (updatedLeague) {
      setAllLeagues(prev => prev.map(l => l.id === league.id ? updatedLeague as League : l));
    }
    return {};
  };

  // Archives the given final standings as a completed season, then fully
  // resets the league for a new one — everything Reset Draft clears, plus
  // captain picks, manual bonuses, and spread picks (which Reset Draft
  // deliberately leaves alone for mid-season redos).
  const endSeason = async (
    seasonLabel: string,
    standings: SeasonHistoryEntry[],
    trophies: TrophySnapshot
  ): Promise<{ error?: string }> => {
    if (!league || !user || !isCommissioner) return { error: 'Not authorized' };
    if (!seasonLabel.trim()) return { error: 'Season label is required' };
    if (standings.length === 0) return { error: 'No standings to archive' };

    const { data: historyRow, error: historyErr } = await supabase
      .from('season_history').insert({
        league_id:    league.id,
        season_label: seasonLabel.trim(),
        standings,
        trophies,
        archived_by:  user.id,
      }).select().single();

    if (historyErr) return { error: historyErr.message };

    const deletes = await Promise.all([
      supabase.from('draft_picks').delete().eq('league_id', league.id),
      supabase.from('free_agency_moves').delete().eq('league_id', league.id),
      supabase.from('captain_picks').delete().eq('league_id', league.id),
      supabase.from('manual_bonuses').delete().eq('league_id', league.id),
      supabase.from('spread_picks').delete().eq('league_id', league.id),
      supabase.from('bench_picks').delete().eq('league_id', league.id),
    ]);
    const deleteErr = deletes.find(d => d.error)?.error;
    if (deleteErr) return { error: deleteErr.message };

    // Best-effort — waiver_claims may not exist yet for leagues that
    // predate the migration, and that must never block ending a season.
    await supabase.from('waiver_claims').delete().eq('league_id', league.id);

    const { data: updatedLeague, error: updateErr } = await supabase
      .from('leagues').update({
        draft_status: 'pending',
        draft_current_pick: 1,
        draft_order: [],
        current_week: 0,
      }).eq('id', league.id).select().single();

    if (updateErr) return { error: updateErr.message };

    setDraftPicks([]);
    setFreeAgencyMoves([]);
    setWaiverClaims([]);
    setCaptainPicks([]);
    setManualBonuses([]);
    setSpreadPicks([]);
    setBenchPicks([]);
    if (historyRow) {
      setSeasonHistory(prev => [historyRow as SeasonHistory, ...prev]);
    }
    if (updatedLeague) {
      setAllLeagues(prev => prev.map(l => l.id === league.id ? updatedLeague as League : l));
    }
    posthog.capture('season_archived', { standing_count: standings.length });
    return {};
  };

  const deleteLeague = async (): Promise<{ error?: string }> => {
    if (!league || !user || !isCommissioner) return { error: 'Not authorized' };

    // Explicit safety net for tables that may not cascade from leagues(id) —
    // harmless no-op for any that already do.
    await supabase.from('spread_picks').delete().eq('league_id', league.id);
    await supabase.from('free_agency_moves').delete().eq('league_id', league.id);
    await supabase.from('waiver_claims').delete().eq('league_id', league.id);
    await supabase.from('bench_picks').delete().eq('league_id', league.id);

    const { error: err } = await supabase.from('leagues').delete().eq('id', league.id);
    if (err) return { error: err.message };

    const remaining = allLeagues.filter(l => l.id !== league.id);
    setAllLeagues(remaining);
    setAllMemberships(prev => {
      const next = { ...prev };
      delete next[league.id];
      return next;
    });

    const nextId = remaining[0]?.id ?? null;
    setSelectedLeagueId(nextId);
    if (nextId) {
      localStorage.setItem(`gridiron_league_${user.id}`, nextId);
    } else {
      localStorage.removeItem(`gridiron_league_${user.id}`);
    }

    return {};
  };

  const updateWeek = async (week: number) => {
    if (!league) return;
    await supabase.from('leagues').update({ current_week: week }).eq('id', league.id);
  };

  // scheduledAt: an ISO timestamp, or null to clear the schedule. Purely
  // informational — drives the Draft Room countdown, doesn't auto-start
  // the draft itself.
  const updateDraftSchedule = async (scheduledAt: string | null): Promise<{ error?: string }> => {
    if (!league) return { error: 'No league' };
    const { data, error } = await supabase
      .from('leagues')
      .update({ draft_scheduled_at: scheduledAt })
      .eq('id', league.id)
      .select()
      .single();
    if (error) return { error: error.message };
    if (data) setAllLeagues(prev => prev.map(l => l.id === league.id ? data as League : l));
    return {};
  };

  const updateScoring = async (scoring: League['scoring']) => {
    if (!league) return;
    const { error } = await supabase.from('leagues').update({ scoring }).eq('id', league.id);
    if (!error) posthog.capture('scoring_settings_saved');
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

  // Update the roster avatar for the current league membership only
  const updateAvatar = async (avatarType: AvatarType, avatarValue: string): Promise<{ error?: string }> => {
    if (!league || !user) return { error: 'Not ready' };

    const { error: err } = await supabase
      .from('league_members')
      .update({ avatar_type: avatarType, avatar_value: avatarValue })
      .eq('league_id', league.id)
      .eq('user_id', user.id);

    if (err) return { error: err.message };
    setMembers(prev => prev.map(m =>
      m.user_id === user.id ? { ...m, avatar_type: avatarType, avatar_value: avatarValue } : m
    ));
    return {};
  };

  // Promote a member to co-commissioner or demote one back to member.
  // Any commissioner can do this to any other member, including themselves —
  // guarded so a league can never end up with zero commissioners.
  const updateMemberRole = async (targetUserId: string, role: LeagueRole): Promise<{ error?: string }> => {
    if (!league || !isCommissioner) return { error: 'Not authorized' };

    if (role === 'member') {
      const target = members.find(m => m.user_id === targetUserId);
      const commissionerCount = members.filter(m => m.role === 'commissioner').length;
      if (target?.role === 'commissioner' && commissionerCount <= 1) {
        return { error: 'A league needs at least one commissioner.' };
      }
    }

    const { error: err } = await supabase
      .from('league_members')
      .update({ role })
      .eq('league_id', league.id)
      .eq('user_id', targetUserId);

    if (err) return { error: err.message };
    setMembers(prev => prev.map(m => m.user_id === targetUserId ? { ...m, role } : m));
    return {};
  };

  // Remove a member from the league entirely — either before the draft
  // starts (nothing to clean up, since they have no picks yet) or once the
  // draft is complete. Disallowed mid-draft, since removing a member with
  // an in-progress pick order would leave the draft in an inconsistent
  // state. Deletes their draft picks (and every other per-user table)
  // rather than just the membership row, since DraftRoom reads raw
  // draft_picks directly (not filtered by members), so this is what
  // actually frees their teams back into the available pool.
  const removeMember = async (targetUserId: string): Promise<{ error?: string }> => {
    if (!league || !user || !isCommissioner) return { error: 'Not authorized' };
    if (league.draft_status === 'active') return { error: 'Members can only be removed before the draft starts or after it is complete' };
    if (targetUserId === user.id) return { error: "You can't remove yourself" };

    const target = members.find(m => m.user_id === targetUserId);
    if (target?.role === 'commissioner') return { error: 'Demote this member to a regular member before removing them' };

    const deletes = await Promise.all([
      supabase.from('draft_picks').delete().eq('league_id', league.id).eq('user_id', targetUserId),
      supabase.from('captain_picks').delete().eq('league_id', league.id).eq('user_id', targetUserId),
      supabase.from('spread_picks').delete().eq('league_id', league.id).eq('user_id', targetUserId),
      supabase.from('free_agency_moves').delete().eq('league_id', league.id).eq('user_id', targetUserId),
      supabase.from('manual_bonuses').delete().eq('league_id', league.id).eq('user_id', targetUserId),
      supabase.from('score_corrections').delete().eq('league_id', league.id).eq('user_id', targetUserId),
      supabase.from('bench_picks').delete().eq('league_id', league.id).eq('user_id', targetUserId),
    ]);
    const deleteErr = deletes.find(d => d.error)?.error;
    if (deleteErr) return { error: deleteErr.message };

    // Best-effort — waiver_claims may not exist yet for leagues that
    // predate the migration, and that must never block a removal.
    await supabase.from('waiver_claims').delete().eq('league_id', league.id).eq('user_id', targetUserId);

    const { error: memberErr } = await supabase
      .from('league_members')
      .delete()
      .eq('league_id', league.id)
      .eq('user_id', targetUserId);
    if (memberErr) return { error: memberErr.message };

    setDraftPicks(prev => prev.filter(p => p.user_id !== targetUserId));
    setCaptainPicks(prev => prev.filter(p => p.user_id !== targetUserId));
    setSpreadPicks(prev => prev.filter(p => p.user_id !== targetUserId));
    setFreeAgencyMoves(prev => prev.filter(m => m.user_id !== targetUserId));
    setManualBonuses(prev => prev.filter(b => b.user_id !== targetUserId));
    setScoreCorrections(prev => prev.filter(c => c.user_id !== targetUserId));
    setWaiverClaims(prev => prev.filter(w => w.user_id !== targetUserId));
    setBenchPicks(prev => prev.filter(p => p.user_id !== targetUserId));
    setMembers(prev => prev.filter(m => m.user_id !== targetUserId));

    return {};
  };

  return {
    // Public state
    league, allLeagues, allMemberships, selectedLeagueId,
    members, draftPicks, captainPicks, manualBonuses, spreadPicks, freeAgencyMoves, waiverClaims, scoreCorrections, benchPicks, invites, seasonHistory,
    rosters, myMembership, isCommissioner, loading, error,
    // Public actions
    switchLeague, createLeague, sendInvite, startDraft, makeDraftPick, resetDraft, deleteLeague, endSeason,
    updateWeek, updateScoring, updateDraftSchedule, removeFromRoster,
    updateDisplayName, updateAvatar, updateMemberRole, removeMember,
    reload: () => loadAllLeagues(true),
    // Setters + refs consumed by the domain action-factory hooks
    setCaptainPicks, setSpreadPicks, setFreeAgencyMoves, setWaiverClaims, setManualBonuses, setScoreCorrections, setBenchPicks,
    leagueRef, userRef, captainPicksRef, spreadPicksRef, membersRef, draftPicksRef, freeAgencyMovesRef, waiverClaimsRef, benchPicksRef,
  };
}

export type LeagueCore = ReturnType<typeof useLeagueCore>;
export type SetState<T> = Dispatch<SetStateAction<T>>;
