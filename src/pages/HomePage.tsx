import { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { Leaderboard } from '../components/league/Leaderboard';
import type { League, LeagueMember, CaptainPick, GameData, ManualBonus, DraftPick } from '../types';
import { buildLeaderboard } from '../services/scoring';

interface Props {
  league: League;
  members: LeagueMember[];
  draftPicks: DraftPick[];
  captainPicks: CaptainPick[];
  manualBonuses: ManualBonus[];
  gameData: GameData;
  userId: string;
  cfbLoading: boolean;
}

export function HomePage({
  league, members, draftPicks, captainPicks, manualBonuses,
  gameData, userId, cfbLoading,
}: Props) {
  // Build rosters map from draft picks
  const rosters = useMemo(() => {
    const map = new Map<string, { team_id: string; team_name: string; team_logo: string; team_conference: string; team_color: string }[]>();
    draftPicks.forEach(p => {
      if (!map.has(p.user_id)) map.set(p.user_id, []);
      map.get(p.user_id)!.push({
        team_id: p.team_id,
        team_name: p.team_name,
        team_logo: p.team_logo,
        team_conference: p.team_conference,
        team_color: '#052e16',
      });
    });
    return map;
  }, [draftPicks]);

  const leaderboard = useMemo(
    () => buildLeaderboard(members, rosters, captainPicks, gameData, league.scoring, manualBonuses),
    [members, rosters, captainPicks, gameData, league.scoring, manualBonuses]
  );

  return (
    <div className="space-y-6">
      {cfbLoading && (
        <div className="card p-4 flex items-center gap-3 text-sm text-turf-400">
          <Loader2 className="w-4 h-4 animate-spin text-field-400 flex-shrink-0" />
          Loading live game data from College Football Data API…
        </div>
      )}
      <Leaderboard
        entries={leaderboard}
        currentWeek={league.current_week}
        userId={userId}
      />
    </div>
  );
}
