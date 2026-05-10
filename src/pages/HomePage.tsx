import { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { Leaderboard } from '../components/league/Leaderboard';
import type { League, LeagueMember, CaptainPick, GameData, ManualBonus, DraftPick, TeamSeasonStats } from '../types';
import { buildLeaderboard } from '../services/scoring';

interface Props {
  league: League;
  members: LeagueMember[];
  draftPicks: DraftPick[];
  captainPicks: CaptainPick[];
  manualBonuses: ManualBonus[];
  gameData: GameData;
  seasonStats: Map<string, TeamSeasonStats>;
  userId: string;
  cfbLoading: boolean;
}

export function HomePage({
  league, members, draftPicks, captainPicks, manualBonuses,
  gameData, seasonStats, userId, cfbLoading,
}: Props) {
  const rosters = useMemo(() => {
    const map = new Map<string, { team_id: string; team_name: string; team_logo: string; team_conference: string; team_color: string }[]>();
    draftPicks.forEach(p => {
      if (!map.has(p.user_id)) map.set(p.user_id, []);
      map.get(p.user_id)!.push({
        team_id: p.team_id, team_name: p.team_name,
        team_logo: p.team_logo, team_conference: p.team_conference, team_color: '#052e16',
      });
    });
    return map;
  }, [draftPicks]);

  // Commissioner marks conf champ week complete via the current_week field
  // We treat week >= 15 as conf championship week complete (adjustable)
  const confChampComplete = league.current_week >= 15;

  const leaderboard = useMemo(
    () => buildLeaderboard(
      members, rosters, captainPicks, gameData,
      league.scoring, manualBonuses, seasonStats, confChampComplete
    ),
    [members, rosters, captainPicks, gameData, league.scoring, manualBonuses, seasonStats, confChampComplete]
  );

  return (
    <div className="space-y-6">
      {cfbLoading && (
        <div className="card p-4 flex items-center gap-3 text-sm text-turf-400">
          <Loader2 className="w-4 h-4 animate-spin text-field-400 flex-shrink-0" />
          Loading live game data from College Football Data API…
        </div>
      )}
      {!cfbLoading && seasonStats.size > 0 && !confChampComplete && (
        <div className="card p-4 flex items-center gap-3 text-sm border-amber-800/40 bg-amber-950/20">
          <span className="text-amber-400">📊</span>
          <span className="text-amber-300">
            Statistical ranking bonuses (Top/Bottom 3 QBR, TDs, INTs, Sacks) are shown as a live preview.
            Points lock in after conference championship week.
          </span>
        </div>
      )}
      <Leaderboard
        entries={leaderboard}
        currentWeek={league.current_week}
        userId={userId}
        confChampComplete={confChampComplete}
      />
    </div>
  );
}
