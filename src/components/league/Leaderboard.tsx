import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Crown, TrendingUp, Star, ChartBar } from 'lucide-react';
import type { LeaderboardEntry } from '../../types';

const STAT_LABELS: Record<string, string> = {
  qbr:           'QBR',
  rushing_tds:   'Rushing TDs',
  receiving_tds: 'Receiving TDs',
  def_ints:      'INTs (Def)',
  sacks:         'Sacks',
};

interface Props {
  entries: LeaderboardEntry[];
  currentWeek: number;
  userId: string;
  confChampComplete: boolean;
}

const PODIUM_COLORS = ['#f59e0b', '#94a3b8', '#b45309'];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-turf-800 border border-turf-600 rounded-lg px-3 py-2 text-sm shadow-lg">
      <p className="font-medium text-white">{label}</p>
      <p className="text-field-400">{payload[0].value} pts</p>
    </div>
  );
};

export function Leaderboard({ entries, currentWeek, userId, confChampComplete }: Props) {
  const navigate = useNavigate();

  const chartData = entries.map(e => ({
    name: e.display_name.split(' ')[0],
    points: e.total_points,
  }));

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Chart */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-title text-xl">Season Standings</h2>
          <span className="badge-gray text-xs">Week {currentWeek}</span>
        </div>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 24, left: 0, bottom: 0 }}>
              <XAxis type="number" hide />
              <YAxis
                type="category" dataKey="name" width={80}
                tick={{ fill: '#6c757d', fontSize: 12, fontFamily: 'DM Sans' }}
                axisLine={false} tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Bar dataKey="points" radius={[0, 4, 4, 0]} maxBarSize={28}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={PODIUM_COLORS[i] ?? '#22c55e'} fillOpacity={i === 0 ? 1 : 0.7} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Rankings list */}
      <div className="card divide-y divide-turf-800">
        {entries.map((entry, idx) => {
          const isMe = entry.user_id === userId;
          const weekScore = entry.weekly_scores.find(w => w.week === currentWeek);
          const lastWeek  = entry.weekly_scores.find(w => w.week === currentWeek - 1);
          const hasStatBonuses = entry.stat_bonuses.length > 0;

          return (
            <div key={entry.user_id}>
              <button
                onClick={() => navigate(`/roster/${entry.user_id}`)}
                className={`w-full flex items-center gap-4 px-5 py-4 hover:bg-turf-800/50 transition-colors text-left group ${
                  isMe ? 'bg-field-950/30' : ''
                }`}
              >
                {/* Rank */}
                <div className="w-8 flex-shrink-0 text-center">
                  {idx === 0
                    ? <Crown className="w-5 h-5 text-gold-400 mx-auto" />
                    : <span className={`font-mono font-bold text-lg ${
                        idx === 1 ? 'text-slate-400' : idx === 2 ? 'text-amber-700' : 'text-turf-600'
                      }`}>{idx + 1}</span>
                  }
                </div>

                {/* Avatar */}
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                  isMe ? 'bg-field-500 text-turf-950' : 'bg-turf-700 text-turf-300'
                }`}>
                  {entry.display_name[0].toUpperCase()}
                </div>

                {/* Name + badges */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-medium truncate ${isMe ? 'text-field-300' : 'text-white'}`}>
                      {entry.display_name}
                    </span>
                    {isMe && <span className="badge-green text-xs">You</span>}
                    {idx === 0 && <Star className="w-3 h-3 text-gold-400 fill-gold-400" />}
                  </div>
                  <div className="text-xs text-turf-500 flex items-center gap-2 mt-0.5 flex-wrap">
                    <span>{entry.roster.length} teams</span>
                    {entry.bonus_points !== 0 && (
                      <span className="text-amber-500">{entry.bonus_points > 0 ? '+' : ''}{entry.bonus_points} bonus</span>
                    )}
                    {entry.stat_points !== 0 && (
                      <span className={entry.stat_points > 0 ? 'text-blue-400' : 'text-red-400'}>
                        {entry.stat_points > 0 ? '+' : ''}{entry.stat_points} stats{!confChampComplete ? ' (preview)' : ''}
                      </span>
                    )}
                    {lastWeek && lastWeek.points !== 0 && (
                      <span className="flex items-center gap-0.5">
                        <TrendingUp className="w-3 h-3" />
                        {lastWeek.points > 0 ? '+' : ''}{lastWeek.points} last wk
                      </span>
                    )}
                  </div>
                </div>

                {/* Score */}
                <div className="text-right flex-shrink-0">
                  <div className="font-mono font-bold text-xl text-white group-hover:text-field-400 transition-colors">
                    {entry.total_points}
                  </div>
                  <div className="text-xs text-turf-500">
                    {weekScore ? `${weekScore.points > 0 ? '+' : ''}${weekScore.points} wk` : '—'}
                  </div>
                </div>
              </button>

              {/* Stat bonus breakdown — expandable inline */}
              {hasStatBonuses && (
                <div className="px-5 pb-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-1.5">
                  {entry.stat_bonuses.map((b, i) => (
                    <div
                      key={i}
                      className={`flex items-center justify-between px-2 py-1 rounded text-xs ${
                        b.points > 0
                          ? 'bg-blue-900/30 border border-blue-800/40 text-blue-300'
                          : 'bg-red-900/30 border border-red-800/40 text-red-300'
                      }`}
                    >
                      <span className="truncate text-turf-400 mr-1">{b.team_name.split(' ').slice(-1)[0]}</span>
                      <span className="font-mono flex-shrink-0">
                        {STAT_LABELS[b.stat]} #{b.rank} {b.points > 0 ? '+' : ''}{b.points}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
