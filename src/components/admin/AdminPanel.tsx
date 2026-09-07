import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Shield, UserPlus, Settings, Gift } from 'lucide-react';
import type {
  League, LeagueMember, ManualBonus, DraftPick, SpreadPick, FreeAgencyMove,
  ScoringSettings, LeagueRole, CaptainPick, GameData, TeamSeasonStats, SeasonHistoryEntry, CfbTeam,
  TrophySnapshot, ScoreCorrection, BenchPick, Invite,
} from '../../types';
import { buildLeaderboard } from '../../services/scoring';
import { computeTrophies } from '../../services/trophies';
import { useTabCrossfade } from '../../hooks/useCrossfade';
import { MembersTab } from './MembersTab';
import { ScoringTab } from './ScoringTab';
import { AdjustmentsTab } from './AdjustmentsTab';

interface Props {
  league: League;
  currentUserId: string;
  members: LeagueMember[];
  draftPicks: DraftPick[];
  captainPicks: CaptainPick[];
  manualBonuses: ManualBonus[];
  spreadPicks: SpreadPick[];
  freeAgencyMoves: FreeAgencyMove[];
  scoreCorrections: ScoreCorrection[];
  benchPicks: BenchPick[];
  invites: Invite[];
  gameData: GameData;
  seasonStats: Map<string, TeamSeasonStats>;
  teams: CfbTeam[];
  isCommissioner: boolean;
  onSendInvite: (email: string) => Promise<{ token?: string; emailSent?: boolean; error?: string }>;
  onUpdateWeek: (week: number) => void | Promise<void>;
  onUpdateScoring: (s: ScoringSettings) => Promise<{ error?: string } | void>;
  onUpdateDraftSchedule: (scheduledAt: string | null) => Promise<{ error?: string }>;
  onUpdateMaxTeams: (maxTeams: number) => Promise<{ error?: string }>;
  onAddBonus: (bonus: Omit<ManualBonus, 'id' | 'awarded_at' | 'awarded_by' | 'league_id'>) => void | Promise<void>;
  onRemoveBonus: (id: string) => void | Promise<void>;
  onAddCorrection: (correction: Omit<ScoreCorrection, 'id' | 'league_id' | 'created_at' | 'created_by'>) => Promise<{ error?: string }>;
  onRemoveCorrection: (id: string) => Promise<{ error?: string }>;
  onRemoveFromRoster: (userId: string, teamId: string) => void;
  onResetDraft: () => Promise<{ error?: string }>;
  onDeleteLeague: () => Promise<{ error?: string }>;
  onEndSeason: (seasonLabel: string, standings: SeasonHistoryEntry[], trophies: TrophySnapshot) => Promise<{ error?: string }>;
  onOverrideSpread: (pickId: string, result: 'covered' | 'missed' | 'push', points: number) => Promise<{ error?: string }>;
  onClearSpreadOverride: (pickId: string) => Promise<{ error?: string }>;
  onUpdateMemberRole: (userId: string, role: LeagueRole) => Promise<{ error?: string }>;
  onRemoveMember: (userId: string) => Promise<{ error?: string }>;
}

type Tab = 'members' | 'scoring' | 'adjustments';
const TABS: { id: Tab; label: string; icon: typeof Shield }[] = [
  { id: 'members',     label: 'Members',     icon: UserPlus },
  { id: 'scoring',     label: 'Scoring',     icon: Settings },
  { id: 'adjustments', label: 'Adjustments', icon: Gift },
];
const isTab = (v: string | null): v is Tab => v === 'members' || v === 'scoring' || v === 'adjustments';

