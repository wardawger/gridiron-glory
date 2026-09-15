import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Coins, Trophy, BarChart3, AlertTriangle } from 'lucide-react';
import { Leaderboard } from '../components/league/Leaderboard';
import { TriviaCard } from '../components/ui/TriviaCard';
import type { League, LeagueMember, CaptainPick, GameData, ManualBonus, DraftPick, TeamSeasonStats, APRanking, SpreadPick, FreeAgencyMove, CfbTeam, ScoreCorrection, BenchPick } from '../types';
import { buildLeaderboard } from '../services/scoring';

interface Props {
  league: League;
  members: LeagueMember[];
  draftPicks: DraftPick[];
  captainPicks: CaptainPick[];
  manualBonuses: ManualBonus[];
  spreadPicks: SpreadPick[];
  freeAgencyMoves: FreeAgencyMove[];
  scoreCorrections: ScoreCorrection[];
  benchPicks: BenchPick[];
  gameData: GameData;
  seasonStats: Map<string, TeamSeasonStats>;
  rankings: APRanking[];
  teams: CfbTeam[];
  userId: string;
  cfbLoading: boolean;
  cfbError: string | null;
}

export function HomePage({
  league, members, draftPicks, captainPicks, manualBonuses, spreadPicks, freeAgencyMoves, scoreCorrections,
  benchPicks, gameData, seasonStats, rankings, teams, userId, cfbLoading, cfbError,
}: Props) {
  const confChampComplete = league.current_week >= 15;

  const leaderboard = useMemo(
    () => buildLeaderboard(
      members, draftPicks, captainPicks, gameData,
      league.scoring, manualBonuses, seasonStats, confChampComplete, spreadPicks,
      freeAgencyMoves, scoreCorrections, league.current_week, 17, benchPicks
    ),
    [members, draftPicks, captainPicks, gameData, league.scoring, manualBonuses, seasonStats, confChampComplete, spreadPicks, freeAgencyMoves, scoreCorrections, league.current_week, benchPicks]
  );

  return (
    <div className="space-y-6">
      {cfbLoading && (
        <div className="card p-4 flex items-center gap-3 text-sm text-turf-400">
          <Loader2 className="w-4 h-4 animate-spin text-field-400 flex-shrink-0" />
          Loading live game data from College Football Data API…
        </div>
      )}
      {/* Without this, a failed CFBD fetch and a genuine bye week rendered
          identically — standings, scores, and "No games this week" all
          looked the same whether the data behind them was real or just
          never arrived. cfbError already existed on useCfbData but was
          never read anywhere in the app. */}
      {!cfbLoading && cfbError && (
        <div className="card p-4 flex items-center gap-3 text-sm border-red-800/40 bg-red-950/20">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <span className="text-red-300">
            Live game data failed to load ({cfbError}). Standings below may be stale or incomplete — try refreshing.
          </span>
        </div>
      )}
      {!cfbLoading && seasonStats.size > 0 && !confChampComplete && (
        <div className="card p-4 flex items-center gap-3 text-sm border-amber-800/40 bg-amber-950/20">
          <BarChart3 className="w-4 h-4 text-amber-400 flex-shrink-0" />
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
      {league.draft_status === 'pending' ? (
        <div className="card p-12 text-center">
          <Trophy className="w-10 h-10 mx-auto mb-3 text-turf-700" />
          <p className="text-turf-300 font-medium">Standings will show up here once the draft starts</p>
          <p className="text-turf-500 text-sm mt-1 max-w-sm mx-auto">
            Each manager's total points, weekly trends, and roster analytics appear as soon as teams are drafted.
          </p>
          <Link to="/draft" className="btn-primary mt-4 inline-flex">Go to Draft Room</Link>
          <TriviaCard className="mt-8" />
        </div>
      ) : (
        <Leaderboard
          entries={leaderboard}
          currentWeek={league.current_week}
          userId={userId}
          confChampComplete={confChampComplete}
          draftPicks={draftPicks}
          rankings={rankings}
          teams={teams}
          scoring={league.scoring}
          spreadPicks={spreadPicks}
        />
      )}
    </div>
  );
}
