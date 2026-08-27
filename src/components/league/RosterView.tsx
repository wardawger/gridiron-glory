import { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, TrendingUp, TrendingDown, Minus, Star, Calendar, List, X, MapPin, Tv, Clock, Zap, Coins, ChevronDown, UserCheck, Armchair, Lock } from 'lucide-react';
import type { RosterEntry, CaptainPick, GameData, ScoringSettings, LeagueMember, WeeklyScore, GameResult, SpreadPick, SpreadData, FreeAgencyMove, DraftPick, ScoreCorrection, BenchPick } from '../../types';
import { calcWeeklyScore, scoreGame, getSpreadOutcome, scoreSpread } from '../../services/scoring';
import { rosterAtWeek, isGameKickedOff } from '../../services/roster';
import { useTabCrossfade } from '../../hooks/useCrossfade';
import { Tooltip } from '../ui/Tooltip';
import { TeamLogo } from '../ui/TeamLogo';
import { WeatherBadge } from '../ui/WeatherBadge';
import { Avatar } from '../ui/Avatar';
import { TriviaCard } from '../ui/TriviaCard';
import { FadeIn } from '../amicro/fade-in';

interface Props {
  member: LeagueMember;
  roster: RosterEntry[];
  draftPicks: DraftPick[];
  captainPicks: CaptainPick[];
  gameData: GameData;
  scoring: ScoringSettings;
  currentWeek: number;
  weeklyScores: WeeklyScore[];
  isOwner: boolean;
  onSetCaptain?: (week: number, teamId: string) => void;
  captainUsage: Map<string, number>;
  // Spread props
  spreadData: Record<number, SpreadData>;
  spreadPicks: SpreadPick[];
  spreadUsage: Map<string, number>;
  onSetSpread?: (week: number, teamId: string, lockedSpread: number, side?: 'cover' | 'against') => Promise<{ error?: string }>;
  onRemoveSpread?: (week: number, teamId: string) => Promise<{ error?: string }>;
  onRefreshSpreads: (week: number) => Promise<void>;
  freeAgencyMoves: FreeAgencyMove[];
  scoreCorrections: ScoreCorrection[];
  viewUserId: string;
  members: LeagueMember[];
  currentUserId: string;
  // Bench props
  benchPicks: BenchPick[];
  onSwapBench?: (week: number, benchTeamId: string, starterTeamId: string) => Promise<{ error?: string }>;
  onEnsureBenchSeeded?: (week: number, rosterTeamIds: string[]) => Promise<void>;
}

const WEEKS = Array.from({ length: 16 }, (_, i) => i); // weeks 0–15

// Format a startDate ISO string into readable date + time
function formatGameDate(startDate: string | null | undefined, startTimeTbd: boolean): { date: string; time: string } {
  if (!startDate) return { date: 'TBD', time: 'TBD' };
  const d = new Date(startDate);
  const date = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const time = startTimeTbd
    ? 'TBD'
    : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  return { date, time };
}

// ── Spread helpers ────────────────────────────────────────────────────────

function formatSpread(spread: number | null | undefined): string {
  if (spread == null) return 'N/A';
  if (spread === 0) return 'EVEN';
  return spread > 0 ? `+${spread}` : `${spread}`;
}

function spreadLabel(spread: number | null | undefined, teamName: string): string {
  if (spread == null) return 'No line';
  if (spread === 0) return "Pick 'em";
  return spread < 0
    ? `${teamName} favored by ${Math.abs(spread)}`
    : `${teamName} underdog by ${spread}`;
}

// ── Game Score Breakdown Modal ───────────────────────────────────────────────

interface GameScoreModalProps {
  game: GameResult;
  teamName: string;
  teamLogo: string;
  week: number;
  isCaptain: boolean;
  scoring: ScoringSettings;
  spreadPick: SpreadPick | null;
  onClose: () => void;
}

