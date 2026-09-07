import { X, TrendingUp, TrendingDown, Calendar, MapPin, Tv, Coins, Zap } from 'lucide-react';
import type { GameResult, ScoringSettings, SpreadPick } from '../../types';
import { scoreGame, getSpreadOutcome, scoreSpread } from '../../services/scoring';
import { TeamLogo } from '../ui/TeamLogo';
import { WeatherBadge } from '../ui/WeatherBadge';
import { useDialog } from '../../hooks/useDialog';
import { formatGameDate } from '../../lib/formatGameDate';

function formatSpread(spread: number | null | undefined): string {
  if (spread == null) return 'N/A';
  if (spread === 0) return 'EVEN';
  return spread > 0 ? `+${spread}` : `${spread}`;
}

interface GameScoreModalProps {
  game: GameResult;
  teamName: string;
  teamLogo: string;
  // Current AP rank of the rostered team, or null when unranked. The
  // opponent's comes off the game row itself (ranked as of that week).
  teamRank?: number | null;
  week: number;
  isCaptain: boolean;
  scoring: ScoringSettings;
  spreadPick: SpreadPick | null;
  onClose: () => void;
}

// Shared by RosterView (clicking a rostered team) and ScoreboardPage
// (clicking a team's detail icon) — one modal, so both surfaces can never
// disagree about what a team's week actually scored.
export function GameScoreModal({ game, teamName, teamLogo, teamRank = null, week, isCaptain, scoring, spreadPick, onClose }: GameScoreModalProps) {
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
      lines.push({ label: 'Loss to G6',             pts: scoring.loss_g6,   active: game.is_g6_opponent,               color: 'text-red-300' });
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
  const panelRef = useDialog(onClose);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Week ${week}: ${teamName} ${isHome ? 'vs' : 'at'} ${game.opponent} scoring details`}
        tabIndex={-1}
        className="relative w-full max-w-sm rounded-2xl border border-turf-700 bg-turf-950 shadow-2xl focus:outline-none"
        onClick={e => e.stopPropagation()}
      >
        {/* Header — scoreboard: logo + score per side */}
        <div className="relative border-b border-turf-800 px-5 py-5">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3 right-3 rounded-lg border border-turf-700 p-1.5 text-turf-400 hover:border-turf-500 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-field-400"
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
              <span className="text-xs text-turf-400 text-center leading-tight max-w-24 truncate">
                {teamRank ? `#${teamRank} ` : ''}{teamName}
              </span>
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
