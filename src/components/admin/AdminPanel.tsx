import { useMemo } from 'react';
import { Shield, UserPlus, Settings, Gift } from 'lucide-react';
import type {
  League, LeagueMember, ManualBonus, DraftPick, SpreadPick, FreeAgencyMove,
  ScoringSettings, LeagueRole, CaptainPick, GameData, TeamSeasonStats, SeasonHistoryEntry,
} from '../../types';
import { buildLeaderboard } from '../../services/scoring';
import { useTabCrossfade } from '../../hooks/useCrossfade';
import { MembersTab } from './MembersTab';
import { ScoringTab } from './ScoringTab';
import { BonusesTab } from './BonusesTab';

interface Props {
  league: League;
  members: LeagueMember[];
  draftPicks: DraftPick[];
  captainPicks: CaptainPick[];
  manualBonuses: ManualBonus[];
  spreadPicks: SpreadPick[];
  freeAgencyMoves: FreeAgencyMove[];
  gameData: GameData;
  seasonStats: Map<string, TeamSeasonStats>;
  isCommissioner: boolean;
  onSendInvite: (email: string) => Promise<{ token?: string; error?: string }>;
  onUpdateWeek: (week: number) => void;
  onUpdateScoring: (s: ScoringSettings) => void;
  onAddBonus: (bonus: Omit<ManualBonus, 'id' | 'awarded_at' | 'awarded_by' | 'league_id'>) => void;
  onRemoveBonus: (id: string) => void;
  onRemoveFromRoster: (userId: string, teamId: string) => void;
  onResetDraft: () => Promise<{ error?: string }>;
  onDeleteLeague: () => Promise<{ error?: string }>;
  onEndSeason: (seasonLabel: string, standings: SeasonHistoryEntry[]) => Promise<{ error?: string }>;
  onOverrideSpread: (pickId: string, result: 'covered' | 'missed', points: number) => Promise<{ error?: string }>;
  onClearSpreadOverride: (pickId: string) => Promise<{ error?: string }>;
  onUpdateMemberRole: (userId: string, role: LeagueRole) => Promise<{ error?: string }>;
}

type Tab = 'members' | 'scoring' | 'bonuses';

export function AdminPanel({
  league, members, draftPicks, captainPicks, manualBonuses, spreadPicks, freeAgencyMoves,
  gameData, seasonStats, isCommissioner,
  onSendInvite, onUpdateWeek, onUpdateScoring, onAddBonus, onRemoveBonus, onResetDraft, onDeleteLeague,
  onEndSeason, onOverrideSpread, onClearSpreadOverride, onUpdateMemberRole,
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
      freeAgencyMoves, league.current_week
    );
    return board.map((e, i) => ({
      user_id: e.user_id, display_name: e.display_name,
      avatar_type: e.avatar_type, avatar_value: e.avatar_value,
      total_points: e.total_points, rank: i + 1,
    }));
  }, [members, draftPicks, captainPicks, gameData, league.scoring, manualBonuses, seasonStats, spreadPicks, freeAgencyMoves, league.current_week]);

  if (!isCommissioner) {
    return (
      <div className="text-center py-20 text-turf-500">
        <Shield className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p>Commissioner access only</p>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'members',  label: 'Members',  icon: UserPlus },
    { id: 'scoring',  label: 'Scoring',  icon: Settings },
    { id: 'bonuses',  label: 'Bonuses',  icon: Gift },
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
          members={members}
          finalStandings={finalStandings}
          onSendInvite={onSendInvite}
          onUpdateWeek={onUpdateWeek}
          onUpdateMemberRole={onUpdateMemberRole}
          onResetDraft={onResetDraft}
          onDeleteLeague={onDeleteLeague}
          onEndSeason={onEndSeason}
        />
      </div>

      <div className={tabPanelClass('scoring')}>
        <ScoringTab league={league} onUpdateScoring={onUpdateScoring} />
      </div>

      <div className={tabPanelClass('bonuses')}>
        <BonusesTab
          league={league}
          members={members}
          draftPicks={draftPicks}
          freeAgencyMoves={freeAgencyMoves}
          manualBonuses={manualBonuses}
          spreadPicks={spreadPicks}
          onAddBonus={onAddBonus}
          onRemoveBonus={onRemoveBonus}
          onOverrideSpread={onOverrideSpread}
          onClearSpreadOverride={onClearSpreadOverride}
        />
      </div>
    </div>
  );
}
