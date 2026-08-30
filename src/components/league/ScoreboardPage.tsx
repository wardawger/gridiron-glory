import { useMemo, useState } from 'react';
import { LayoutGrid, Star, TrendingUp, TrendingDown, Coins, Clock, MapPin, Tv, ChevronDown } from 'lucide-react';
import type {
  League, LeagueMember, DraftPick, CaptainPick, GameData, SpreadPick, FreeAgencyMove,
  ScoreCorrection, BenchPick, APRanking, CfbTeam, ScoreBreakdown, LiveGameStatus,
} from '../../types';
import { normalizeScoring } from '../../types';
import { calcWeeklyScore } from '../../services/scoring';
import { rosterAtWeek } from '../../services/roster';
import { useLiveScoreboard } from '../../hooks/useLiveScoreboard';
import { findLiveStatus, teamNameMatches } from '../../services/cfbd';
import { TeamLogo } from '../ui/TeamLogo';
import { Avatar } from '../ui/Avatar';

interface Props {
  league: League;
  members: LeagueMember[];
  draftPicks: DraftPick[];
  captainPicks: CaptainPick[];
  gameData: GameData;
  spreadPicks: SpreadPick[];
  freeAgencyMoves: FreeAgencyMove[];
  scoreCorrections: ScoreCorrection[];
  benchPicks: BenchPick[];
  rankings: APRanking[];
  teams: CfbTeam[];
  currentUserId: string;
}

type Row = { member: LeagueMember; breakdown: ScoreBreakdown; spreadPick: SpreadPick | null };

function formatGameDate(startDate: string | null, startTimeTbd: boolean): { date: string; time: string } {
  if (!startDate) return { date: 'TBD', time: 'TBD' };
  const d = new Date(startDate);
  const date = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const time = startTimeTbd
    ? 'TBD'
    : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  return { date, time };
}

// CFBD's /scoreboard reports quarter as a plain integer with no OT
// distinction beyond continuing to increment past 4.
function ordinal(period: number): string {
  if (period >= 5) return 'OT';
  return ['', '1st', '2nd', '3rd', '4th'][period] ?? `${period}th`;
}

// Possession indicator — a small football rather than a plain dot, styled
// after a typical scorebug football glyph (flat oval, seam + laces).
// Uses only currentColor (set via the caller's text-* class, kept green
// per request) plus the existing turf-950 token for the laces, so no new
// palette is added.
function FootballIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
      <ellipse cx="8" cy="8" rx="7" ry="4.2" fill="currentColor" />
      <g className="text-turf-950" stroke="currentColor" strokeWidth="0.6" strokeLinecap="round">
        <line x1="2.4" y1="8" x2="13.6" y2="8" />
        <line x1="6.4" y1="6.9" x2="6.4" y2="9.1" />
        <line x1="8" y1="6.7" x2="8" y2="9.3" />
        <line x1="9.6" y1="6.9" x2="9.6" y2="9.1" />
      </g>
    </svg>
  );
}

// Qualifying scoring categories for this game — shown as pills rather than
// exact per-line point values, since a captain's ×2 multiplier and any
// spread points would otherwise make reconstructing each line's individual
// contribution error-prone. b.points (from calcWeeklyScore, already
// authoritative) carries the real total instead.
function activeCategories(result: 'W' | 'L' | null, opponentRank: number | null, isG5Opponent: boolean): string[] {
  if (!result) return [];
  if (result === 'W') {
    const labels = ['Win'];
    if (opponentRank != null) labels.push('Beat Ranked');
    if ((opponentRank ?? 99) <= 15) labels.push('Beat Top 15');
    if ((opponentRank ?? 99) <= 5) labels.push('Beat Top 5');
    return labels;
  }
  const labels = ['Loss'];
  if (isG5Opponent) labels.push('Loss to G5');
  return labels;
}

