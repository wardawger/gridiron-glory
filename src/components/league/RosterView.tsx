import { useMemo, useState } from 'react';
import { Shield, TrendingUp, TrendingDown, Minus, Star, Calendar, List, X, MapPin, Tv, Clock } from 'lucide-react';
import type { RosterEntry, CaptainPick, GameData, ScoringSettings, LeagueMember, WeeklyScore } from '../../types';
import { calcWeeklyScore } from '../../services/scoring';

interface Props {
  member: LeagueMember;
  roster: RosterEntry[];
  captainPicks: CaptainPick[];
  gameData: GameData;
  scoring: ScoringSettings;
  currentWeek: number;
  weeklyScores: WeeklyScore[];
  isOwner: boolean;
  onSetCaptain?: (week: number, teamId: string) => void;
  captainUsage: Map<string, number>;
}

const WEEKS = Array.from({ length: 16 }, (_, i) => i); // weeks 0–15

// Default logo when a team logo URL fails to load or is missing
function teamLogoFallback(name: string): string {
  const initials = name
    .replace(/[^a-zA-Z ]/g, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase() || '?';
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=052e16&color=4ade80&bold=true&size=80&font-size=0.45`;
}

// Format a startDate ISO string into readable date + time
function formatGameDate(startDate: string | null | undefined): { date: string; time: string } {
  if (!startDate) return { date: 'TBD', time: 'TBD' };
  const d = new Date(startDate);
  const date = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const time = d.getMinutes() === 0 && d.getHours() === 0
    ? 'TBD'
    : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  return { date, time };
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
  const byes  = WEEKS.filter(w => !teamGames[w] && w >= 1 && w <= 15);

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
          <img
            src={team.team_logo}
            alt={team.team_name}
            className="h-12 w-12 object-contain"
            onError={e => { (e.target as HTMLImageElement).src = teamLogoFallback(team.team_name); }}
          />
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-xl font-bold text-white tracking-wide">{team.team_name}</h2>
            <p className="text-sm text-turf-400">{team.team_conference} · 2026 Schedule</p>
          </div>
          <button
            onClick={onClose}
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
            const { date, time } = formatGameDate((game as any).start_date);
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
                <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 mt-0.5">
                  <img
                    src={oppLogo ?? teamLogoFallback(game.opponent)}
                    alt={game.opponent}
                    className="w-10 h-10 object-contain"
                    onError={e => { (e.target as HTMLImageElement).src = teamLogoFallback(game.opponent); }}
                  />
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
                        game.result === 'W' ? 'bg-field-900/40 text-field-400' : 'bg-red-900/40 text-red-400'
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
              <p className="text-xs text-turf-600">
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
  member, roster, captainPicks, gameData, scoring,
  currentWeek, weeklyScores, isOwner, onSetCaptain, captainUsage,
}: Props) {
  const [view, setView] = useState<'week' | 'schedule'>('week');
  const [modalTeam, setModalTeam] = useState<RosterEntry | null>(null);

  const currentScore = useMemo(
    () => calcWeeklyScore(member.user_id, currentWeek, roster, captainPicks, gameData, scoring),
    [member.user_id, currentWeek, roster, captainPicks, gameData, scoring]
  );

  const captainThisWeek = captainPicks.find(
    p => p.user_id === member.user_id && p.week === currentWeek
  )?.team_id ?? null;

  const getCaptainForWeek = (week: number) =>
    captainPicks.find(p => p.user_id === member.user_id && p.week === week)?.team_id ?? null;

  return (
    <>
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

      <div className="space-y-5 animate-fade-in">

        {/* Header */}
        <div className="card p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-field-500 flex items-center justify-center text-turf-950 font-bold text-lg">
              {member.display_name[0].toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-2xl tracking-wide text-white">{member.display_name}</h2>
                {member.role === 'commissioner' && <Shield className="w-4 h-4 text-field-400" />}
              </div>
              <p className="text-turf-500 text-sm">{roster.length} teams drafted</p>
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-3xl font-bold text-white">{currentScore.points}</div>
            <div className="text-xs text-turf-500">Week {currentWeek} pts</div>
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
                      ws.week === currentWeek
                        ? 'bg-field-500/20 border border-field-600 text-field-300'
                        : ws.points > 0
                        ? 'bg-turf-800 text-turf-300'
                        : ws.points < 0
                        ? 'bg-red-900/30 text-red-400'
                        : 'bg-turf-900 text-turf-600'
                    }`}
                    title={`Week ${ws.week}: ${ws.points} pts`}
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
          <button
            onClick={() => setView('week')}
            className={`flex items-center gap-1.5 flex-1 justify-center py-2 rounded-lg text-sm font-medium transition-all ${
              view === 'week' ? 'bg-field-500 text-turf-950' : 'text-turf-400 hover:text-white'
            }`}
          >
            <List className="w-3.5 h-3.5" /> This Week
          </button>
          <button
            onClick={() => setView('schedule')}
            className={`flex items-center gap-1.5 flex-1 justify-center py-2 rounded-lg text-sm font-medium transition-all ${
              view === 'schedule' ? 'bg-field-500 text-turf-950' : 'text-turf-400 hover:text-white'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" /> Full Schedule
          </button>
        </div>

        {/* ── THIS WEEK VIEW ── */}
        {view === 'week' && (
          roster.length === 0 ? (
            <div className="card p-12 text-center text-turf-500">
              <p>No teams drafted yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {roster.map(entry => {
                const game = gameData[entry.team_id]?.[currentWeek];
                const isCaptain = entry.team_id === captainThisWeek;
                const weekBreak = currentScore.breakdown.find(b => b.team_id === entry.team_id);
                const captainUses = captainUsage.get(entry.team_id) ?? 0;
                const canBeCaptain = captainUses < 2 || isCaptain;
                const oppLogo = (game as any)?.opponent_logo ?? null;
                const isHome  = (game as any)?.is_home  ?? true;

                return (
                  <div
                    key={entry.team_id}
                    className={`card p-4 transition-all cursor-pointer hover:border-turf-600 ${isCaptain ? 'border-gold-500/50 bg-amber-950/20' : ''}`}
                    onClick={() => setModalTeam(entry)}
                    title="View full schedule"
                  >
                    <div className="flex items-start gap-3">
                      <img
                        src={entry.team_logo}
                        alt={entry.team_name}
                        className="w-10 h-10 object-contain rounded flex-shrink-0"
                        onError={e => { (e.target as HTMLImageElement).src = teamLogoFallback(entry.team_name); }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white truncate group-hover:text-field-300">{entry.team_name}</span>
                          {isCaptain && (
                            <span className="badge-gold text-xs">
                              <Star className="w-2.5 h-2.5 fill-current" /> Captain
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-turf-500">{entry.team_conference}</span>
                      </div>
                      {weekBreak && weekBreak.points !== 0 && (
                        <div className={`font-mono font-bold text-sm flex-shrink-0 ${weekBreak.points > 0 ? 'text-field-400' : 'text-red-400'}`}>
                          {weekBreak.points > 0 ? '+' : ''}{weekBreak.points}
                        </div>
                      )}
                    </div>

                    {game ? (
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <img
                            src={oppLogo ?? teamLogoFallback(game.opponent)}
                            alt={game.opponent}
                            className="w-6 h-6 object-contain flex-shrink-0"
                            onError={e => { (e.target as HTMLImageElement).src = teamLogoFallback(game.opponent); }}
                          />
                          <div className="text-xs text-turf-400 truncate">
                            {game.result ? (
                              <span className="flex items-center gap-1">
                                {game.result === 'W'
                                  ? <TrendingUp className="w-3 h-3 text-field-400 flex-shrink-0" />
                                  : <TrendingDown className="w-3 h-3 text-red-400 flex-shrink-0" />
                                }
                                <span className={game.result === 'W' ? 'text-field-300' : 'text-red-300'}>
                                  {game.result} {isHome ? 'vs' : 'at'} {game.opponent}
                                  {game.opponent_rank && <span className="text-turf-500"> (#{game.opponent_rank})</span>}
                                </span>
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-turf-500">
                                <Minus className="w-3 h-3 flex-shrink-0" />
                                {isHome ? 'vs' : 'at'} {game.opponent} — TBD
                              </span>
                            )}
                          </div>
                        </div>
                        {game.home_score != null && game.away_score != null && (
                          <span className="font-mono text-xs text-turf-500 flex-shrink-0">
                            {game.home_score}–{game.away_score}
                          </span>
                        )}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-turf-600">No game this week</p>
                    )}

                    {isOwner && onSetCaptain && (
                      <button
                        onClick={e => { e.stopPropagation(); onSetCaptain(currentWeek, entry.team_id); }}
                        disabled={!canBeCaptain && !isCaptain}
                        className={`mt-3 w-full text-xs py-1.5 rounded-md transition-all border ${
                          isCaptain
                            ? 'bg-amber-900/40 border-amber-700 text-amber-300'
                            : canBeCaptain
                            ? 'border-turf-600 text-turf-400 hover:border-gold-500 hover:text-gold-400'
                            : 'border-turf-800 text-turf-700 cursor-not-allowed'
                        }`}
                      >
                        {isCaptain
                          ? '★ Remove Captain'
                          : canBeCaptain
                          ? `Set Captain (${2 - captainUses} uses left)`
                          : 'Captain limit reached'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* ── FULL SCHEDULE VIEW ── */}
        {view === 'schedule' && (
          <div className="card overflow-hidden">
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
                          <button
                            className="flex items-center gap-2 text-left w-full group"
                            onClick={() => setModalTeam(entry)}
                            title="View full schedule"
                          >
                            <img
                              src={entry.team_logo}
                              alt={entry.team_name}
                              className="w-6 h-6 object-contain flex-shrink-0"
                              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                            <span className="font-medium text-white truncate max-w-28 group-hover:text-field-300 transition-colors">
                              {entry.team_name}
                            </span>
                          </button>
                          <div className="text-turf-600 mt-0.5 pl-8">
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
                            resultBadge = <span className="text-red-400 font-bold text-xs">L</span>;
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
                                  {/* Opponent logo */}
                                  <img
                                    src={oppLogo ?? teamLogoFallback(game.opponent)}
                                    alt={game.opponent}
                                    className="w-7 h-7 object-contain"
                                    title={`${isHome ? 'vs' : 'at'} ${game.opponent}${game.opponent_rank ? ` (#${game.opponent_rank})` : ''}`}
                                    onError={e => { (e.target as HTMLImageElement).src = teamLogoFallback(game.opponent); }}
                                  />

                                  {/* Home/Away indicator + rank */}
                                  <span className="text-turf-600 text-xs leading-none">
                                    {isHome ? 'vs' : '@'}
                                    {game.opponent_rank ? ` #${game.opponent_rank}` : ''}
                                  </span>

                                  {/* Result badge */}
                                  {resultBadge && <div>{resultBadge}</div>}

                                  {/* Score */}
                                  {game.home_score != null && game.away_score != null && (
                                    <div className="text-turf-600 font-mono text-xs">
                                      {game.home_score}–{game.away_score}
                                    </div>
                                  )}

                                  {/* Captain badge / button */}
                                  {isCap && (
                                    <div className="text-amber-400 font-bold text-xs">★</div>
                                  )}
                                  {canSetCap && !isCap && (
                                    <button
                                      onClick={() => onSetCaptain!(w, entry.team_id)}
                                      className="text-turf-600 hover:text-gold-400 transition-colors text-xs border border-turf-700 hover:border-gold-600 rounded px-1 py-0.5 w-full"
                                    >
                                      + Cap
                                    </button>
                                  )}
                                  {!canSetCap && !isCap && !isPast && (
                                    <div className="text-turf-700 text-xs">max</div>
                                  )}
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
              <span className="flex items-center gap-1"><span className="text-red-400 font-bold">L</span> Loss</span>
              <span className="flex items-center gap-1"><span className="text-amber-400">★</span> Captain</span>
              <span className="flex items-center gap-1"><span className="text-turf-400">—</span> Bye / no game</span>
              <span className="flex items-center gap-1 text-turf-600">
                Click a team name for full schedule details
              </span>
              <span className="text-turf-600 ml-auto">Scroll right →</span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
