import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, Legend,
  LineChart, Line, ScatterChart, Scatter,
} from 'recharts';
import { Crown, TrendingUp, Star } from 'lucide-react';
import type { LeaderboardEntry, DraftPick, APRanking } from '../../types';
import { computeAnalytics, heatColor } from '../../services/analytics';
import { Avatar } from '../ui/Avatar';

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
    <div className="bg-turf-900 border border-turf-700 rounded-lg px-3 py-2 text-sm shadow-xl shadow-black/40">
      <p className="font-medium text-white mb-1">{label}</p>
      <p className="text-field-400 font-mono">{payload[0].value} pts</p>
    </div>
  );
};

const ScatterTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="bg-turf-900 border border-turf-700 rounded-lg px-3 py-2 text-sm shadow-xl shadow-black/40">
      <p className="font-medium text-white mb-1">{p.team_name}</p>
      <p className="text-turf-400 text-xs">{p.display_name.split(' ')[0]}</p>
      <p className="text-turf-300 font-mono text-xs mt-1">Pick #{p.pick_number} · AP #{p.rank}</p>
    </div>
  );
};

// ── Metric tooltip ────────────────────────────────────────────────────────

interface MetricTooltipProps {
  label: string;
  tooltip: string;
}

function MetricLabel({ label, tooltip }: MetricTooltipProps) {
  const [show, setShow] = useState(false);

  return (
    <div
      className="relative inline-flex items-center gap-1.5 cursor-default select-none"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span className="text-turf-300 text-xs font-medium">{label}</span>
      <span className="w-3.5 h-3.5 rounded-full bg-turf-700 text-turf-400 text-xs flex items-center justify-center flex-shrink-0 hover:bg-turf-600 hover:text-white transition-colors cursor-default">
        i
      </span>
      {show && (
        <div className="absolute left-0 top-full mt-1.5 z-50 w-56 pointer-events-none">
          <div className="bg-turf-800 border border-turf-600 rounded-lg px-3 py-2.5 shadow-xl shadow-black/50">
            <p className="text-xs text-turf-200 leading-relaxed">{tooltip}</p>
          </div>
          {/* Arrow */}
          <div className="absolute -top-1 left-3 w-2 h-2 bg-turf-800 border-l border-t border-turf-600 rotate-45" />
        </div>
      )}
    </div>
  );
}

// ── Sub-component: one analytics table row ────────────────────────────────

interface AnalyticsRowProps {
  label: string;
  tooltip: string;
  values: { display: string; color: string; textColor: string }[];
}

function AnalyticsRow({ label, tooltip, values }: AnalyticsRowProps) {
  return (
    <tr className="hover:bg-turf-800/20 transition-colors">
      <td className="px-4 py-2.5">
        <MetricLabel label={label} tooltip={tooltip} />
      </td>
      {values.map((v, i) => (
        <td
          key={i}
          className="px-3 py-2.5 text-center font-mono text-xs font-medium select-none"
          style={{ background: v.color }}
        >
          <span
            className="cursor-default"
            style={{ color: v.display === '—' ? '#495057' : undefined }}
          >
            {v.display}
          </span>
        </td>
      ))}
    </tr>
  );
}

// ── Main component ────────────────────────────────────────────────────────

type AnalyticsTab = 'table' | 'graphs' | 'weekly';

