import { useMemo } from 'react';
import { Shield, UserPlus, Settings, Gift } from 'lucide-react';
import type {
  League, LeagueMember, ManualBonus, DraftPick, SpreadPick, FreeAgencyMove,
  ScoringSettings, LeagueRole, CaptainPick, GameData, TeamSeasonStats, SeasonHistoryEntry, CfbTeam,
  TrophySnapshot, ScoreCorrection,
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
  gameData: GameData;
  seasonStats: Map<string, TeamSeasonStats>;
  teams: CfbTeam[];
  isCommissioner: boolean;
  onSendInvite: (email: string) => Promise<{ token?: string; emailSent?: boolean; error?: string }>;
  onUpdateWeek: (week: number) => void;
  onUpdateScoring: (s: ScoringSettings) => void;
  onAddBonus: (bonus: Omit<ManualBonus, 'id' | 'awarded_at' | 'awarded_by' | 'league_id'>) => void;
  onRemoveBonus: (id: string) => void;
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

export function AdminPanel({
  league, currentUserId, members, draftPicks, captainPicks, manualBonuses, spreadPicks, freeAgencyMoves, scoreCorrections,
  gameData, seasonStats, teams, isCommissioner,
  onSendInvite, onUpdateWeek, onUpdateScoring, onAddBonus, onRemoveBonus, onAddCorrection, onRemoveCorrection,
  onResetDraft, onDeleteLeague,
  onEndSeason, onOverrideSpread, onClearSpreadOverride, onUpdateMemberRole, onRemoveMember,
}: Props) {
  const { active: tab, select: selectTab, panelClass: tabPanelClass } = useTabCrossfade<Tab>('members');

  // Computed here (not inside MembersTab) since it needs almost the full
  // prop surface (draftPicks/captainPicks/gameData/bonuses/spreadPicks) to
  // call buildLeaderboard — moving the computation into the tab wouldn't
  // actually narrow its dependencies, so only the derived array is passed down.
  const finalStandings = useMemo((): SeasonHistoryEntry[] => {
    const board = buildLeaderboard(
      members, draftPicks, captainPicks, gameData,
      league.scoring, manualBonuses, seasonStats, true, spreadPicks,
      freeAgencyMoves, scoreCorrections, league.current_week
    );
    return board.map((e, i) => ({
      user_id: e.user_id, display_name: e.display_name,
      avatar_type: e.avatar_type, avatar_value: e.avatar_value,
      total_points: e.total_points, rank: i + 1,
    }));
  }, [members, draftPicks, captainPicks, gameData, league.scoring, manualBonuses, seasonStats, spreadPicks, freeAgencyMoves, scoreCorrections, league.current_week]);

  // Snapshotted alongside finalStandings so End Season can freeze both at
  // once — trophies are unrecoverable once the underlying tables are wiped.
  const trophySnapshot = useMemo(
    () => computeTrophies(members, draftPicks, captainPicks, spreadPicks, freeAgencyMoves, manualBonuses, gameData, league.scoring, scoreCorrections),
    [members, draftPicks, captainPicks, spreadPicks, freeAgencyMoves, manualBonuses, gameData, league.scoring, scoreCorrections]
  );

  if (!isCommissioner) {
    return (
      <div className="text-center py-20 text-turf-500">
        <Shield className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p>Commissioner access only</p>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'members',     label: 'Members',     icon: UserPlus },
    { id: 'scoring',     label: 'Scoring',     icon: Settings },
    { id: 'adjustments', label: 'Adjustments', icon: Gift },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center gap-3">
        <Shield className="w-6 h-6 text-field-400" />
        <h1 className="section-title text-2xl">Commissioner Panel</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-turf-900 p-1 rounded-xl border border-turf-800">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => selectTab(id)}
            className={`flex items-center gap-1.5 flex-1 justify-center px-2 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              tab === id
                ? 'bg-field-500 text-turf-950'
                : 'text-turf-400 hover:text-white'
            }`}
          >
            <Icon className="w-3.5 h-3.5 flex-shrink-0" /> {label}
          </button>
        ))}
      </div>

      {/* All three tabs stay mounted (hidden via CSS rather than unmounted
          via `&&`) so switching tabs never discards in-progress form edits —
          e.g. unsaved Scoring changes — the way the pre-split monolith's
          single always-mounted component never did either. tabPanelClass
          also drives the brief exit-then-fade-in on the panel content when
          switching, on top of that same always-mounted foundation. */}
      <div className={tabPanelClass('members')}>
        <MembersTab
          league={league}
          currentUserId={currentUserId}
          members={members}
          finalStandings={finalStandings}
          trophySnapshot={trophySnapshot}
          onSendInvite={onSendInvite}
          onUpdateWeek={onUpdateWeek}
          onUpdateMemberRole={onUpdateMemberRole}
          onRemoveMember={onRemoveMember}
          onResetDraft={onResetDraft}
          onDeleteLeague={onDeleteLeague}
          onEndSeason={onEndSeason}
        />
      </div>

      <div className={tabPanelClass('scoring')}>
        <ScoringTab league={league} teams={teams} onUpdateScoring={onUpdateScoring} />
      </div>

      <div className={tabPanelClass('adjustments')}>
        <AdjustmentsTab
          league={league}
          members={members}
          draftPicks={draftPicks}
          freeAgencyMoves={freeAgencyMoves}
          manualBonuses={manualBonuses}
          spreadPicks={spreadPicks}
          scoreCorrections={scoreCorrections}
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