function MatchupCard({ row, teamsById, isMe, live }: { row: Row; teamsById: Map<string, CfbTeam>; isMe: boolean; live: LiveGameStatus | null }) {
  const { breakdown: b, spreadPick } = row;
  const game = b.game!;
  const team = teamsById.get(b.team_id);
  const isHome = game.is_home;
  const gameDateInfo = formatGameDate(game.start_date, game.start_time_tbd);

  const spreadOutcome = spreadPick?.result ?? null;
  const spreadWon = spreadOutcome === null || spreadOutcome === 'push'
    ? null
    : (spreadPick!.side === 'cover' ? spreadOutcome === 'covered' : spreadOutcome === 'missed');

  // Only trust `live` as an in-progress signal once it actually carries a
  // period+clock — CFBD's /scoreboard also lists scheduled/final games, and
  // `game.completed` (from the separate /games endpoint) already covers final.
  const isLive = !game.completed && live?.status === 'in_progress' && live.period != null && live.clock != null;
  const myTeamHasBall = isLive && teamNameMatches(live!.possession, b.team_name);
  const opponentHasBall = isLive && teamNameMatches(live!.possession, game.opponent);

  // `game.completed` (from /games, cached up to 30 min) can lag well behind
  // reality — a game that just ended sits with stale pre-game info for up
  // to 30 minutes otherwise. When the live endpoint has already moved past
  // "in_progress" to "completed" and carries a final score, use that
  // immediately instead of waiting on the next /games refresh. Points
  // scoring itself still waits for the real /games data (unaffected here);
  // this only fixes what's displayed.
  const justFinished = !game.completed && live?.status === 'completed'
    && live.home_points != null && live.away_points != null;
  // While in-progress, the running score comes from the live endpoint too —
  // game.home_score/away_score (from /games) stay null until the game is
  // fully final.
  const liveMyPoints = isHome ? live?.home_points ?? null : live?.away_points ?? null;
  const liveOppPoints = isHome ? live?.away_points ?? null : live?.home_points ?? null;
  const myScore = game.completed
    ? (isHome ? game.home_score : game.away_score)
    : ((justFinished || isLive) ? liveMyPoints : null);
  const oppScore = game.completed
    ? (isHome ? game.away_score : game.home_score)
    : ((justFinished || isLive) ? liveOppPoints : null);
  const liveResult: 'W' | 'L' | null = justFinished && myScore != null && oppScore != null
    ? (myScore > oppScore ? 'W' : 'L')
    : null;
  const showFinal = game.completed || justFinished;
  const showScore = showFinal || isLive;
  const displayResult = game.completed ? game.result : liveResult;
  const categories = activeCategories(displayResult, game.opponent_rank, game.is_g5_opponent);

  return (
    <div className={`card p-4 space-y-3 ${isMe ? 'border-field-500/50 bg-field-950/10' : ''}`}>
      {b.is_captain && (
        <div className="flex justify-end">
          <span className="badge-gold text-xs">
            <Star className="w-2.5 h-2.5 fill-current" /> Captain ×2
          </span>
        </div>
      )}

      {/* Matchup — bordered, divided rows (ESPN-scorebug style) so the two
          teams and their scores line up in a consistent table-like grid
          rather than free-floating flex rows. */}
      <div className="rounded-lg border border-turf-800 divide-y divide-turf-800 overflow-hidden">
        <div className="flex items-center gap-2 px-2.5 py-2">
          <TeamLogo src={team?.logo} alt={b.team_name} fallbackName={b.team_name} size={28} />
          <span className="text-sm font-medium text-white truncate flex-1 min-w-0">
            {b.team_name}
          </span>
          {myTeamHasBall && <FootballIcon className="w-3.5 h-3.5 text-field-400 flex-shrink-0" />}
          {showScore && (
            <span className="font-mono text-base font-bold text-white flex-shrink-0 w-6 text-right">
              {myScore}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 px-2.5 py-2">
          <TeamLogo src={game.opponent_logo} alt={game.opponent} fallbackName={game.opponent} size={28} />
          <span className="text-sm text-turf-400 truncate flex-1 min-w-0">
            {game.opponent_rank ? `#${game.opponent_rank} ` : ''}{game.opponent}
          </span>
          {opponentHasBall && <FootballIcon className="w-3.5 h-3.5 text-field-400 flex-shrink-0" />}
          {showScore && (
            <span className="font-mono text-base font-bold text-turf-500 flex-shrink-0 w-6 text-right">
              {oppScore}
            </span>
          )}
        </div>
      </div>

      {/* Status */}
      {isLive ? (
        <div className="text-xs pt-1 border-t border-turf-800 flex flex-col items-center gap-0.5">
          <span className="flex items-center gap-1.5 font-medium text-field-400">
            <span className="w-1.5 h-1.5 rounded-full bg-field-400 animate-pulse flex-shrink-0" />
            {ordinal(live!.period!)} &middot; {live!.clock}
          </span>
          {live!.situation && <span className="text-turf-500">{live!.situation}</span>}
        </div>
      ) : !showFinal ? (
        <div className="text-xs text-turf-500 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 pt-1 border-t border-turf-800">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3 flex-shrink-0" />
            {gameDateInfo.date}{gameDateInfo.time !== 'TBD' ? ` · ${gameDateInfo.time}` : ''}
          </span>
          {game.venue && (
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3 flex-shrink-0" /> {game.venue}
            </span>
          )}
          {game.tv && (
            <span className="flex items-center gap-1">
              <Tv className="w-3 h-3 flex-shrink-0" /> {game.tv}
            </span>
          )}
        </div>
      ) : (
        <div className="pt-2 border-t border-turf-800 space-y-2">
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {categories.map(cat => (
              <span
                key={cat}
                className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${
                  displayResult === 'W'
                    ? 'border-field-800/50 bg-field-900/30 text-field-400'
                    : 'border-red-800/50 bg-red-950/30 text-red-300'
                }`}
              >
                {displayResult === 'W' ? <TrendingUp className="w-2.5 h-2.5 inline mr-0.5" /> : <TrendingDown className="w-2.5 h-2.5 inline mr-0.5" />}
                {cat}
              </span>
            ))}
            {spreadPick && (
              <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border flex items-center gap-0.5 ${
                spreadOutcome === 'push' ? 'border-turf-600 bg-turf-800 text-turf-300' :
                spreadWon ? 'border-field-800/50 bg-field-900/30 text-field-400' :
                spreadOutcome === null ? 'border-blue-800/50 bg-blue-950/30 text-blue-300' :
                'border-red-800/50 bg-red-950/30 text-red-300'
              }`}>
                <Coins className="w-2.5 h-2.5" />
                {spreadOutcome === null ? 'Spread pending' : spreadOutcome === 'push' ? 'Push' : spreadWon ? 'Covered' : 'Missed'}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-turf-400">This week</span>
            {justFinished ? (
              <span className="text-xs text-turf-500">Points pending</span>
            ) : (
              <span className={`font-mono font-bold text-lg ${
                b.points > 0 ? 'text-field-400' : b.points < 0 ? 'text-red-300' : 'text-turf-500'
              }`}>
                {b.points > 0 ? '+' : ''}{b.points}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function ScoreboardPage({
  league, members, draftPicks, captainPicks, gameData, spreadPicks, freeAgencyMoves,
  scoreCorrections, benchPicks, rankings, teams, currentUserId,
}: Props) {
  const scoring = normalizeScoring(league.scoring);
  const week = league.current_week;
  const teamsById = useMemo(() => new Map(teams.map(t => [t.id, t])), [teams]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // Live polling only runs while this page is mounted (see useLiveScoreboard) —
  // scoped here rather than in the app-wide 30-minute CFBD refresh cycle.
  const liveScoreboard = useLiveScoreboard(true);

  const toggleUser = (userId: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  // One row per active (non-benched) rostered team that has a game this
  // week — bye-week teams and benched teams are excluded entirely, per the
  // "only active teams" brief. Reuses calcWeeklyScore directly (the same
  // math standings/roster views already use) rather than recomputing
  // anything, so this page can never disagree with the real scores.
  const matchups = useMemo(() => {
    const rows: Row[] = [];
    members.forEach(member => {
      const roster = rosterAtWeek(member.user_id, week, draftPicks, freeAgencyMoves);
      if (roster.length === 0) return;
      const weekly = calcWeeklyScore(
        member.user_id, week, roster, captainPicks, gameData, scoring,
        spreadPicks, freeAgencyMoves, scoreCorrections, benchPicks
      );
      weekly.breakdown.forEach(b => {
        if (b.is_benched || !b.game) return;
        const spreadPick = spreadPicks.find(
          p => p.user_id === member.user_id && p.week === week && p.team_id === b.team_id
        ) ?? null;
        rows.push({ member, breakdown: b, spreadPick });
      });
    });
    return rows.sort((a, b) => {
      const aTime = a.breakdown.game?.start_date ? new Date(a.breakdown.game.start_date).getTime() : Infinity;
      const bTime = b.breakdown.game?.start_date ? new Date(b.breakdown.game.start_date).getTime() : Infinity;
      return aTime - bTime;
    });
  }, [members, draftPicks, freeAgencyMoves, captainPicks, gameData, scoring, spreadPicks, scoreCorrections, benchPicks, week]);

  // Grouped by owner, in league-member order, skipping anyone with no
  // active matchups this week — chronological order within each group is
  // already set by the sort above.
  const groups = useMemo(() => {
    const byUser = new Map<string, Row[]>();
    matchups.forEach(row => {
      const list = byUser.get(row.member.user_id) ?? [];
      list.push(row);
      byUser.set(row.member.user_id, list);
    });
    return members
      .map(member => ({ member, rows: byUser.get(member.user_id) ?? [] }))
      .filter(g => g.rows.length > 0);
  }, [matchups, members]);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="card p-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-field-500 flex items-center justify-center flex-shrink-0">
            <LayoutGrid className="w-5 h-5 text-turf-950" />
          </div>
          <div>
            <h1 className="font-display text-2xl tracking-wide text-white">Scoreboard</h1>
            <p className="text-turf-500 text-sm">
              Week {week} · every active team's matchup, {matchups.length} game{matchups.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="card p-12 text-center text-turf-500">
          <LayoutGrid className="w-8 h-8 mx-auto mb-3 text-turf-700" />
          <p>No active teams have a game this week.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(({ member, rows }) => {
            const isMe = member.user_id === currentUserId;
            const isCollapsed = collapsed.has(member.user_id);
            const weekPoints = rows.reduce((s, r) => s + r.breakdown.points, 0);
            return (
              <div key={member.user_id} className="card overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleUser(member.user_id)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-turf-800/40 transition-colors"
                  aria-expanded={!isCollapsed}
                >
                  <Avatar
                    displayName={member.display_name}
                    avatarType={member.avatar_type}
                    avatarValue={member.avatar_value}
                    size={28}
                    bgClassName={isMe ? 'bg-field-500' : undefined}
                    textClassName={isMe ? 'text-turf-950' : undefined}
                  />
                  <span className={`text-sm font-medium truncate ${isMe ? 'text-field-300' : 'text-white'}`}>
                    {member.display_name}{isMe ? ' (You)' : ''}
                  </span>
                  <span className="text-xs text-turf-500 flex-shrink-0">
                    {rows.length} game{rows.length !== 1 ? 's' : ''}
                  </span>
                  <span className={`font-mono font-bold text-sm flex-shrink-0 ml-auto ${
                    weekPoints > 0 ? 'text-field-400' : weekPoints < 0 ? 'text-red-300' : 'text-turf-500'
                  }`}>
                    {weekPoints > 0 ? '+' : ''}{weekPoints}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-turf-500 flex-shrink-0 transition-transform ${isCollapsed ? '' : 'rotate-180'}`} />
                </button>

                {!isCollapsed && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 p-4 pt-0 border-t border-turf-800">
                    {rows.map(row => {
                      const game = row.breakdown.game!;
                      const live = findLiveStatus(liveScoreboard, row.breakdown.team_name)
                        ?? findLiveStatus(liveScoreboard, game.opponent);
                      return (
                        <MatchupCard key={row.breakdown.team_id} row={row} teamsById={teamsById} isMe={isMe} live={live} />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