export function Leaderboard({ entries, currentWeek, userId, confChampComplete, draftPicks, rankings }: Props) {
  const navigate = useNavigate();
  const [analyticsTab, setAnalyticsTab] = useState<AnalyticsTab>('table');

  const { analytics, undrafted, scatterPoints } = useMemo(
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
      { key: 'avg_rank',   label: 'Avg Rank',    higherIsBetter: false },
      { key: 'top25_avg',  label: 'Top 25%',     higherIsBetter: false },
      { key: 'best_pick',  label: 'Best Pick',   higherIsBetter: true  },
      { key: 'worst_pick', label: 'Worst Pick',  higherIsBetter: true  },
      { key: 'over_under', label: 'Draft Value', higherIsBetter: false },
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

  // Season trend — cumulative points per manager across weeks
  const trendData = useMemo(() => {
    const weeks = Array.from({ length: currentWeek + 1 }, (_, i) => i);
    const running: Record<string, number> = {};
    entries.forEach(e => { running[e.display_name.split(' ')[0]] = 0; });
    return weeks.map(w => {
      const row: Record<string, any> = { week: `Wk ${w}` };
      entries.forEach(e => {
        const name = e.display_name.split(' ')[0];
        running[name] += e.weekly_scores.find(ws => ws.week === w)?.points ?? 0;
        row[name] = running[name];
      });
      return row;
    });
  }, [entries, currentWeek]);

  // Draft value scatter — one series per manager so each gets its own color/legend entry
  const scatterByManager = useMemo(() => {
    return entries.map((e, i) => ({
      name: e.display_name.split(' ')[0],
      color: PLAYER_COLORS[i] ?? '#22c55e',
      data: scatterPoints.filter(p => p.user_id === e.user_id),
    })).filter(m => m.data.length > 0);
  }, [entries, scatterPoints]);

  // Heat map value arrays
  const avgRankValues   = analytics.map(a => a.avg_rank);
  const top25Values     = analytics.map(a => a.top25_avg);
  const bot25Values     = analytics.map(a => a.bot25_avg);
  const bestPickValues  = analytics.map(a => a.best_pick?.points ?? 0);
  const worstPickValues = analytics.map(a => a.worst_pick?.points ?? 0);
  const ouValues        = analytics.map(a => a.over_under_pts);
  const ouAvgValues     = analytics.map(a => a.over_under_avg);
  const recordValues    = analytics.map(a => a.wins - a.losses);
  const captainEffValues = analytics.map(a => a.captain_efficiency ?? 0);

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
                type="category" dataKey="name" width={90}
                tick={{ fill: '#6c757d', fontSize: 12, fontFamily: 'DM Sans' }}
                axisLine={false} tickLine={false}
              />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ fill: 'rgba(255,255,255,0.03)' }}
              />
              <Bar dataKey="points" radius={[0, 4, 4, 0]} maxBarSize={28}>
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
              <Avatar
                displayName={entry.display_name}
                avatarType={entry.avatar_type}
                avatarValue={entry.avatar_value}
                size={36}
                bgClassName={isMe ? 'bg-field-500' : 'bg-turf-700'}
                textClassName={isMe ? 'text-turf-950' : 'text-turf-300'}
              />
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
              {(['table', 'weekly', 'graphs'] as const).map(id => (
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
                    <th className="px-4 py-3 text-left text-xs text-turf-500 uppercase tracking-wide font-medium w-44 select-none">
                      Metric
                    </th>
                    {analytics.map((a, i) => (
                      <th
                        key={a.user_id}
                        className="px-3 py-3 text-center select-none"
                      >
                        <span className="inline-flex items-center gap-1.5 max-w-[9rem]">
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: PLAYER_COLORS[i] }}
                          />
                          <span className="font-sans font-bold text-sm text-white truncate">
                            {a.display_name.split(' ')[0]}
                          </span>
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-turf-800/50">

                  <AnalyticsRow
                    label="Avg AP Rank"
                    tooltip="Average AP ranking across all your drafted teams. Lower is better — it means your teams are ranked higher overall."
                    values={analytics.map((a, i) => ({
                      display: a.avg_rank > 0 ? a.avg_rank.toFixed(1) : '—',
                      color: heatColor(a.avg_rank, avgRankValues.filter(v => v > 0), false),
                      textColor: PLAYER_COLORS[i],
                    }))}
                  />

                  <AnalyticsRow
                    label="Top 25% Rank"
                    tooltip="Average AP rank of your top-quartile teams. Shows the strength of your best picks."
                    values={analytics.map((a, i) => ({
                      display: a.top25_avg > 0 ? a.top25_avg.toFixed(1) : '—',
                      color: heatColor(a.top25_avg, top25Values.filter(v => v > 0), false),
                      textColor: PLAYER_COLORS[i],
                    }))}
                  />

                  <AnalyticsRow
                    label="Bottom 25% Rank"
                    tooltip="Average AP rank of your bottom-quartile teams. Lower numbers here mean even your worst picks are decent."
                    values={analytics.map((a, i) => ({
                      display: a.bot25_avg > 0 ? a.bot25_avg.toFixed(1) : '—',
                      color: heatColor(a.bot25_avg, bot25Values.filter(v => v > 0), false),
                      textColor: PLAYER_COLORS[i],
                    }))}
                  />

                  <tr><td colSpan={analytics.length + 1} className="py-1 bg-turf-800/30" /></tr>

                  <AnalyticsRow
                    label="Win/Loss Record"
                    tooltip="Combined win-loss record across every completed game your rostered teams have played this season."
                    values={analytics.map((a, i) => ({
                      display: (a.wins > 0 || a.losses > 0) ? `${a.wins}-${a.losses}` : '—',
                      color: heatColor(a.wins - a.losses, recordValues, true),
                      textColor: PLAYER_COLORS[i],
                    }))}
                  />

                  <AnalyticsRow
                    label="Captain Efficiency"
                    tooltip="How much of the best possible captain bonus you actually captured — 100% means you picked the highest-scoring eligible team as captain every week (ignoring the twice-per-team season limit)."
                    values={analytics.map((a, i) => ({
                      display: a.captain_efficiency !== null ? `${a.captain_efficiency}%` : '—',
                      color: a.captain_efficiency !== null ? heatColor(a.captain_efficiency, captainEffValues, true) : 'transparent',
                      textColor: PLAYER_COLORS[i],
                    }))}
                  />

                  <tr><td colSpan={analytics.length + 1} className="py-1 bg-turf-800/30" /></tr>

                  <AnalyticsRow
                    label="Best Pick"
                    tooltip="Your team that has earned the most fantasy points so far this season."
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
                    tooltip="Your team that has earned the fewest fantasy points so far this season."
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
                    tooltip="Your highest AP-ranked team this week."
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
                    tooltip="Your lowest AP-ranked team. Unranked teams are excluded."
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
                    tooltip="Sum of (pick number − AP rank) for all your ranked teams. Negative means you drafted better than expected — you got high-ranked teams late."
                    values={analytics.map((a, i) => ({
                      display: `${a.over_under_pts > 0 ? '+' : ''}${a.over_under_pts}`,
                      color: heatColor(a.over_under_pts, ouValues, false),
                      textColor: PLAYER_COLORS[i],
                    }))}
                  />

                  <AnalyticsRow
                    label="Over/Under Avg"
                    tooltip="Average (pick number − AP rank) per ranked team. Negative means you consistently found value picks relative to their AP ranking."
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
                      <span key={t.team_name} className="badge-gray text-xs cursor-default select-none">
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
                        contentStyle={{
                          background: '#21262d',
                          border: '1px solid #30363d',
                          borderRadius: 8,
                          fontSize: 12,
                          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                        }}
                        labelStyle={{ color: '#fff', marginBottom: 4, fontWeight: 600 }}
                        itemStyle={{ color: '#adb5bd' }}
                        cursor={{ fill: 'rgba(255,255,255,0.03)' }}
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

          {/* ── GRAPHS VIEW ── */}
          {analyticsTab === 'graphs' && (
            <div className="p-5 space-y-4">
              {/* Radar */}
              <div className="card-inner p-4">
                <h3 className="font-display text-lg tracking-wide text-white">Roster profile</h3>
                <p className="text-xs text-turf-500 mt-0.5 mb-4">Normalized roster quality across 5 dimensions (higher = better)</p>
                {radarData.length === 0 ? (
                  <p className="text-turf-600 text-sm text-center py-8">No ranking data yet</p>
                ) : (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={radarData} margin={{ top: 8, right: 24, left: 24, bottom: 8 }}>
                        <PolarGrid stroke="#30363d" />
                        <PolarAngleAxis dataKey="metric" tick={{ fill: '#6c757d', fontSize: 11 }} />
                        <Tooltip
                          contentStyle={{
                            background: '#21262d',
                            border: '1px solid #30363d',
                            borderRadius: 8,
                            fontSize: 12,
                            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                          }}
                          labelStyle={{ color: '#fff', fontWeight: 600 }}
                          itemStyle={{ color: '#adb5bd' }}
                        />
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

              {/* Season trend */}
              <div className="card-inner p-4">
                <h3 className="font-display text-lg tracking-wide text-white">Season trend</h3>
                <p className="text-xs text-turf-500 mt-0.5 mb-4">Cumulative points across the season</p>
                {trendData.length === 0 ? (
                  <p className="text-turf-600 text-sm text-center py-8">No weekly data yet — check back once games are played</p>
                ) : (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                        <XAxis dataKey="week" tick={{ fill: '#6c757d', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: '#6c757d', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <Tooltip
                          contentStyle={{
                            background: '#21262d',
                            border: '1px solid #30363d',
                            borderRadius: 8,
                            fontSize: 12,
                            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                          }}
                          labelStyle={{ color: '#fff', marginBottom: 4, fontWeight: 600 }}
                          itemStyle={{ color: '#adb5bd' }}
                        />
                        <Legend
                          wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
                          formatter={(value) => <span style={{ color: '#adb5bd' }}>{value}</span>}
                        />
                        {entries.map((e, i) => (
                          <Line
                            key={e.user_id}
                            type="monotone"
                            dataKey={e.display_name.split(' ')[0]}
                            stroke={PLAYER_COLORS[i] ?? '#22c55e'}
                            strokeWidth={2}
                            dot={{ r: 2 }}
                            activeDot={{ r: 4 }}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Draft value scatter */}
              <div className="card-inner p-4">
                <h3 className="font-display text-lg tracking-wide text-white">Draft value</h3>
                <p className="text-xs text-turf-500 mt-0.5 mb-4">Draft pick number vs. AP rank — points below the diagonal were drafted later than their rank suggests</p>
                {scatterByManager.length === 0 ? (
                  <p className="text-turf-600 text-sm text-center py-8">No ranking data yet</p>
                ) : (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
                        <XAxis
                          type="number" dataKey="pick_number" name="Pick"
                          tick={{ fill: '#6c757d', fontSize: 11 }} axisLine={false} tickLine={false}
                          label={{ value: 'Pick #', position: 'insideBottom', offset: -4, fill: '#6c757d', fontSize: 11 }}
                        />
                        <YAxis
                          type="number" dataKey="rank" name="AP Rank" reversed
                          tick={{ fill: '#6c757d', fontSize: 11 }} axisLine={false} tickLine={false}
                          label={{ value: 'AP rank', angle: -90, position: 'insideLeft', fill: '#6c757d', fontSize: 11 }}
                        />
                        <Tooltip cursor={{ strokeDasharray: '3 3', stroke: '#495057' }} content={<ScatterTooltip />} />
                        <Legend
                          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                          formatter={(value) => <span style={{ color: '#adb5bd' }}>{value}</span>}
                        />
                        {scatterByManager.map(m => (
                          <Scatter key={m.name} name={m.name} data={m.data} fill={m.color} />
                        ))}
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
