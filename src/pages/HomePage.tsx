import { useMemo } from 'react';
import { Loader2, Coins } from 'lucide-react';
import { Leaderboard } from '../components/league/Leaderboard';
import type { League, LeagueMember, CaptainPick, GameData, ManualBonus, DraftPick, TeamSeasonStats, APRanking, SpreadPick, FreeAgencyMove } from '../types';
import { buildLeaderboard } from '../services/scoring';

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
  rankings: APRanking[];
  userId: string;
  cfbLoading: boolean;
}

export function HomePage({
  league, members, draftPicks, captainPicks, manualBonuses, spreadPicks, freeAgencyMoves,
  gameData, seasonStats, rankings, userId, cfbLoading,
}: Props) {
  const confChampComplete = league.current_week >= 15;

  const leaderboard = useMemo(
    () => buildLeaderboard(
      members, draftPicks, captainPicks, gameData,
      league.scoring, manualBonuses, seasonStats, confChampComplete, spreadPicks,
      freeAgencyMoves, league.current_week
    ),
    [members, draftPicks, captainPicks, gameData, league.scoring, manualBonuses, seasonStats, confChampComplete, spreadPicks, freeAgencyMoves, league.current_week]
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
            Statistical ranking bonuses are shown as a live preview (◎). Points lock in after conference championship week.
          </span>
        </div>
      )}
      {league.scoring.spread_enabled && (
        <div className="card p-4 flex items-center gap-3 text-sm border-blue-800/40 bg-blue-950/20">
          <Coins className="w-4 h-4 text-blue-400 flex-shrink-0" />
          <span className="text-blue-300">
            Spread betting is active this season. Visit My Roster to make your weekly spread picks.
          </span>
        </div>
      )}
      <Leaderboard
        entries={leaderboard}
        currentWeek={league.current_week}
        userId={userId}
        confChampComplete={confChampComplete}
        draftPicks={draftPicks}
        rankings={rankings}
      />
    </div>
  );
}
