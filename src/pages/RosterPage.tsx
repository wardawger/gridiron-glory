import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { RosterView } from '../components/league/RosterView';
import type { League, LeagueMember, DraftPick, CaptainPick, GameData } from '../types';
import { calcWeeklyScore } from '../services/scoring';

interface Props {
  league: League;
  members: LeagueMember[];
  draftPicks: DraftPick[];
  captainPicks: CaptainPick[];
  gameData: GameData;
  userId: string;
  onSetCaptain: (week: number, teamId: string) => void;
}

export function RosterPage({
  league, members, draftPicks, captainPicks, gameData, userId, onSetCaptain,
}: Props) {
  const { userId: paramUserId } = useParams<{ userId?: string }>();
  const targetId = paramUserId ?? userId;
  const member   = members.find(m => m.user_id === targetId);

  const roster = useMemo(
    () => draftPicks.filter(p => p.user_id === targetId).map(p => ({
      team_id: p.team_id, team_name: p.team_name,
      team_logo: p.team_logo, team_conference: p.team_conference, team_color: '#052e16',
    })),
    [draftPicks, targetId]
  );

  // Build weekly scores
  const weeklyScores = useMemo(() => {
    return Array.from({ length: 18 }, (_, i) =>
      calcWeeklyScore(targetId, i, roster, captainPicks, gameData, league.scoring)
    );
  }, [targetId, roster, captainPicks, gameData, league.scoring]);

  // Captain usage count per team
  const captainUsage = useMemo(() => {
    const map = new Map<string, number>();
    captainPicks.filter(p => p.user_id === targetId).forEach(p => {
      map.set(p.team_id, (map.get(p.team_id) ?? 0) + 1);
    });
    return map;
  }, [captainPicks, targetId]);

  if (!member) return (
    <div className="text-center py-20 text-turf-500">Player not found</div>
  );

  return (
    <RosterView
      member={member}
      roster={roster}
      captainPicks={captainPicks}
      gameData={gameData}
      scoring={league.scoring}
      currentWeek={league.current_week}
      weeklyScores={weeklyScores}
      isOwner={targetId === userId || members.find(m => m.user_id === userId)?.role === 'commissioner'}
      onSetCaptain={targetId === userId ? onSetCaptain : undefined}
      captainUsage={captainUsage}
    />
  );
}