export function AdminPanel({
  league, currentUserId, members, draftPicks, captainPicks, manualBonuses, spreadPicks, freeAgencyMoves, scoreCorrections,
  benchPicks, invites, gameData, seasonStats, teams, isCommissioner,
  onSendInvite, onUpdateWeek, onUpdateScoring, onUpdateDraftSchedule, onUpdateMaxTeams, onAddBonus, onRemoveBonus, onAddCorrection, onRemoveCorrection,
  onResetDraft, onDeleteLeague,
  onEndSeason, onOverrideSpread, onClearSpreadOverride, onUpdateMemberRole, onRemoveMember,
}: Props) {
  // Active tab lives in the URL (?tab=scoring) so it survives reload and
  // can be linked to. The crossfade hook still owns the visual transition.
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab');
  const initialTab: Tab = isTab(urlTab) ? urlTab : 'members';
  const { active: tab, select: selectTab, panelClass: tabPanelClass } = useTabCrossfade<Tab>(initialTab);

  useEffect(() => {
    if (isTab(urlTab) && urlTab !== tab) selectTab(urlTab);
  }, [urlTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const goToTab = (id: Tab) => {
    selectTab(id);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (id === 'members') next.delete('tab'); else next.set('tab', id);
      return next;
    }, { replace: true });
  };

  const onTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = TABS[(idx + delta + TABS.length) % TABS.length].id;
    goToTab(next);
    (e.currentTarget.parentElement?.querySelector(`#admin-tab-${next}`) as HTMLElement | null)?.focus();
  };

  // Computed here (not inside MembersTab) since it needs almost the full
  // prop surface (draftPicks/captainPicks/gameData/bonuses/spreadPicks) to
  // call buildLeaderboard — moving the computation into the tab wouldn't
  // actually narrow its dependencies, so only the derived array is passed down.
  const finalStandings = useMemo((): SeasonHistoryEntry[] => {
    const board = buildLeaderboard(
      members, draftPicks, captainPicks, gameData,
      league.scoring, manualBonuses, seasonStats, true, spreadPicks,
      freeAgencyMoves, scoreCorrections, league.current_week, 17, benchPicks
    );
    return board.map((e, i) => ({
      user_id: e.user_id, display_name: e.display_name,
      avatar_type: e.avatar_type, avatar_value: e.avatar_value,
      total_points: e.total_points, rank: i + 1,
    }));
  }, [members, draftPicks, captainPicks, gameData, league.scoring, manualBonuses, seasonStats, spreadPicks, freeAgencyMoves, scoreCorrections, league.current_week, benchPicks]);

  // Snapshotted alongside finalStandings so End Season can freeze both at
  // once — trophies are unrecoverable once the underlying tables are wiped.
  const trophySnapshot = useMemo(
    () => computeTrophies(members, draftPicks, captainPicks, spreadPicks, freeAgencyMoves, manualBonuses, gameData, league.scoring, scoreCorrections, league.current_week),
    [members, draftPicks, captainPicks, spreadPicks, freeAgencyMoves, manualBonuses, gameData, league.scoring, scoreCorrections, league.current_week]
  );

  if (!isCommissioner) {
    return (
      <div className="text-center py-20 text-turf-500">
        <Shield className="w-10 h-10 mx-auto mb-3 opacity-30" aria-hidden="true" />
        <p>Commissioner access only</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in motion-reduce:animate-none">
      <div className="flex items-center gap-3">
        <Shield className="w-6 h-6 text-field-400" aria-hidden="true" />
        <h1 className="section-title text-2xl">Commissioner Panel</h1>
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="Commissioner panel sections" className="flex gap-1 bg-turf-900 p-1 rounded-xl border border-turf-800">
        {TABS.map(({ id, label, icon: Icon }, idx) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`admin-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`admin-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => goToTab(id)}
            onKeyDown={e => onTabKeyDown(e, idx)}
            className={`flex items-center gap-1.5 flex-1 justify-center px-2 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-field-400 ${
              tab === id
                ? 'bg-field-500 text-turf-950'
                : 'text-turf-400 hover:text-white'
            }`}
          >
            <Icon className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" /> {label}
          </button>
        ))}
      </div>

      {/* All three tabs stay mounted (hidden via CSS rather than unmounted
          via `&&`) so switching tabs never discards in-progress form edits —
          e.g. unsaved Scoring changes — the way the pre-split monolith's
          single always-mounted component never did either. tabPanelClass
          also drives the brief exit-then-fade-in on the panel content when
          switching, on top of that same always-mounted foundation. */}
      <div role="tabpanel" id="admin-panel-members" aria-labelledby="admin-tab-members" className={`${tabPanelClass('members')} motion-reduce:animate-none`}>
        <MembersTab
          league={league}
          currentUserId={currentUserId}
          members={members}
          invites={invites}
          finalStandings={finalStandings}
          trophySnapshot={trophySnapshot}
          onSendInvite={onSendInvite}
          onUpdateWeek={onUpdateWeek}
          onUpdateDraftSchedule={onUpdateDraftSchedule}
          onUpdateMaxTeams={onUpdateMaxTeams}
          onUpdateMemberRole={onUpdateMemberRole}
          onRemoveMember={onRemoveMember}
          onResetDraft={onResetDraft}
          onDeleteLeague={onDeleteLeague}
          onEndSeason={onEndSeason}
        />
      </div>

      <div role="tabpanel" id="admin-panel-scoring" aria-labelledby="admin-tab-scoring" className={`${tabPanelClass('scoring')} motion-reduce:animate-none`}>
        <ScoringTab league={league} teams={teams} onUpdateScoring={onUpdateScoring} />
      </div>

      <div role="tabpanel" id="admin-panel-adjustments" aria-labelledby="admin-tab-adjustments" className={`${tabPanelClass('adjustments')} motion-reduce:animate-none`}>
        <AdjustmentsTab
          league={league}
          members={members}
          draftPicks={draftPicks}
          freeAgencyMoves={freeAgencyMoves}
          manualBonuses={manualBonuses}
          spreadPicks={spreadPicks}
          scoreCorrections={scoreCorrections}
          gameData={gameData}
          onAddBonus={onAddBonus}
          onRemoveBonus={onRemoveBonus}
          onOverrideSpread={onOverrideSpread}
          onClearSpreadOverride={onClearSpreadOverride}
          onAddCorrection={onAddCorrection}
          onRemoveCorrection={onRemoveCorrection}
        />
      </div>
    </div>
  );
}