function GameScoreModal({ game, teamName, teamLogo, week, isCaptain, scoring, spreadPick, onClose }: GameScoreModalProps) {
  const isWin      = game.result === 'W';
  const isLoss     = game.result === 'L';
  const isComplete = game.completed;
  const isHome     = (game as any).is_home ?? true;
  const oppLogo    = (game as any).opponent_logo ?? null;
  const myScore    = isHome ? game.home_score : game.away_score;
  const oppScore   = isHome ? game.away_score : game.home_score;
  const gameDateInfo = formatGameDate(game.start_date, game.start_time_tbd);

  // Build individual scoring line items
  const lines: { label: string; pts: number; active: boolean; color: string }[] = [];

  if (isComplete && game.result) {
    if (isWin) {
      lines.push({ label: 'Win',                   pts: scoring.win,       active: true,                              color: 'text-field-400' });
      lines.push({ label: 'Win vs Ranked',          pts: scoring.win_ranked, active: game.opponent_rank != null,       color: 'text-field-400' });
      lines.push({ label: 'Win vs Top 15',          pts: scoring.win_top15,  active: (game.opponent_rank ?? 99) <= 15, color: 'text-field-400' });
      lines.push({ label: 'Win vs Top 5',           pts: scoring.win_top5,   active: (game.opponent_rank ?? 99) <= 5,  color: 'text-field-400' });
    } else {
      lines.push({ label: 'Loss',                   pts: scoring.loss,      active: true,                              color: 'text-red-300' });
      lines.push({ label: 'Loss to G5',             pts: scoring.loss_g5,   active: game.is_g5_opponent,               color: 'text-red-300' });
    }
  }

  // Spread points — only relevant if the owner actually picked this team's
  // spread that week. Reuses the same scoring functions the real weekly
  // total is computed with, so this always agrees with the rest of the app.
  let spreadPts = 0;
  let spreadOutcome: 'covered' | 'missed' | 'push' | null = null;
  const spreadSide = spreadPick?.side ?? 'cover';
  if (spreadPick && isComplete) {
    if (spreadPick.points !== null && spreadPick.result !== null) {
      spreadPts = spreadPick.points;
      spreadOutcome = spreadPick.result;
    } else {
      const baseGamePts = scoreGame(game, scoring, false);
      spreadOutcome = getSpreadOutcome(game, spreadPick.locked_spread, isHome);
      spreadPts = scoreSpread(game, scoring, spreadPick.locked_spread, isHome, baseGamePts, spreadSide);
    }
  }
  // Push always nets 0 regardless of side; otherwise "against" wins when
  // the line was missed and vice versa.
  const spreadWon = spreadOutcome === null || spreadOutcome === 'push'
    ? null
    : spreadSide === 'cover' ? spreadOutcome === 'covered' : spreadOutcome === 'missed';

  const basePoints    = scoreGame(game, scoring, false);
  const captainBonus  = scoreGame(game, scoring, isCaptain) - basePoints;
  const totalPoints   = scoreGame(game, scoring, isCaptain) + spreadPts;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl border border-turf-700 bg-turf-950 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header — scoreboard: logo + score per side */}
        <div className="relative border-b border-turf-800 px-5 py-5">
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3 right-3 rounded-lg border border-turf-700 p-1.5 text-turf-400 hover:border-turf-500 hover:text-white transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <div className="flex items-center justify-center gap-4">
            {/* My team */}
            <div className="flex flex-1 flex-col items-center gap-2 min-w-0">
              <TeamLogo src={teamLogo} alt={teamName} fallbackName={teamName} size={44} />
              <span className={`font-mono text-3xl font-bold ${
                !isComplete ? 'text-turf-600' : isWin ? 'text-white' : 'text-turf-500'
              }`}>
                {myScore ?? '–'}
              </span>
              <span className="text-xs text-turf-400 text-center leading-tight max-w-24 truncate">{teamName}</span>
            </div>

            <div className="flex flex-shrink-0 flex-col items-center gap-1 px-1">
              <span className="text-xs text-turf-500">Week {week}</span>
              <span className="text-[10px] uppercase tracking-wide text-turf-600">
                {isComplete ? 'Final' : (isHome ? 'vs' : 'at')}
              </span>
            </div>

            {/* Opponent */}
            <div className="flex flex-1 flex-col items-center gap-2 min-w-0">
              <TeamLogo src={oppLogo} alt={game.opponent} fallbackName={game.opponent} size={44} />
              <span className={`font-mono text-3xl font-bold ${
                !isComplete ? 'text-turf-600' : isLoss ? 'text-white' : 'text-turf-500'
              }`}>
                {oppScore ?? '–'}
              </span>
              <span className="text-xs text-turf-400 text-center leading-tight max-w-24 truncate">
                {game.opponent_rank ? `#${game.opponent_rank} ` : ''}{game.opponent}
              </span>
            </div>
          </div>
        </div>

        {/* Result badge */}
        {isComplete && game.result ? (
          <div className={`mx-5 mt-4 rounded-lg px-4 py-2 flex items-center justify-center gap-2 ${
            isWin ? 'bg-field-900/40 border border-field-800/50' : 'bg-red-900/30 border border-red-800/50'
          }`}>
            {isWin
              ? <TrendingUp className="w-4 h-4 text-field-400" />
              : <TrendingDown className="w-4 h-4 text-red-300" />
            }
            <span className={`font-bold text-sm ${isWin ? 'text-field-300' : 'text-red-300'}`}>
              {game.result === 'W' ? 'WIN' : 'LOSS'}
            </span>
          </div>
        ) : (
          <div className="mx-5 mt-4 rounded-lg px-4 py-2 bg-turf-800/50 border border-turf-700">
            <p className="text-xs text-turf-400 text-center">Game not yet played</p>
          </div>
        )}

        {/* Schedule details — date/time, venue, broadcast */}
        {(game.start_date || game.venue || game.tv) && (
          <div className="mx-5 mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-turf-400">
            {game.start_date && (
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                {gameDateInfo.date}
                {gameDateInfo.time !== 'TBD' ? ` · ${gameDateInfo.time}` : ' · TBD'}
              </span>
            )}
            {game.venue && (
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 flex-shrink-0" /> {game.venue}
              </span>
            )}
            {game.tv && (
              <span className="flex items-center gap-1.5">
                <Tv className="w-3.5 h-3.5 flex-shrink-0" /> {game.tv}
              </span>
            )}
            <WeatherBadge
              condition={game.weather_condition}
              temp={game.weather_temp}
              windSpeed={game.wind_speed}
              indoors={game.game_indoors}
            />
          </div>
        )}

        {/* Scoring breakdown */}
        <div className="px-5 py-4 space-y-2">
          <p className="text-xs text-turf-500 uppercase tracking-wide font-medium mb-3">Scoring Breakdown</p>

          {lines.length === 0 && (
            <p className="text-xs text-turf-500 text-center py-2">No points — game not completed</p>
          )}

          {lines.map(line => (
            <div
              key={line.label}
              className={`flex items-center justify-between text-sm ${
                line.active ? '' : 'opacity-25'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  line.active ? (isWin ? 'bg-field-400' : 'bg-red-400') : 'bg-turf-700'
                }`} />
                <span className={line.active ? 'text-turf-200' : 'text-turf-600'}>{line.label}</span>
              </div>
              <span className={`font-mono font-medium ${
                line.active
                  ? line.pts >= 0 ? 'text-field-400' : 'text-red-300'
                  : 'text-turf-700'
              }`}>
                {line.pts > 0 ? '+' : ''}{line.pts}
              </span>
            </div>
          ))}

          {/* Spread pick */}
          {spreadPick && isComplete && spreadOutcome !== null && (
            <div className="mt-3 pt-3 border-t border-turf-800 flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Coins className={`w-3.5 h-3.5 flex-shrink-0 ${
                  spreadOutcome === 'push' ? 'text-turf-400' : spreadWon ? 'text-field-400' : 'text-red-300'
                }`} />
                <span className={spreadOutcome === 'push' ? 'text-turf-300' : spreadWon ? 'text-field-300' : 'text-red-300'}>
                  {spreadSide === 'against' ? 'Picked against · ' : ''}
                  {spreadOutcome === 'push' ? 'Push' : spreadOutcome === 'covered' ? 'Covered' : 'Missed'}
                  {' '}({formatSpread(spreadPick.locked_spread)})
                </span>
              </div>
              <span className={`font-mono font-medium ${
                spreadPts > 0 ? 'text-field-400' : spreadPts < 0 ? 'text-red-300' : 'text-turf-400'
              }`}>
                {spreadPts > 0 ? '+' : ''}{spreadPts}
              </span>
            </div>
          )}

          {/* Captain multiplier */}
          {isCaptain && isComplete && game.result && (
            <div className="mt-3 pt-3 border-t border-turf-800 flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                <span className="text-amber-300">Captain ×2 bonus</span>
              </div>
              <span className="font-mono font-medium text-amber-400">
                +{captainBonus}
              </span>
            </div>
          )}

          {/* Total */}
          <div className="mt-3 pt-3 border-t border-turf-700 flex items-center justify-between">
            <span className="font-semibold text-white text-sm">Total Points</span>
            <span className={`font-mono font-bold text-lg ${
              totalPoints > 0 ? 'text-field-400' : totalPoints < 0 ? 'text-red-300' : 'text-turf-500'
            }`}>
              {totalPoints > 0 ? '+' : ''}{totalPoints}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Schedule Detail Modal ─────────────────────────────────────────────────────

interface ModalProps {
  team: RosterEntry;
  gameData: GameData;
  captainPicks: CaptainPick[];
  userId: string;
  currentWeek: number;
  onClose: () => void;
}

function ScheduleModal({ team, gameData, captainPicks, userId, currentWeek, onClose }: ModalProps) {
  const teamGames = gameData[team.team_id] ?? {};

  const weeks = WEEKS.filter(w => teamGames[w]);
  // Weeks 14–15 excluded: week 14 is conference championship week (most
  // teams simply don't play), and week 15 is dead except Army-Navy — not
  // real "off weeks" in the bye-week sense for most teams.
  const byes  = WEEKS.filter(w => !teamGames[w] && w >= 1 && w <= 13);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-turf-700 bg-turf-950 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center gap-4 border-b border-turf-800 bg-turf-950 px-6 py-4">
          <TeamLogo src={team.team_logo} alt={team.team_name} fallbackName={team.team_name} size={48} />
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-xl font-bold text-white tracking-wide">{team.team_name}</h2>
            <p className="text-sm text-turf-400">{team.team_conference} · 2026 Schedule</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg border border-turf-700 p-1.5 text-turf-400 hover:border-turf-500 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Games list */}
        <div className="divide-y divide-turf-800/60 px-2 py-2">
          {weeks.length === 0 && (
            <p className="py-8 text-center text-turf-500">No schedule data available yet.</p>
          )}

          {WEEKS.map(w => {
            const game = teamGames[w];
            if (!game) return null;

            const isCaptain = captainPicks.some(p => p.user_id === userId && p.week === w && p.team_id === team.team_id);
            const isCurrent = w === currentWeek;
            const { date, time } = formatGameDate((game as any).start_date, (game as any).start_time_tbd ?? false);
            const venue    = (game as any).venue    ?? null;
            const tv       = (game as any).tv       ?? null;
            const isHome   = (game as any).is_home  ?? true;
            const oppLogo  = (game as any).opponent_logo ?? null;

            return (
              <div
                key={w}
                className={`flex items-start gap-4 rounded-xl px-4 py-4 transition-colors ${
                  isCurrent ? 'bg-field-900/20 border border-field-800/40' :
                  isCaptain ? 'bg-amber-950/20' : 'hover:bg-turf-900/40'
                }`}
              >
                {/* Week badge */}
                <div className={`flex-shrink-0 w-12 text-center pt-0.5`}>
                  <div className={`text-xs font-bold uppercase tracking-widest ${isCurrent ? 'text-field-400' : 'text-turf-500'}`}>
                    {w === 0 ? 'Wk0' : `Wk ${w}`}
                  </div>
                  {isCaptain && (
                    <div className="mt-1 text-amber-400 text-xs">★ Cap</div>
                  )}
                </div>

                {/* Opponent logo */}
                <div className="flex-shrink-0 mt-0.5">
                  <TeamLogo src={oppLogo} alt={game.opponent} fallbackName={game.opponent} size={40} />
                </div>

                {/* Main game info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-turf-500">{isHome ? 'vs' : 'at'}</span>
                    <span className="font-semibold text-white">
                      {game.opponent_rank ? (
                        <span className="text-turf-400 font-normal">#{game.opponent_rank} </span>
                      ) : null}
                      {game.opponent}
                    </span>
                    {game.result && (
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                        game.result === 'W' ? 'bg-field-900/40 text-field-400' : 'bg-red-900/40 text-red-300'
                      }`}>
                        {game.result}
                        {game.home_score != null && game.away_score != null
                          ? ` ${game.home_score}–${game.away_score}` : ''}
                      </span>
                    )}
                  </div>

                  {/* Meta row */}
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-turf-500">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3 flex-shrink-0" />
                      {date}{time !== 'TBD' ? ` · ${time}` : ''}
                    </span>
                    {venue && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate max-w-48">{venue}</span>
                      </span>
                    )}
                    {tv && (
                      <span className="flex items-center gap-1">
                        <Tv className="h-3 w-3 flex-shrink-0" />
                        {tv}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Bye weeks summary */}
          {byes.length > 0 && (
            <div className="px-4 py-3">
              <p className="text-xs text-turf-500">
                <span className="text-turf-500 font-medium">Bye weeks: </span>
                {byes.map(w => `Wk ${w}`).join(', ')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main RosterView ───────────────────────────────────────────────────────────

export function RosterView({
  member, roster, draftPicks, captainPicks, gameData, scoring,
  currentWeek, weeklyScores, isOwner, onSetCaptain, captainUsage,
  spreadData, spreadPicks, spreadUsage, onSetSpread, onRemoveSpread, onRefreshSpreads,
  freeAgencyMoves, scoreCorrections, viewUserId, members, currentUserId,
  benchPicks, onSwapBench, onEnsureBenchSeeded,
}: Props) {
  const navigate = useNavigate();
  const { active: view, select: selectView, panelClass: viewPanelClass } = useTabCrossfade<'week' | 'schedule'>('week');
  // Which week the roster page is browsing — defaults to the league's actual
  // current week each time this page is opened, but can be changed freely
  // without affecting league.current_week (used elsewhere for free agency,
  // standings, and stat bonus lock-in).
  const [selectedWeek, setSelectedWeek] = useState(currentWeek);
  const [showWeekMenu, setShowWeekMenu] = useState(false);
  const weekMenuRef = useRef<HTMLDivElement>(null);
  const [showManagerMenu, setShowManagerMenu] = useState(false);
  const managerMenuRef = useRef<HTMLDivElement>(null);
  const [modalTeam, setModalTeam] = useState<RosterEntry | null>(null);
  const [spreadError, setSpreadError] = useState<string | null>(null);
  const [spreadsLoading, setSpreadsLoading] = useState(false);
  const [benchError, setBenchError] = useState<string | null>(null);
  // A swap is click-source-then-click-target: selecting a team on one side
  // (starter/bench) then a team on the other side within the same week
  // completes the swap. Scoped to a single week — the Full Schedule grid
  // shares this handler across columns, so a click in a different week
  // simply restarts the selection there instead of trying to swap across
  // weeks.
  const [swapSource, setSwapSource] = useState<{ week: number; teamId: string; benched: boolean } | null>(null);
  const [gameScoreModal, setGameScoreModal] = useState<{
    game: GameResult; teamId: string; teamName: string; teamLogo: string;
    week: number; isCaptain: boolean;
  } | null>(null);

  // Roster as it stood during the selected week — accounts for free agency
  // swaps, so browsing to a past week shows the teams actually held that
  // week rather than today's roster.
  const weekRoster = useMemo(
    () => rosterAtWeek(viewUserId, selectedWeek, draftPicks, freeAgencyMoves),
    [viewUserId, selectedWeek, draftPicks, freeAgencyMoves]
  );

  // Close the week menu and/or the manager switcher when clicking outside them
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (weekMenuRef.current && !weekMenuRef.current.contains(e.target as Node)) {
        setShowWeekMenu(false);
      }
      if (managerMenuRef.current && !managerMenuRef.current.contains(e.target as Node)) {
        setShowManagerMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const goToManager = (targetUserId: string) => {
    setShowManagerMenu(false);
    navigate(targetUserId === currentUserId ? '/roster' : `/roster/${targetUserId}`);
  };

  // Auto-fetch spreads when feature is on and we don't have data for the selected week
  useEffect(() => {
    if (!scoring.spread_enabled) return;
    if (spreadData[selectedWeek] !== undefined) return;
    setSpreadsLoading(true);
    onRefreshSpreads(selectedWeek).finally(() => setSpreadsLoading(false));
  }, [scoring.spread_enabled, selectedWeek]);

  const currentScore = useMemo(
    () => calcWeeklyScore(member.user_id, selectedWeek, weekRoster, captainPicks, gameData, scoring, spreadPicks, freeAgencyMoves, scoreCorrections, benchPicks),
    [member.user_id, selectedWeek, weekRoster, captainPicks, gameData, scoring, spreadPicks, freeAgencyMoves, scoreCorrections, benchPicks]
  );

  const captainThisWeek = captainPicks.find(
    p => p.user_id === member.user_id && p.week === selectedWeek
  )?.team_id ?? null;

  const getCaptainForWeek = (week: number) =>
    captainPicks.find(p => p.user_id === member.user_id && p.week === week)?.team_id ?? null;

  const isBenchedForWeek = (teamId: string, week: number) =>
    benchPicks.some(p => p.user_id === member.user_id && p.week === week && p.team_id === teamId);

  // First visit to a week with no bench rows yet — seed a valid lineup so
  // the exact-count invariant holds immediately. Only the roster's owner
  // can write their own bench_picks rows (RLS), so this only fires when
  // they're viewing their own roster.
  useEffect(() => {
    if (!isOwner || !scoring.bench_enabled || !onEnsureBenchSeeded) return;
    onEnsureBenchSeeded(selectedWeek, weekRoster.map(e => e.team_id));
  }, [isOwner, scoring.bench_enabled, selectedWeek, weekRoster, onEnsureBenchSeeded]);

  const handleSwapClick = (week: number, teamId: string, benchedFlag: boolean) => {
    if (!onSwapBench) return;
    setBenchError(null);
    setSwapSource(prev => {
      if (!prev || prev.week !== week) return { week, teamId, benched: benchedFlag };
      if (prev.teamId === teamId) return null;
      if (prev.benched === benchedFlag) return { week, teamId, benched: benchedFlag };
      const benchTeamId   = prev.benched ? prev.teamId : teamId;
      const starterTeamId = prev.benched ? teamId : prev.teamId;
      onSwapBench(week, benchTeamId, starterTeamId).then(r => { if (r.error) setBenchError(r.error); });
      return null;
    });
  };

  // Shared by the Starters/Bench grouped grids (bench enabled) and the flat
  // grid (bench disabled) — factored out so bench grouping doesn't require
  // duplicating this large per-team card body.
  const renderCard = (entry: RosterEntry, benchedFlag: boolean) => {
    const game = gameData[entry.team_id]?.[selectedWeek];
    const isCaptain = entry.team_id === captainThisWeek;
    const weekBreak = currentScore.breakdown.find(b => b.team_id === entry.team_id);
    const captainUses = captainUsage.get(entry.team_id) ?? 0;
    const captainKickedOff = isGameKickedOff((game as any)?.start_date);
    // The commissioner advancing current_week past this one locks it too,
    // independent of the game's own kickoff time — a game with a missing
    // or not-yet-set start_date shouldn't stay editable forever just
    // because CFBD hasn't populated it, once the league has moved on.
    const isPastWeek = selectedWeek < currentWeek;
    const canBeCaptain = (captainUses < 2 || isCaptain) && !captainKickedOff && !isPastWeek;
    const oppLogo = (game as any)?.opponent_logo ?? null;
    const isHome  = (game as any)?.is_home  ?? true;
    const gameDateInfo = game ? formatGameDate(game.start_date, game.start_time_tbd) : null;
    const benchKickedOff = isGameKickedOff((game as any)?.start_date);
    const benchSelected = swapSource?.week === selectedWeek && swapSource.teamId === entry.team_id;
    const canSwap = isOwner && !!onSwapBench && !benchKickedOff && !isPastWeek;

    return (
      <div
        key={entry.team_id}
        className={`card relative overflow-hidden p-4 transition-all ${isCaptain ? 'border-gold-500/50 bg-amber-950/20' : ''}`}
      >
        {/* Oversized, faded team logo watermark */}
        {entry.team_logo && (
          <img
            src={entry.team_logo}
            alt=""
            aria-hidden="true"
            className="pointer-events-none select-none absolute top-1/2 -translate-y-1/2 -right-6 w-40 h-40 object-contain opacity-10"
          />
        )}

        <div className="relative z-10">
        {/* Clickable header — opens schedule modal */}
        <div
          className="flex items-start gap-3 cursor-pointer hover:opacity-90 transition-opacity"
          onClick={() => setModalTeam(entry)}
        >
          <TeamLogo src={entry.team_logo} alt={entry.team_name} fallbackName={entry.team_name} size={40} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-white truncate">{entry.team_name}</span>
              {isCaptain && (
                <span className="badge-gold text-xs">
                  <Star className="w-2.5 h-2.5 fill-current" /> Captain
                </span>
              )}
            </div>
            <span className="text-xs text-turf-500">{entry.team_conference}</span>
          </div>
          {weekBreak && weekBreak.points !== 0 && (
            <div className={`font-mono font-bold text-sm flex-shrink-0 ${weekBreak.points > 0 ? 'text-field-400' : 'text-red-300'}`}>
              {weekBreak.points > 0 ? '+' : ''}{weekBreak.points}
            </div>
          )}
        </div>

        {scoring.bench_enabled && (
          <button
            type="button"
            disabled={!canSwap}
            onClick={() => handleSwapClick(selectedWeek, entry.team_id, benchedFlag)}
            className={`mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              benchSelected
                ? 'border-field-500 bg-field-900/30 text-field-300'
                : benchedFlag
                ? 'border-turf-700 text-turf-400'
                : 'border-field-800/50 bg-field-900/10 text-field-400'
            } ${!canSwap ? 'opacity-50 cursor-not-allowed' : 'hover:border-field-600'}`}
          >
            {benchKickedOff || isPastWeek
              ? <Lock className="w-3 h-3 flex-shrink-0" />
              : benchedFlag
              ? <Armchair className="w-3 h-3 flex-shrink-0" />
              : <UserCheck className="w-3 h-3 flex-shrink-0" />}
            {benchKickedOff
              ? (benchedFlag ? 'Benched — locked' : 'Starting — locked')
              : isPastWeek
              ? (benchedFlag ? 'Benched — week advanced' : 'Starting — week advanced')
              : benchSelected
              ? 'Tap the team to swap with'
              : benchedFlag ? 'Benched — tap to swap in' : 'Starting — tap to bench'}
          </button>
        )}

        {game ? (
          <div
            role="button"
            tabIndex={0}
            className="mt-3 w-full text-left group/game cursor-pointer"
            onClick={() => setGameScoreModal({
              game,
              teamId: entry.team_id,
              teamName: entry.team_name,
              teamLogo: entry.team_logo,
              week: selectedWeek,
              isCaptain,
            })}
            onKeyDown={e => { if (e.key === 'Enter') setGameScoreModal({ game, teamId: entry.team_id, teamName: entry.team_name, teamLogo: entry.team_logo, week: selectedWeek, isCaptain }); }}
          >
            <div className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-turf-800/60 transition-colors">
              <div className="flex items-center gap-2 min-w-0">
                <TeamLogo src={oppLogo} alt={game.opponent} fallbackName={game.opponent} size={24} />
                <div className="text-xs text-turf-400 truncate">
                  {game.result ? (
                    <span className="flex items-center gap-1">
                      {game.result === 'W'
                        ? <TrendingUp className="w-3 h-3 text-field-400 flex-shrink-0" />
                        : <TrendingDown className="w-3 h-3 text-red-300 flex-shrink-0" />
                      }
                      <span className={game.result === 'W' ? 'text-field-300' : 'text-red-300'}>
                        {game.result} {isHome ? 'vs' : 'at'} {game.opponent}
                        {game.opponent_rank && <span className="text-turf-500"> (#{game.opponent_rank})</span>}
                      </span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-turf-500">
                      <Minus className="w-3 h-3 flex-shrink-0" />
                      {isHome ? 'vs' : 'at'} {game.opponent} — {gameDateInfo!.date}
                      {gameDateInfo!.time !== 'TBD' ? ` · ${gameDateInfo!.time}` : ''}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {game.home_score != null && game.away_score != null && (
                  <span className="font-mono text-xs text-turf-500">
                    {game.home_score}–{game.away_score}
                  </span>
                )}
                <span className="text-turf-700 group-hover/game:text-turf-500 transition-colors text-xs">↗</span>
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-xs text-turf-500">No game this week</p>
        )}

        {isOwner && onSetCaptain && game && (
          <div className="mt-3 pt-3 border-t border-turf-800/60 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className={`text-xs font-medium flex items-center gap-1 ${isCaptain ? 'text-gold-400' : 'text-turf-300'}`}>
                <Star className="w-3 h-3 flex-shrink-0" /> {isCaptain ? 'Captain ×2' : 'Captain'}
              </span>
              <p className="text-xs text-turf-500">
                {captainKickedOff
                  ? (isCaptain ? 'Game started — locked' : 'Game started')
                  : isPastWeek
                  ? (isCaptain ? 'Week advanced — locked' : 'Week advanced')
                  : isCaptain
                  ? 'Doubles points this week'
                  : canBeCaptain
                  ? `${2 - captainUses} use${2 - captainUses === 1 ? '' : 's'} left`
                  : 'Limit reached'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onSetCaptain(selectedWeek, entry.team_id)}
              disabled={captainKickedOff || isPastWeek || (!canBeCaptain && !isCaptain)}
              aria-label={isCaptain ? 'Remove captain' : 'Set captain'}
              aria-pressed={isCaptain}
              className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${
                isCaptain ? 'bg-gold-500' : canBeCaptain ? 'bg-turf-700' : 'bg-turf-800 opacity-50 cursor-not-allowed'
              }`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${isCaptain ? 'left-5' : 'left-0.5'}`} />
            </button>
          </div>
        )}

        {/* Spread pick — shown when feature is enabled and team has a game */}
        {scoring.spread_enabled && game && (() => {
          const weekSpread = spreadData[selectedWeek]?.[entry.team_id] ?? null;
          const existingPick = spreadPicks.find(
            p => p.team_id === entry.team_id && p.week === selectedWeek
          );
          const teamSeasonUses = spreadUsage.get(entry.team_id) ?? 0;
          const weekPicks = spreadPicks.filter(p => p.week === selectedWeek);
          const atWeekLimit = !existingPick && weekPicks.length >= scoring.spread_max_per_week;
          const atTeamLimit = !existingPick && teamSeasonUses >= scoring.spread_max_per_team;
          const kickedOff = isGameKickedOff((game as any)?.start_date);
          const stackBlocked = !scoring.spread_allow_captain_stack && isCaptain && !existingPick;
          const canPick = isOwner && !!onSetSpread && !atWeekLimit && !atTeamLimit && !kickedOff && !isPastWeek && !stackBlocked && weekSpread !== null;
          const spreadResult = existingPick?.result ?? null;
          const canRemove = !!existingPick && !spreadResult && !kickedOff && !isPastWeek && isOwner && !!onRemoveSpread;
          // Switching cover↔against on an existing pre-result pick reuses
          // onSetSpread's upsert, so it isn't gated by the week/team caps
          // that only apply to making a brand-new pick.
          const canSwitchSide = !!existingPick && !spreadResult && !kickedOff && !isPastWeek && isOwner && !!onSetSpread;
          const isOn = !!existingPick;
          const toggleDisabled = isOn ? !canRemove : !canPick;
          const pickWon = !spreadResult || spreadResult === 'push'
            ? null
            : (existingPick!.side === 'cover' ? spreadResult === 'covered' : spreadResult === 'missed');

          const handleToggle = async () => {
            if (toggleDisabled) return;
            if (isOn) {
              if (onRemoveSpread) await onRemoveSpread(selectedWeek, entry.team_id);
            } else if (onSetSpread && weekSpread !== null) {
              const result = await onSetSpread(selectedWeek, entry.team_id, weekSpread);
              if (result.error) setSpreadError(result.error);
            }
          };

          const handlePickSide = async (side: 'cover' | 'against') => {
            if (existingPick) {
              if (existingPick.side === side) {
                if (!canRemove || !onRemoveSpread) return;
                await onRemoveSpread(selectedWeek, entry.team_id);
              } else {
                if (!canSwitchSide || !onSetSpread || weekSpread === null) return;
                const result = await onSetSpread(selectedWeek, entry.team_id, weekSpread, side);
                if (result.error) setSpreadError(result.error);
              }
            } else {
              if (!canPick || !onSetSpread || weekSpread === null) return;
              const result = await onSetSpread(selectedWeek, entry.team_id, weekSpread, side);
              if (result.error) setSpreadError(result.error);
            }
          };

          let subtext: string;
          if (existingPick) {
            if (spreadResult === 'push') subtext = `Push ${formatSpread(existingPick.locked_spread)}`;
            else if (spreadResult === 'covered' || spreadResult === 'missed') {
              subtext = `${pickWon ? '✓ Won' : '✗ Lost'} ${formatSpread(existingPick.locked_spread)}`;
            } else {
              subtext = `Locked ${formatSpread(existingPick.locked_spread)}${
                scoring.spread_allow_against_pick ? ` · ${existingPick.side === 'against' ? 'Against' : 'Cover'}` : ''
              } · ${teamSeasonUses}/${scoring.spread_max_per_team} season`;
            }
          } else if (spreadsLoading && !weekSpread) {
            subtext = 'Loading line…';
          } else if (weekSpread === null) {
            subtext = 'No line yet';
          } else if (kickedOff) {
            subtext = 'Game in progress';
          } else if (isPastWeek) {
            subtext = 'Week advanced';
          } else if (stackBlocked) {
            subtext = 'Captain stack disabled';
          } else if (atTeamLimit) {
            subtext = `Team limit (${scoring.spread_max_per_team}/season)`;
          } else if (atWeekLimit) {
            subtext = `Week limit (${scoring.spread_max_per_week}/week)`;
          } else {
            subtext = `${formatSpread(weekSpread)} (${weekSpread < 0 ? 'favored' : weekSpread > 0 ? 'underdog' : "pick 'em"}) · ${weekPicks.length}/${scoring.spread_max_per_week} this week`;
          }

          const trackColor = spreadResult === 'push' ? 'bg-turf-500'
            : pickWon === true ? 'bg-field-600'
            : pickWon === false ? 'bg-red-600'
            : isOn ? 'bg-blue-600'
            : 'bg-turf-700';
          const labelColor = spreadResult === 'push' ? 'text-turf-300'
            : pickWon === true ? 'text-field-400'
            : pickWon === false ? 'text-red-300'
            : isOn ? 'text-blue-300'
            : 'text-turf-300';

          return (
            <div className="mt-2 pt-2 border-t border-turf-800/60 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className={`text-xs font-medium flex items-center gap-1 ${labelColor}`}>
                  <Coins className="w-3 h-3 flex-shrink-0" /> Spread
                </span>
                <p className="text-xs text-turf-500 truncate">{subtext}</p>
              </div>
              {scoring.spread_allow_against_pick ? (
                <div className="flex items-center gap-1 flex-shrink-0">
                  {(['cover', 'against'] as const).map(side => {
                    const active = existingPick?.side === side;
                    const disabled = active ? !canRemove : (existingPick ? !canSwitchSide : !canPick);
                    return (
                      <button
                        key={side}
                        type="button"
                        onClick={() => handlePickSide(side)}
                        disabled={disabled}
                        aria-pressed={active}
                        className={`px-2 py-1 rounded text-[10px] font-semibold uppercase tracking-wide transition-colors ${
                          active
                            ? side === 'cover' ? 'bg-field-600 text-white' : 'bg-blue-600 text-white'
                            : 'bg-turf-800 text-turf-400 hover:text-white'
                        } disabled:opacity-40 disabled:cursor-not-allowed`}
                      >
                        {side === 'cover' ? 'Cover' : 'Against'}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleToggle}
                  disabled={toggleDisabled}
                  aria-label={isOn ? 'Remove spread pick' : 'Pick spread'}
                  aria-pressed={isOn}
                  className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${trackColor} ${toggleDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${isOn ? 'left-5' : 'left-0.5'}`} />
                </button>
              )}
            </div>
          );
        })()}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Game Score Breakdown Modal */}
      {gameScoreModal && (
        <GameScoreModal
          game={gameScoreModal.game}
          teamName={gameScoreModal.teamName}
          teamLogo={gameScoreModal.teamLogo}
          week={gameScoreModal.week}
          isCaptain={gameScoreModal.isCaptain}
          scoring={scoring}
          spreadPick={spreadPicks.find(
            p => p.team_id === gameScoreModal.teamId && p.week === gameScoreModal.week
          ) ?? null}
          onClose={() => setGameScoreModal(null)}
        />
      )}

      {/* Schedule Detail Modal */}
      {modalTeam && (
        <ScheduleModal
          team={modalTeam}
          gameData={gameData}
          captainPicks={captainPicks}
          userId={member.user_id}
          currentWeek={currentWeek}
          onClose={() => setModalTeam(null)}
        />
      )}

      <FadeIn className="space-y-5">

        {/* Header */}
        <div className="card p-5 flex items-center justify-between">
          <div className="relative" ref={managerMenuRef}>
            <button
              onClick={() => members.length > 1 && setShowManagerMenu(v => !v)}
              className={`flex items-center gap-3 group rounded-lg -m-1 p-1 transition-colors ${
                members.length > 1 ? 'hover:bg-turf-800' : 'cursor-default'
              }`}
            >
              <Avatar
                displayName={member.display_name}
                avatarType={member.avatar_type}
                avatarValue={member.avatar_value}
                size={40}
                bgClassName="bg-field-500"
                textClassName="text-turf-950"
              />
              <div className="text-left">
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-2xl tracking-wide text-white group-hover:text-field-400 transition-colors">
                    {member.display_name}
                  </h2>
                  {member.role === 'commissioner' && <Shield className="w-4 h-4 text-field-400 flex-shrink-0" />}
                  {members.length > 1 && (
                    <ChevronDown className={`w-4 h-4 text-turf-500 transition-transform flex-shrink-0 ${showManagerMenu ? 'rotate-180' : ''}`} />
                  )}
                </div>
                <p className="text-turf-500 text-sm">{roster.length} teams drafted</p>
              </div>
            </button>

            {showManagerMenu && (
              <div className="absolute top-full left-0 mt-1 w-72 card shadow-xl shadow-black/40 overflow-hidden animate-slide-up z-50 p-1.5 max-h-80 overflow-y-auto">
                {members.map(m => (
                  <button
                    key={m.user_id}
                    onClick={() => goToManager(m.user_id)}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                      m.user_id === viewUserId
                        ? 'bg-field-900/60 text-field-300'
                        : 'text-turf-300 hover:bg-turf-800 hover:text-white'
                    }`}
                  >
                    <Avatar
                      displayName={m.display_name}
                      avatarType={m.avatar_type}
                      avatarValue={m.avatar_value}
                      size={24}
                    />
                    <span className="flex-1 text-left truncate">{m.display_name}</span>
                    {m.user_id === currentUserId && (
                      <span className="text-xs text-field-500 flex-shrink-0">You</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="font-mono text-3xl font-bold text-white">{currentScore.points}</div>
            <div className="text-xs text-turf-500">Week {selectedWeek} pts</div>
          </div>
        </div>

        {/* Weekly history strip */}
        {weeklyScores.filter(w => w.points !== 0).length > 0 && (
          <div className="card p-4">
            <p className="text-xs text-turf-500 mb-3 uppercase tracking-wide font-medium">Weekly History</p>
            <div className="flex gap-1.5 flex-wrap">
              {weeklyScores.map(ws => {
                if (!ws.points && ws.week > currentWeek) return null;
                return (
                  <div
                    key={ws.week}
                    className={`flex flex-col items-center justify-center w-10 h-10 rounded-lg text-xs font-mono ${
                      ws.week === selectedWeek
                        ? 'bg-field-500/20 border border-field-600 text-field-300'
                        : ws.points > 0
                        ? 'bg-turf-800 text-turf-300'
                        : ws.points < 0
                        ? 'bg-red-900/30 text-red-300'
                        : 'bg-turf-900 text-turf-500'
                    }`}
                    title={
                      ws.fa_points !== 0
                        ? `Week ${ws.week}: ${ws.points} pts (includes ${ws.fa_points} portal penalty)`
                        : `Week ${ws.week}: ${ws.points} pts`
                    }
                  >
                    <span className="text-turf-500" style={{ fontSize: 9 }}>W{ws.week}</span>
                    <span className="font-bold">{ws.points}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* View toggle */}
        <div className="flex gap-1 bg-turf-900 p-1 rounded-xl border border-turf-800">
          <div className="relative flex-1" ref={weekMenuRef}>
            <button
              onClick={() => { setShowWeekMenu(v => !v); selectView('week'); }}
              className={`w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all ${
                view === 'week' ? 'bg-field-500 text-turf-950' : 'text-turf-400 hover:text-white'
              }`}
            >
              <List className="w-3.5 h-3.5 flex-shrink-0" />
              {selectedWeek === 0 ? 'Week 0' : `Week ${selectedWeek}`}
              <ChevronDown className={`w-3 h-3 transition-transform ${showWeekMenu ? 'rotate-180' : ''}`} />
            </button>

            {showWeekMenu && (
              <div className="absolute top-full left-0 mt-1 w-40 card shadow-xl shadow-black/40 overflow-hidden animate-slide-up z-50 p-1.5 max-h-72 overflow-y-auto">
                {WEEKS.map(w => (
                  <button
                    key={w}
                    onClick={() => { setSelectedWeek(w); selectView('week'); setShowWeekMenu(false); }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-sm transition-colors ${
                      w === selectedWeek
                        ? 'bg-field-900/60 text-field-400'
                        : 'text-turf-300 hover:bg-turf-800 hover:text-white'
                    }`}
                  >
                    {w === 0 ? 'Week 0' : `Week ${w}`}
                    {w === currentWeek && <span className="text-xs text-turf-500">now</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => selectView('schedule')}
            className={`flex items-center gap-1.5 flex-1 justify-center py-2 rounded-lg text-sm font-medium transition-all ${
              view === 'schedule' ? 'bg-field-500 text-turf-950' : 'text-turf-400 hover:text-white'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" /> Full Schedule
          </button>
        </div>

        {/* ── THIS WEEK VIEW ── */}
        <div className={viewPanelClass('week')}>
          {weekRoster.length === 0 ? (
            <div className="card p-12 text-center text-turf-500">
              <p>{roster.length === 0 ? 'No teams drafted yet' : 'No teams rostered that week'}</p>
              {roster.length === 0 && <TriviaCard className="mt-8" />}
            </div>
          ) : scoring.bench_enabled ? (
            <div className="space-y-4">
              <div>
                <p className="text-xs text-turf-500 uppercase tracking-wide font-medium px-1 mb-2">Starters ({scoring.starters_count})</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {weekRoster.filter(e => !isBenchedForWeek(e.team_id, selectedWeek)).map(entry => renderCard(entry, false))}
                </div>
              </div>
              <div>
                <p className="text-xs text-turf-500 uppercase tracking-wide font-medium px-1 mb-2">Bench ({scoring.bench_count})</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {weekRoster.filter(e => isBenchedForWeek(e.team_id, selectedWeek)).map(entry => renderCard(entry, true))}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {weekRoster.map(entry => renderCard(entry, false))}
            </div>
          )}
        </div>

        {benchError && (
          <div className="card p-3 border-red-800/50 bg-red-950/20 text-xs text-red-300 flex items-center justify-between">
            <span>{benchError}</span>
            <button onClick={() => setBenchError(null)} className="text-red-500 hover:text-red-300 ml-2">✕</button>
          </div>
        )}

        {/* ── FULL SCHEDULE VIEW ── */}
        {scoring.spread_enabled && (
          <div className={`px-1 ${viewPanelClass('schedule')}`}>
            <p className="text-xs text-turf-500 flex items-center gap-1.5">
              <Coins className="w-3.5 h-3.5 flex-shrink-0" />
              Spread picks available — click opponent logo to view scoring, use team row to pick spreads
            </p>
          </div>
        )}

        {spreadError && (
          <div className="card p-3 border-red-800/50 bg-red-950/20 text-xs text-red-300 flex items-center justify-between">
            <span>{spreadError}</span>
            <button onClick={() => setSpreadError(null)} className="text-red-500 hover:text-red-300 ml-2">✕</button>
          </div>
        )}

        <div className={`card overflow-hidden ${viewPanelClass('schedule')}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-turf-800">
                    <th className="px-4 py-3 text-left text-turf-400 font-medium sticky left-0 bg-turf-900 z-10 min-w-44">
                      Team
                    </th>
                    {WEEKS.map(w => (
                      <th
                        key={w}
                        className={`px-2 py-3 text-center font-medium min-w-[4.5rem] ${
                          w === currentWeek ? 'text-field-400' : 'text-turf-500'
                        }`}
                      >
                        {w === currentWeek ? (
                          <span className="flex flex-col items-center gap-0.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-field-400 inline-block" />
                            Wk {w}
                          </span>
                        ) : `Wk ${w}`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-turf-800/50">
                  {roster.map(entry => {
                    const captainUses = captainUsage.get(entry.team_id) ?? 0;
                    return (
                      <tr key={entry.team_id} className="hover:bg-turf-800/20 transition-colors">
                        {/* Team name — sticky left, clickable */}
                        <td className="px-4 py-2.5 sticky left-0 bg-turf-900 z-10 border-r border-turf-800">
                          <Tooltip content="Click to view full schedule" position="right" width="w-44">
                          <button
                            className="flex items-center gap-2 text-left w-full group"
                            onClick={() => setModalTeam(entry)}
                          >
                            <TeamLogo src={entry.team_logo} alt={entry.team_name} fallbackName={entry.team_name} size={24} />
                            <span className="font-medium text-white truncate max-w-28 group-hover:text-field-300 transition-colors">
                              {entry.team_name}
                            </span>
                          </button>
                          </Tooltip>
                          <div className="text-turf-500 mt-0.5 pl-8">
                            {captainUses}/2 captain uses
                          </div>
                        </td>

                        {/* Week cells */}
                        {WEEKS.map(w => {
                          const game     = gameData[entry.team_id]?.[w];
                          const isCap    = getCaptainForWeek(w) === entry.team_id;
                          const isPast   = w < currentWeek;
                          const isCurr   = w === currentWeek;
                          const canSetCap = isOwner && onSetCaptain && !isPast && (captainUses < 2 || isCap);
                          const oppLogo  = (game as any)?.opponent_logo ?? null;
                          const isHome   = (game as any)?.is_home ?? true;

                          let bgColor = '';
                          if (isCap) bgColor = 'bg-amber-900/30';
                          else if (isCurr) bgColor = 'bg-field-900/20';

                          let resultBadge = null;
                          if (game?.result === 'W') {
                            resultBadge = <span className="text-field-400 font-bold text-xs">W</span>;
                          } else if (game?.result === 'L') {
                            resultBadge = <span className="text-red-300 font-bold text-xs">L</span>;
                          }

                          return (
                            <td
                              key={w}
                              className={`px-1 py-2 text-center align-top ${bgColor} ${
                                isCurr ? 'border-x border-field-800/50' : ''
                              }`}
                            >
                              {game ? (
                                <div className="space-y-1 flex flex-col items-center">
                                  {/* Opponent logo — click to open score breakdown */}
                                  <Tooltip
                                    content={`${isHome ? 'vs' : 'at'} ${game.opponent}${game.opponent_rank ? ` (#${game.opponent_rank})` : ''} · Click for scoring details`}
                                    position="bottom"
                                    width="w-44"
                                  >
                                  <button
                                    className="rounded hover:ring-1 hover:ring-field-500/50 transition-all"
                                    onClick={e => {
                                      e.stopPropagation();
                                      const isCaptainThisWeek = getCaptainForWeek(w) === entry.team_id;
                                      setGameScoreModal({
                                        game,
                                        teamId: entry.team_id,
                                        teamName: entry.team_name,
                                        teamLogo: entry.team_logo,
                                        week: w,
                                        isCaptain: isCaptainThisWeek,
                                      });
                                    }}
                                  >
                                    <TeamLogo src={oppLogo} alt={game.opponent} fallbackName={game.opponent} size={28} />
                                  </button>
                                  </Tooltip>

                                  {/* Home/Away indicator + rank */}
                                  <span className="text-turf-500 text-xs leading-none">
                                    {isHome ? 'vs' : '@'}
                                    {game.opponent_rank ? ` #${game.opponent_rank}` : ''}
                                  </span>

                                  {/* Result badge */}
                                  {resultBadge && <div>{resultBadge}</div>}

                                  {/* Score */}
                                  {game.home_score != null && game.away_score != null && (
                                    <div className="text-turf-500 font-mono text-xs">
                                      {game.home_score}–{game.away_score}
                                    </div>
                                  )}

                                  {/* Captain badge — clickable to remove if owner and game not started */}
                                  {isCap && (() => {
                                    const kicked = isGameKickedOff((game as any)?.start_date);
                                    const canRemove = isOwner && onSetCaptain && !kicked && !isPast;
                                    return canRemove ? (
                                      <button
                                        onClick={e => { e.stopPropagation(); onSetCaptain!(w, entry.team_id); }}
                                        className="text-amber-400 font-bold text-xs hover:text-red-300 transition-colors border border-amber-900/40 hover:border-red-800 rounded px-1"
                                        title="Remove captain"
                                      >
                                        ★ ✕
                                      </button>
                                    ) : (
                                      <div className="text-amber-400 font-bold text-xs">★</div>
                                    );
                                  })()}
                                  {canSetCap && !isCap && (
                                    <button
                                      onClick={e => { e.stopPropagation(); onSetCaptain!(w, entry.team_id); }}
                                      className="text-turf-500 hover:text-gold-400 transition-colors text-xs border border-turf-700 hover:border-gold-600 rounded px-1 py-0.5 w-full"
                                    >
                                      + Cap
                                    </button>
                                  )}
                                  {!canSetCap && !isCap && !isPast && (
                                    <div className="text-turf-700 text-xs">max</div>
                                  )}

                                  {/* Spread pick indicator — clickable to remove if owner and game not started.
                                      When against-picks are allowed, a click on an existing cover pick
                                      switches it to against (reusing the same locked line) before a second
                                      click removes it — cycling cover → against → removed. */}
                                  {scoring.spread_enabled && (() => {
                                    const sp = spreadPicks.find(
                                      p => p.team_id === entry.team_id && p.week === w
                                    );
                                    const weekSpread = spreadData[w]?.[entry.team_id] ?? null;
                                    const kicked = isGameKickedOff((game as any)?.start_date);
                                    const teamUses = spreadUsage.get(entry.team_id) ?? 0;
                                    const weekCount = spreadPicks.filter(p => p.week === w).length;
                                    const stackBlocked = !scoring.spread_allow_captain_stack && isCap;
                                    const canPickSpread = isOwner && onSetSpread && !sp && !kicked
                                      && weekCount < scoring.spread_max_per_week
                                      && teamUses < scoring.spread_max_per_team
                                      && !stackBlocked
                                      && weekSpread !== null;
                                    const canRemoveSpread = isOwner && onRemoveSpread && !!sp
                                      && !sp.result && !kicked && !isPast;
                                    const canSwitchSpreadSide = isOwner && onSetSpread && !!sp
                                      && !sp.result && !kicked && !isPast;
                                    const pickWon = !sp?.result || sp.result === 'push'
                                      ? null
                                      : (sp!.side === 'cover' ? sp!.result === 'covered' : sp!.result === 'missed');

                                    if (sp) {
                                      const sidePrefix = scoring.spread_allow_against_pick
                                        ? (sp.side === 'against' ? 'A ' : 'C ')
                                        : '';
                                      const resultGlyph = sp.result === 'push' ? '=' : sp.result === null ? '' : pickWon ? '✓' : '✗';
                                      return (
                                        <div className={`text-xs font-mono mt-0.5 flex items-center gap-0.5 ${
                                          sp.result === 'push' ? 'text-turf-400' :
                                          pickWon === true ? 'text-field-400' :
                                          pickWon === false ? 'text-red-300' : 'text-blue-400'
                                        }`}>
                                          {(scoring.spread_allow_against_pick ? canSwitchSpreadSide : canRemoveSpread) ? (
                                            <button
                                              onClick={e => {
                                                e.stopPropagation();
                                                const action = scoring.spread_allow_against_pick && sp.side === 'cover'
                                                  ? onSetSpread!(w, entry.team_id, sp.locked_spread, 'against')
                                                  : onRemoveSpread!(w, entry.team_id);
                                                action.then(r => {
                                                  if (r.error) setSpreadError(r.error);
                                                });
                                              }}
                                              className="hover:text-red-300 transition-colors border border-current/20 hover:border-red-800 rounded px-0.5 flex items-center gap-0.5"
                                              title={scoring.spread_allow_against_pick && sp.side === 'cover' ? 'Switch to against' : 'Remove spread pick'}
                                            >
                                              <Coins className="w-2.5 h-2.5" />{sidePrefix}{formatSpread(sp.locked_spread)}
                                              {sp.result === null ? ' ✕' : resultGlyph}
                                            </button>
                                          ) : (
                                            <span className="flex items-center gap-0.5">
                                              <Coins className="w-2.5 h-2.5" />{sidePrefix}{formatSpread(sp.locked_spread)}
                                              {resultGlyph}
                                            </span>
                                          )}
                                        </div>
                                      );
                                    }
                                    if (canPickSpread) return (
                                      <button
                                        onClick={e => {
                                          e.stopPropagation();
                                          onSetSpread!(w, entry.team_id, weekSpread!).then(r => {
                                            if (r.error) setSpreadError(r.error);
                                          });
                                        }}
                                        className="text-blue-600 hover:text-blue-400 text-xs transition-colors mt-0.5 border border-blue-900/40 hover:border-blue-700 rounded px-1 flex items-center gap-0.5"
                                      >
                                        <Coins className="w-2.5 h-2.5" />{formatSpread(weekSpread)}
                                      </button>
                                    );
                                    return null;
                                  })()}

                                  {/* Bench/starter indicator — click-to-select, then click a
                                      team in the same week's opposite group to swap. */}
                                  {scoring.bench_enabled && (() => {
                                    const benchedHere = isBenchedForWeek(entry.team_id, w);
                                    const kicked = isGameKickedOff((game as any)?.start_date);
                                    const selected = swapSource?.week === w && swapSource.teamId === entry.team_id;
                                    const canInteract = isOwner && !!onSwapBench && !kicked && !isPast;
                                    return (
                                      <button
                                        type="button"
                                        disabled={!canInteract}
                                        onClick={e => { e.stopPropagation(); handleSwapClick(w, entry.team_id, benchedHere); }}
                                        title={benchedHere ? 'Benched' : 'Starting'}
                                        className={`mt-0.5 text-[10px] font-bold uppercase tracking-wide rounded px-1 border ${
                                          selected
                                            ? 'border-field-500 text-field-300 bg-field-900/40'
                                            : benchedHere
                                            ? 'border-turf-700 text-turf-500'
                                            : 'border-turf-700 text-field-400'
                                        } ${!canInteract ? 'opacity-40 cursor-not-allowed' : 'hover:border-field-600'}`}
                                      >
                                        {benchedHere ? 'BN' : 'ST'}
                                      </button>
                                    );
                                  })()}
                                </div>
                              ) : (
                                <span className="text-turf-700">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Legend */}
            <div className="border-t border-turf-800 px-4 py-3 flex items-center gap-4 text-xs text-turf-500 flex-wrap">
              <span className="flex items-center gap-1"><span className="text-field-400 font-bold">W</span> Win</span>
              <span className="flex items-center gap-1"><span className="text-red-300 font-bold">L</span> Loss</span>
              <span className="flex items-center gap-1"><span className="text-amber-400">★</span> Captain</span>
              {scoring.bench_enabled && (
                <span className="flex items-center gap-1"><span className="text-field-400 font-bold">ST</span>/<span className="text-turf-500 font-bold">BN</span> Starter/Bench — tap to swap</span>
              )}
              <span className="flex items-center gap-1"><span className="text-turf-400">—</span> Bye / no game</span>
              <span className="flex items-center gap-1 text-turf-500">
                Click a team name for full schedule details
              </span>
              <span className="text-turf-500 ml-auto">Scroll right →</span>
            </div>
        </div>
      </FadeIn>
    </>
  );
}
