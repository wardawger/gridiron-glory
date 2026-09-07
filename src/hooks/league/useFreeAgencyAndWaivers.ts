import { useCallback, type MutableRefObject } from 'react';
import type { User } from '@supabase/supabase-js';
import posthog from 'posthog-js';
import { supabase } from '../../lib/supabase';
import type {
  League, LeagueMember, DraftPick, FreeAgencyMove, WaiverClaim, RosterEntry, ScoringSettings,
} from '../../types';
import { normalizeScoring } from '../../types';
import { rosterAtWeek, currentRosters } from '../../services/roster';
import { isP4Conference, confCategory } from '../../services/scoring';
import type { SetState } from './useLeagueCore';

// Shared by makeFreeAgencyMove and submitWaiverClaim — both are a drop+add
// swap with identical conference-limit rules (P4 per-conference, G6
// combined), they just differ in whether the swap executes immediately or
// queues as a waiver claim pending priority resolution.
function checkConferenceLimits(
  myRoster: RosterEntry[], droppedTeamId: string, addedTeamConference: string, settings: ScoringSettings,
): { error?: string } {
  if (settings.excluded_conferences.includes(addedTeamConference)) {
    return { error: `${addedTeamConference} is excluded by your commissioner` };
  }

  const droppedTeam = myRoster.find(t => t.team_id === droppedTeamId);
  const addCategory = confCategory(addedTeamConference);
  const addMax = addCategory === 'G6' ? settings.g6_conf_max : settings.p4_conf_max;
  const addCurrentCount = addCategory === 'G6'
    ? myRoster.filter(t => !isP4Conference(t.team_conference)).length
    : myRoster.filter(t => t.team_conference === addedTeamConference).length;
  const droppingSameCategory = droppedTeam ? confCategory(droppedTeam.team_conference) === addCategory : false;
  const newCount = addCurrentCount - (droppingSameCategory ? 1 : 0) + 1;
  if (newCount > addMax) {
    return { error: `Max ${addMax} ${addCategory === 'G6' ? 'G6/non-P4' : addCategory} teams` };
  }

  if (droppedTeam) {
    const dropCategory = confCategory(droppedTeam.team_conference);
    const dropMin = dropCategory === 'G6' ? settings.g6_conf_min : settings.p4_conf_min;
    if (dropMin > 0 && !droppingSameCategory) {
      const dropCurrentCount = dropCategory === 'G6'
        ? myRoster.filter(t => !isP4Conference(t.team_conference)).length
        : myRoster.filter(t => t.team_conference === droppedTeam.team_conference).length;
      if (dropCurrentCount - 1 < dropMin) {
        const label = dropCategory === 'G6' ? 'G6/non-P4' : dropCategory;
        return { error: `Dropping ${droppedTeam.team_name} would leave you below the ${dropMin}-team ${label} minimum` };
      }
    }
  }
  return {};
}

export function useFreeAgencyAndWaivers(
  setFreeAgencyMoves: SetState<FreeAgencyMove[]>,
  setWaiverClaims: SetState<WaiverClaim[]>,
  leagueRef: MutableRefObject<League | null>,
  userRef: MutableRefObject<User | null>,
  membersRef: MutableRefObject<LeagueMember[]>,
  draftPicksRef: MutableRefObject<DraftPick[]>,
  freeAgencyMovesRef: MutableRefObject<FreeAgencyMove[]>,
  waiverClaimsRef: MutableRefObject<WaiverClaim[]>,
) {
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

    const settings = normalizeScoring(league.scoring);
    if (!settings.free_agency_enabled) return { error: 'The portal is not enabled for this league' };
    if (settings.waiver_enabled) return { error: 'Waivers are enabled for this league — submit a claim instead' };

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

    const confCheck = checkConferenceLimits(myRoster, droppedTeamId, addedTeamConference, settings);
    if (confCheck.error) return confCheck;

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
    if (data) {
      setFreeAgencyMoves(prev => [...prev, data as FreeAgencyMove]);
      posthog.capture('free_agency_move_completed', { week });
    }
    return {};
  }, []);

  const submitWaiverClaim = useCallback(async (
    droppedTeamId: string, droppedTeamName: string,
    addedTeamId: string, addedTeamName: string, addedTeamLogo: string, addedTeamConference: string,
  ): Promise<{ error?: string }> => {
    const league  = leagueRef.current;
    const user    = userRef.current;
    const draftPicks = draftPicksRef.current;
    const moves   = freeAgencyMovesRef.current;
    const claims  = waiverClaimsRef.current;
    if (!league || !user) return { error: 'Not ready' };

    const settings = normalizeScoring(league.scoring);
    if (!settings.free_agency_enabled) return { error: 'The portal is not enabled for this league' };
    if (!settings.waiver_enabled) return { error: 'Waivers are not enabled for this league' };

    const week = league.current_week;
    const myPendingClaims = claims.filter(c => c.user_id === user.id && c.status === 'pending');
    const myMoves = moves.filter(m => m.user_id === user.id);
    // A pending claim counts against the cap immediately, before it resolves.
    if (myMoves.length + myPendingClaims.length >= settings.fa_max_moves_per_season) {
      return { error: `You've reached the season limit of ${settings.fa_max_moves_per_season} moves` };
    }
    const myMovesThisWeek = myMoves.filter(m => m.week === week);
    const myPendingClaimsThisWeek = myPendingClaims.filter(c => c.week === week);
    if (myMovesThisWeek.length + myPendingClaimsThisWeek.length >= settings.fa_max_moves_per_week) {
      return { error: `You've reached this week's limit of ${settings.fa_max_moves_per_week} moves` };
    }
    if (myPendingClaims.some(c => c.dropped_team_id === droppedTeamId || c.added_team_id === addedTeamId)) {
      return { error: 'You already have a pending claim involving one of these teams' };
    }

    const myRoster = rosterAtWeek(user.id, week, draftPicks, moves);
    if (!myRoster.some(t => t.team_id === droppedTeamId)) {
      return { error: 'You do not currently own that team' };
    }

    const confCheck = checkConferenceLimits(myRoster, droppedTeamId, addedTeamConference, settings);
    if (confCheck.error) return confCheck;

    const droppedTeam = myRoster.find(t => t.team_id === droppedTeamId)!;

    const { data, error: err } = await supabase.from('waiver_claims').insert({
      league_id:               league.id,
      user_id:                 user.id,
      week,
      dropped_team_id:         droppedTeamId,
      dropped_team_name:       droppedTeam.team_name,
      dropped_team_logo:       droppedTeam.team_logo,
      dropped_team_conference: droppedTeam.team_conference,
      added_team_id:           addedTeamId,
      added_team_name:         addedTeamName,
      added_team_logo:         addedTeamLogo,
      added_team_conference:   addedTeamConference,
      status:                  'pending',
    }).select().single();

    if (err) return { error: err.message };
    if (data) {
      setWaiverClaims(prev => [...prev, data as WaiverClaim]);
      posthog.capture('waiver_claim_submitted', { week });
    }
    return {};
  }, []);

  return { makeFreeAgencyMove, submitWaiverClaim };
}
