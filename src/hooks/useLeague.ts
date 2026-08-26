import type { User } from '@supabase/supabase-js';
import { useLeagueCore } from './league/useLeagueCore';
import { useCaptainPicks } from './league/useCaptainPicks';
import { useSpreadPicks } from './league/useSpreadPicks';
import { useFreeAgencyAndWaivers } from './league/useFreeAgencyAndWaivers';
import { useManualBonuses } from './league/useManualBonuses';
import { useScoreCorrections } from './league/useScoreCorrections';
import { useBenchPicks } from './league/useBenchPicks';

// Thin composer: useLeagueCore owns all raw state + both realtime/polling
// effects + core league/draft/member actions; the domain hooks below are
// pure action-factories consuming core's state/setters/refs. See
// src/hooks/league/useLeagueCore.ts for why state isn't split per-domain.
export function useLeague(user: User | null) {
  const core = useLeagueCore(user);

  const { setCaptain } = useCaptainPicks(
    core.setCaptainPicks, core.leagueRef, core.userRef, core.captainPicksRef,
  );

  const { setSpreadPick, removeSpreadPick, overrideSpreadResult, clearSpreadOverride } = useSpreadPicks(
    core.league, core.isCommissioner, core.setSpreadPicks,
    core.leagueRef, core.userRef, core.spreadPicksRef, core.captainPicksRef,
  );

  const { makeFreeAgencyMove, submitWaiverClaim } = useFreeAgencyAndWaivers(
    core.setFreeAgencyMoves, core.setWaiverClaims,
    core.leagueRef, core.userRef, core.membersRef, core.draftPicksRef, core.freeAgencyMovesRef, core.waiverClaimsRef,
  );

  const { addManualBonus, removeManualBonus } = useManualBonuses(
    core.league, user, core.setManualBonuses,
  );

  const { addScoreCorrection, removeScoreCorrection } = useScoreCorrections(
    core.league, user, core.isCommissioner, core.setScoreCorrections,
  );

  const { swapBench, ensureBenchSeeded } = useBenchPicks(
    core.setBenchPicks, core.leagueRef, core.userRef, core.benchPicksRef,
  );

  return {
    league: core.league, allLeagues: core.allLeagues, allMemberships: core.allMemberships,
    selectedLeagueId: core.selectedLeagueId,
    members: core.members, draftPicks: core.draftPicks, captainPicks: core.captainPicks,
    manualBonuses: core.manualBonuses, spreadPicks: core.spreadPicks,
    freeAgencyMoves: core.freeAgencyMoves, waiverClaims: core.waiverClaims,
    scoreCorrections: core.scoreCorrections, benchPicks: core.benchPicks, invites: core.invites, seasonHistory: core.seasonHistory,
    rosters: core.rosters, myMembership: core.myMembership, isCommissioner: core.isCommissioner,
    loading: core.loading, error: core.error,
    switchLeague: core.switchLeague, createLeague: core.createLeague, sendInvite: core.sendInvite,
    startDraft: core.startDraft, makeDraftPick: core.makeDraftPick, resetDraft: core.resetDraft,
    deleteLeague: core.deleteLeague, endSeason: core.endSeason,
    setCaptain, addManualBonus, removeManualBonus, addScoreCorrection, removeScoreCorrection,
    setSpreadPick, removeSpreadPick, overrideSpreadResult, clearSpreadOverride,
    swapBench, ensureBenchSeeded,
    updateWeek: core.updateWeek, updateScoring: core.updateScoring, updateDraftSchedule: core.updateDraftSchedule,
    removeFromRoster: core.removeFromRoster,
    makeFreeAgencyMove, submitWaiverClaim,
    updateDisplayName: core.updateDisplayName, updateAvatar: core.updateAvatar, updateMemberRole: core.updateMemberRole,
    removeMember: core.removeMember,
    reload: core.reload,
  };
}
