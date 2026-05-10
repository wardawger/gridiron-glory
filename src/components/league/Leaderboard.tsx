import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, Legend,
} from 'recharts';
import { Crown, TrendingUp, Star } from 'lucide-react';
import type { LeaderboardEntry, DraftPick, APRanking } from '../../types';
import { computeAnalytics, heatColor } from '../../services/analytics';

interface Props {
  entries: LeaderboardEntry[];
  currentWeek: number;
  userId: string;
  confChampComplete: boolean;
  draftPicks: DraftPick[];
  rankings: APRanking[];
}

const PLAYER_COLORS = ['#f59e0b', '#60a5fa', '#a78bfa', '#34d399', '#f87171', '#fb923c'];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-turf-800 border border-turf-600 rounded-lg px-3 py-2 text-sm shadow-lg">
      <p className="font-medium text-white">{label}</p>
      <p className="text-field-400">{payload[0].value} pts</p>
    </div>
  );
};

// ── Sub-component: one analytics table row ────────────────────────────────

interface AnalyticsRowProps {
  label: string;
  tooltip: string;
  values: { display: string; color: string; textColor: string }[];
}

function AnalyticsRow({ label, tooltip, values }: AnalyticsRowProps) {
  return (
    <tr className="hover:bg-turf-800/20 transition-colors group">
      <td className="px-4 py-2.5">
        <span className="text-turf-300 text-xs font-medium" title={tooltip}>{label}</span>
        <span className="text-turf-600 text-xs ml-1 hidden group-hover:inline" title={tooltip}>ⓘ</span>
      </td>
      {values.map((v, i) => (
        <td
          key={i}
          className="px-3 py-2.5 text-center font-mono text-xs font-medium"
          style={{ background: v.color }}
        >
          <span style={{ color: v.display === '—' ? '#495057' : undefined }}>{v.display}</span>
        </td>
      ))}
    </tr>
  );
}

// ── Main component ────────────────────────────────────────────────────────

type AnalyticsTab = 'table' | 'radar' | 'weekly';

