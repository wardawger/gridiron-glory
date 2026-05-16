import { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { Leaderboard } from '../components/league/Leaderboard';
import type { League, LeagueMember, CaptainPick, GameData, ManualBonus, DraftPick, TeamSeasonStats, APRanking, SpreadPick } from '../types';
import { buildLeaderboard } from '../services/scoring';

interface Props {
  league: League;
  members: LeagueMember[];
  draftPicks: DraftPick[];
  captainPicks: CaptainPick[];
  manualBonuses: ManualBonus[];
  spreadPicks: SpreadPick[];
  gameData: GameData;
  seasonStats: Map<string, TeamSeasonStats>;
  rankings: APRanking[];
  userId: string;
  cfbLoading: boolean;
}

export function HomePage({
  league, members, draftPicks, captainPicks, manualBonuses, spreadPicks,
  gameData, seasonStats, rankings, userId, cfbLoading,
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

  const confChampComplete = league.current_week >= 15;

  const leaderboard = useMemo(
    () => buildLeaderboard(
      members, rosters, captainPicks, gameData,
      league.scoring, manualBonuses, seasonStats, confChampComplete, spreadPicks
    ),
    [members, rosters, captainPicks, gameData, league.scoring, manualBonuses, seasonStats, confChampComplete, spreadPicks]
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
          <span className="text-blue-400">📊</span>
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
