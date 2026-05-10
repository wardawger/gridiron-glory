import { useMemo, useState } from 'react';
import { Shield, TrendingUp, TrendingDown, Minus, Star, Calendar, List } from 'lucide-react';
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

export function RosterView({
  member, roster, captainPicks, gameData, scoring,
  currentWeek, weeklyScores, isOwner, onSetCaptain, captainUsage,
}: Props) {
  const [view, setView] = useState<'week' | 'schedule'>('week');

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

              return (
                <div
                  key={entry.team_id}
                  className={`card p-4 transition-all ${isCaptain ? 'border-gold-500/50 bg-amber-950/20' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <img
                      src={entry.team_logo}
                      alt={entry.team_name}
                      className="w-10 h-10 object-contain rounded flex-shrink-0"
                      onError={e => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(entry.team_name)}&background=166534&color=fff`; }}
                    />
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
                      <div className={`font-mono font-bold text-sm flex-shrink-0 ${weekBreak.points > 0 ? 'text-field-400' : 'text-red-400'}`}>
                        {weekBreak.points > 0 ? '+' : ''}{weekBreak.points}
                      </div>
                    )}
                  </div>

                  {game ? (
                    <div className="mt-3 flex items-center justify-between">
                      <div className="text-xs text-turf-400">
                        {game.result ? (
                          <span className="flex items-center gap-1">
                            {game.result === 'W'
                              ? <TrendingUp className="w-3 h-3 text-field-400" />
                              : <TrendingDown className="w-3 h-3 text-red-400" />
                            }
                            <span className={game.result === 'W' ? 'text-field-300' : 'text-red-300'}>
                              {game.result} vs {game.opponent}
                              {game.opponent_rank && <span className="text-turf-500"> (#{game.opponent_rank})</span>}
                            </span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-turf-500">
                            <Minus className="w-3 h-3" />
                            vs {game.opponent} — TBD
                          </span>
                        )}
                      </div>
                      {game.home_score != null && game.away_score != null && (
                        <span className="font-mono text-xs text-turf-500">
                          {game.home_score}–{game.away_score}
                        </span>
                      )}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-turf-600">No game this week</p>
                  )}

                  {isOwner && onSetCaptain && (
                    <button
                      onClick={() => onSetCaptain(currentWeek, entry.team_id)}
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
                  <th className="px-4 py-3 text-left text-turf-400 font-medium sticky left-0 bg-turf-900 z-10 min-w-36">
                    Team
                  </th>
                  {WEEKS.map(w => (
                    <th
                      key={w}
                      className={`px-2 py-3 text-center font-medium min-w-20 ${
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
                      {/* Team name — sticky left */}
                      <td className="px-4 py-2.5 sticky left-0 bg-turf-900 z-10 border-r border-turf-800">
                        <div className="flex items-center gap-2">
                          <img
                            src={entry.team_logo}
                            alt={entry.team_name}
                            className="w-5 h-5 object-contain flex-shrink-0"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                          <span className="font-medium text-white truncate max-w-28">{entry.team_name}</span>
                        </div>
                        <div className="text-turf-600 mt-0.5 pl-7">
                          {captainUses}/2 captain uses
                        </div>
                      </td>