export function Leaderboard({ entries, currentWeek, userId, confChampComplete, draftPicks, rankings }: Props) {
  const navigate = useNavigate();
  const [analyticsTab, setAnalyticsTab] = useState<AnalyticsTab>('table');

  const { analytics, undrafted } = useMemo(
    () => computeAnalytics(entries, draftPicks, rankings),
    [entries, draftPicks, rankings]
  );

  const chartData = entries.map(e => ({
    name: e.display_name.split(' ')[0],
    points: e.total_points,
  }));

  // Weekly trend data
  const weeklyData = useMemo(() => {
    const weeks = Array.from({ length: currentWeek + 1 }, (_, i) => i);
    return weeks.map(w => {
      const row: Record<string, any> = { week: `Wk ${w}` };
      entries.forEach(e => {
        row[e.display_name.split(' ')[0]] = e.weekly_scores.find(ws => ws.week === w)?.points ?? 0;
      });
      return row;
    }).filter(row => entries.some(e => (row[e.display_name.split(' ')[0]] ?? 0) !== 0));
  }, [entries, currentWeek]);

  // Radar data
  const radarData = useMemo(() => {
    if (analytics.length === 0) return [];
    const metrics = [
      { key: 'avg_rank',    label: 'Avg Rank',    higherIsBetter: false },
      { key: 'top25_avg',   label: 'Top 25%',     higherIsBetter: false },
      { key: 'best_pick',   label: 'Best Pick',   higherIsBetter: true  },
      { key: 'worst_pick',  label: 'Worst Pick',  higherIsBetter: true  },
      { key: 'over_under',  label: 'Draft Value', higherIsBetter: false },
    ];
    return metrics.map(m => {
      const row: Record<string, any> = { metric: m.label };
      const values = analytics.map(a => {
        if (m.key === 'best_pick')  return a.best_pick?.points ?? 0;
        if (m.key === 'worst_pick') return a.worst_pick?.points ?? 0;
        if (m.key === 'over_under') return a.over_under_pts;
        return (a as any)[m.key] ?? 0;
      });
      const min = Math.min(...values);
      const max = Math.max(...values);
      analytics.forEach((a, i) => {
        const raw = values[i];
        const norm = max === min ? 50 : ((raw - min) / (max - min)) * 100;
        row[a.display_name.split(' ')[0]] = m.higherIsBetter ? norm : 100 - norm;
      });
      return row;
    });
  }, [analytics]);

  // Heat map value arrays
  const avgRankValues   = analytics.map(a => a.avg_rank);
  const top25Values     = analytics.map(a => a.top25_avg);
  const mid50Values     = analytics.map(a => a.mid50_avg);
  const bot25Values     = analytics.map(a => a.bot25_avg);
  const bestPickValues  = analytics.map(a => a.best_pick?.points ?? 0);
  const worstPickValues = analytics.map(a => a.worst_pick?.points ?? 0);
  const ouValues        = analytics.map(a => a.over_under_pts);
  const ouAvgValues     = analytics.map(a => a.over_under_avg);

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Total Points Bar Chart ─────────────────────── */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-title text-xl">Season Standings</h2>
          <span className="badge-gray text-xs">Week {currentWeek}</span>
        </div>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 32, left: 0, bottom: 0 }}>
              <XAxis type="number" hide />
              <YAxis
                type="category" dataKey="name" width={80}
                tick={{ fill: '#6c757d', fontSize: 12, fontFamily: 'DM Sans' }}
                axisLine={false} tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Bar dataKey="points" radius={[0, 4, 4, 0]} maxBarSize={28} label={{ position: 'right', fill: '#6c757d', fontSize: 11 }}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={PLAYER_COLORS[i] ?? '#22c55e'} fillOpacity={i === 0 ? 1 : 0.75} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Standings List ────────────────────────────── */}
      <div className="card divide-y divide-turf-800">
        {entries.map((entry, idx) => {
          const isMe      = entry.user_id === userId;
          const weekScore = entry.weekly_scores.find(w => w.week === currentWeek);
          const lastWeek  = entry.weekly_scores.find(w => w.week === currentWeek - 1);
          const statPts   = (entry as any).stat_points ?? 0;

          return (
            <button
              key={entry.user_id}
              onClick={() => navigate(`/roster/${entry.user_id}`)}
              className={`w-full flex items-center gap-4 px-5 py-4 hover:bg-turf-800/50 transition-colors text-left group ${isMe ? 'bg-field-950/30' : ''}`}
            >
              <div className="w-8 flex-shrink-0 text-center">
                {idx === 0
                  ? <Crown className="w-5 h-5 text-gold-400 mx-auto" />
                  : <span className={`font-mono font-bold text-lg ${idx === 1 ? 'text-slate-400' : idx === 2 ? 'text-amber-700' : 'text-turf-600'}`}>{idx + 1}</span>
                }
              </div>
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${isMe ? 'bg-field-500 text-turf-950' : 'bg-turf-700 text-turf-300'}`}>
                {entry.display_name[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`font-medium truncate ${isMe ? 'text-field-300' : 'text-white'}`}>{entry.display_name}</span>
                  {isMe && <span className="badge-green text-xs">You</span>}
                  {idx === 0 && <Star className="w-3 h-3 text-gold-400 fill-gold-400" />}
                </div>
                <div className="text-xs text-turf-500 flex items-center gap-2 mt-0.5 flex-wrap">
                  <span>{entry.roster.length} teams</span>
                  {entry.bonus_points !== 0 && (
                    <span className="text-amber-500">{entry.bonus_points > 0 ? '+' : ''}{entry.bonus_points} bonus</span>
                  )}
                  {statPts !== 0 && (
                    <span className={statPts > 0 ? 'text-blue-400' : 'text-red-400'}>
                      {statPts > 0 ? '+' : ''}{statPts} stats{!confChampComplete ? ' ◎' : ''}
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
              <div className="text-right flex-shrink-0">
                <div className="font-mono font-bold text-xl text-white group-hover:text-field-400 transition-colors">{entry.total_points}</div>
                <div className="text-xs text-turf-500">{weekScore ? `${weekScore.points > 0 ? '+' : ''}${weekScore.points} wk` : '—'}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Roster Analytics ─────────────────────────── */}
      {analytics.length > 0 && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-turf-800">
            <h2 className="section-title text-xl">Roster Analytics</h2>
            <div className="flex gap-1 bg-turf-800 p-1 rounded-lg">
              {(['table', 'weekly', 'radar'] as const).map(id => (
                <button
                  key={id}
                  onClick={() => setAnalyticsTab(id)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all capitalize ${
                    analyticsTab === id ? 'bg-field-500 text-turf-950' : 'text-turf-400 hover:text-white'
                  }`}
                >
                  {id}
                </button>
              ))}
            </div>
          </div>

          {/* ── TABLE VIEW ── */}
          {analyticsTab === 'table' && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-turf-800">
                    <th className="px-4 py-3 text-left text-xs text-turf-500 uppercase tracking-wide font-medium w-44">Metric</th>
                    {analytics.map((a, i) => (
                      <th key={a.user_id} className="px-3 py-3 text-center text-xs uppercase tracking-wide font-display text-base" style={{ color: PLAYER_COLORS[i] }}>
                        {a.display_name.split(' ')[0]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-turf-800/50">

                  <AnalyticsRow
                    label="Avg AP Rank"
                    tooltip="Average AP ranking of all drafted teams (lower = better)"
                    values={analytics.map((a, i) => ({
                      display: a.avg_rank > 0 ? a.avg_rank.toFixed(1) : '—',
                      color: heatColor(a.avg_rank, avgRankValues.filter(v => v > 0), false),
                      textColor: PLAYER_COLORS[i],
                    }))}
                  />

                  <AnalyticsRow
                    label="Top 25% Rank"
                    tooltip="Average AP rank of your top-quartile teams"
                    values={analytics.map((a, i) => ({
                      display: a.top25_avg > 0 ? a.top25_avg.toFixed(1) : '—',
                      color: heatColor(a.top25_avg, top25Values.filter(v => v > 0), false),
                      textColor: PLAYER_COLORS[i],
                    }))}
                  />

                  <AnalyticsRow
                    label="Middle 50% Rank"
                    tooltip="Average AP rank of your middle-half teams"
                    values={analytics.map((a, i) => ({
                      display: a.mid50_avg > 0 ? a.mid50_avg.toFixed(1) : '—',
                      color: heatColor(a.mid50_avg, mid50Values.filter(v => v > 0), false),
                      textColor: PLAYER_COLORS[i],
                    }))}
                  />

                  <AnalyticsRow
                    label="Bottom 25% Rank"
                    tooltip="Average AP rank of your bottom-quartile teams"
                    values={analytics.map((a, i) => ({
                      display: a.bot25_avg > 0 ? a.bot25_avg.toFixed(1) : '—',
                      color: heatColor(a.bot25_avg, bot25Values.filter(v => v > 0), false),
                      textColor: PLAYER_COLORS[i],
                    }))}
                  />

                  <tr><td colSpan={analytics.length + 1} className="py-1 bg-turf-800/30" /></tr>

                  <AnalyticsRow
                    label="Best Pick"
                    tooltip="Your team with the most total season points"
                    values={analytics.map((a, i) => ({
                      display: a.best_pick
                        ? `${a.best_pick.team_name.split(' ').slice(-1)[0]} (${a.best_pick.points > 0 ? '+' : ''}${a.best_pick.points})`
                        : '—',
                      color: heatColor(a.best_pick?.points ?? 0, bestPickValues, true),
                      textColor: PLAYER_COLORS[i],
                    }))}
                  />

                  <AnalyticsRow
                    label="Worst Pick"
                    tooltip="Your team with the fewest total season points"
                    values={analytics.map((a, i) => ({
                      display: a.worst_pick
                        ? `${a.worst_pick.team_name.split(' ').slice(-1)[0]} (${a.worst_pick.points > 0 ? '+' : ''}${a.worst_pick.points})`
                        : '—',
                      color: heatColor(a.worst_pick?.points ?? 0, worstPickValues, true),
                      textColor: PLAYER_COLORS[i],
                    }))}
                  />

                  <AnalyticsRow
                    label="Best Ranked Team"
                    tooltip="Your highest AP-ranked team"
                    values={analytics.map((a, i) => ({
                      display: a.best_team
                        ? `${a.best_team.team_name.split(' ').slice(-1)[0]} (#${a.best_team.rank})`
                        : '—',
                      color: 'transparent',
                      textColor: PLAYER_COLORS[i],
                    }))}
                  />

                  <AnalyticsRow
                    label="Worst Ranked Team"
                    tooltip="Your lowest AP-ranked team"
                    values={analytics.map((a, i) => ({
                      display: a.worst_team
                        ? `${a.worst_team.team_name.split(' ').slice(-1)[0]} (#${a.worst_team.rank})`
                        : '—',
                      color: 'transparent',
                      textColor: PLAYER_COLORS[i],
                    }))}
                  />

                  <tr><td colSpan={analytics.length + 1} className="py-1 bg-turf-800/30" /></tr>

                  <AnalyticsRow
                    label="Over/Under Draft Pts"
                    tooltip="Sum of (pick number − AP rank). Negative = good value picks."
                    values={analytics.map((a, i) => ({
                      display: `${a.over_under_pts > 0 ? '+' : ''}${a.over_under_pts}`,
                      color: heatColor(a.over_under_pts, ouValues, false),
                      textColor: PLAYER_COLORS[i],
                    }))}
                  />

                  <AnalyticsRow
                    label="Over/Under Avg"
                    tooltip="Average (pick number − AP rank) per ranked team."
                    values={analytics.map((a, i) => ({
                      display: `${a.over_under_avg > 0 ? '+' : ''}${a.over_under_avg}`,
                      color: heatColor(a.over_under_avg, ouAvgValues, false),
                      textColor: PLAYER_COLORS[i],
                    }))}
                  />

                </tbody>
              </table>

              {/* Undrafted top teams */}
              {undrafted.length > 0 && (
                <div className="border-t border-turf-800 px-4 py-4">
                  <p className="text-xs text-turf-500 uppercase tracking-wide font-medium mb-2">
                    Best Available — Not Drafted
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {undrafted.map(t => (
                      <span key={t.team_name} className="badge-gray text-xs">
                        {t.team_name} <span className="text-turf-500">(#{t.rank})</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── WEEKLY VIEW ── */}
          {analyticsTab === 'weekly' && (
            <div className="p-5">
              <p className="text-xs text-turf-500 mb-4">Points scored per week by each player</p>
              {weeklyData.length === 0 ? (
                <p className="text-turf-600 text-sm text-center py-8">No weekly data yet — check back once games are played</p>
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={weeklyData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <XAxis dataKey="week" tick={{ fill: '#6c757d', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#6c757d', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ background: '#21262d', border: '1px solid #30363d', borderRadius: 8, fontSize: 12 }}
                        labelStyle={{ color: '#fff', marginBottom: 4 }}
                        itemStyle={{ color: '#adb5bd' }}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
                        formatter={(value) => <span style={{ color: '#adb5bd' }}>{value}</span>}
                      />
                      {entries.map((e, i) => (
                        <Bar
                          key={e.user_id}
                          dataKey={e.display_name.split(' ')[0]}
                          fill={PLAYER_COLORS[i] ?? '#22c55e'}
                          fillOpacity={0.85}
                          radius={[3, 3, 0, 0]}
                          maxBarSize={24}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* ── RADAR VIEW ── */}
          {analyticsTab === 'radar' && (
            <div className="p-5">
              <p className="text-xs text-turf-500 mb-4">Normalized roster quality across 5 dimensions (higher = better)</p>
              {radarData.length === 0 ? (
                <p className="text-turf-600 text-sm text-center py-8">No ranking data yet</p>
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData} margin={{ top: 8, right: 24, left: 24, bottom: 8 }}>
                      <PolarGrid stroke="#30363d" />
                      <PolarAngleAxis dataKey="metric" tick={{ fill: '#6c757d', fontSize: 11 }} />
                      <Legend
                        wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                        formatter={(value) => <span style={{ color: '#adb5bd' }}>{value}</span>}
                      />
                      {entries.map((e, i) => (
                        <Radar
                          key={e.user_id}
                          name={e.display_name.split(' ')[0]}
                          dataKey={e.display_name.split(' ')[0]}
                          stroke={PLAYER_COLORS[i] ?? '#22c55e'}
                          fill={PLAYER_COLORS[i] ?? '#22c55e'}
                          fillOpacity={0.12}
                          strokeWidth={2}
                        />
                      ))}
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
