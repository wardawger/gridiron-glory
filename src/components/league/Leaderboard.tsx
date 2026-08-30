import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend,
  LineChart, Line, ScatterChart, Scatter, ReferenceLine,
} from 'recharts';
import { Crown, TrendingUp, TrendingDown, Star } from 'lucide-react';
import type { LeaderboardEntry, DraftPick, APRanking, CfbTeam } from '../../types';
import { computeAnalytics, heatColor } from '../../services/analytics';
import { Avatar } from '../ui/Avatar';
import { TeamLogo } from '../ui/TeamLogo';
import { InfoTooltip } from '../ui/Tooltip';

interface Props {
  entries: LeaderboardEntry[];
  currentWeek: number;
  userId: string;
  confChampComplete: boolean;
  draftPicks: DraftPick[];
  rankings: APRanking[];
  teams: CfbTeam[];
}

const PLAYER_COLORS = ['#f59e0b', '#60a5fa', '#a78bfa', '#34d399', '#f87171', '#fb923c'];

// Short display label for charts — first name plus a last-initial, so two
// managers who share a first word (e.g. "Mr. Wilson" / "Mr. Anderson") still
// read as distinct on axes/legends. Never used as a data key — user_id is,
// since even this can theoretically collide.
function chartLabel(displayName: string): string {
  const parts = displayName.trim().split(/\s+/);
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts[0]} ${parts[1][0]}`;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-turf-900 border border-turf-700 rounded-lg px-3 py-2 text-sm shadow-xl shadow-black/40">
      <p className="font-medium text-white mb-1">{label}</p>
      <p className="text-field-400 font-mono">{payload[0].value} pts</p>
    </div>
  );
};

// Custom scatter point — a team logo in a colored ring (ring color still
// carries which manager's series it belongs to, matching the legend)
// instead of a plain dot. Recharts renders scatter shapes as raw SVG, so
// this uses an <image> with a circular clip rather than the app's usual
// <TeamLogo> (which relies on an <img> onError fallback that isn't valid
// inside an SVG tree) — falls back to a plain dot if a team has no logo.
function TeamLogoDot(props: any) {
  const { cx, cy, fill, payload } = props;
  if (cx == null || cy == null) return <></>;

  const logo = payload?.team_logo as string | undefined;
  if (!logo) {
    return <circle cx={cx} cy={cy} r={5} fill={fill} stroke="#0d1117" strokeWidth={1} />;
  }

  const size = 20;
  const r = size / 2;
  const clipId = `draft-value-logo-${payload.user_id}-${payload.pick_number}-${payload.rank}`;

  return (
    <g>
      <clipPath id={clipId}>
        <circle cx={cx} cy={cy} r={r - 1} />
      </clipPath>
      <circle cx={cx} cy={cy} r={r} fill="#ffffff" stroke={fill} strokeWidth={1.5} />
      <image
        href={logo}
        x={cx - r}
        y={cy - r}
        width={size}
        height={size}
        clipPath={`url(#${clipId})`}
        preserveAspectRatio="xMidYMid meet"
      />
    </g>
  );
}

const ScatterTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="bg-turf-900 border border-turf-700 rounded-lg px-3 py-2 text-sm shadow-xl shadow-black/40">
      <p className="font-medium text-white mb-1">{p.team_name}</p>
      <p className="text-turf-400 text-xs">{chartLabel(p.display_name)}</p>
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
  return (
    <div className="inline-flex items-center gap-1.5 select-none">
      <span className="text-turf-300 text-xs font-medium">{label}</span>
      <InfoTooltip content={tooltip} position="bottom" width="w-56" />
    </div>
  );
}

// ── Sub-component: one analytics table row ────────────────────────────────

interface AnalyticsRowProps {
  label: string;
  tooltip: string;
  values: { display: string; color: string; textColor: string; logo?: string; teamName?: string }[];
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
            className="inline-flex items-center justify-center gap-1.5 cursor-default"
            style={{ color: v.display === '—' ? '#adb5bd' : undefined }}
          >
            {v.logo && v.teamName && (
              <TeamLogo src={v.logo} alt={v.teamName} fallbackName={v.teamName} size={16} />
            )}
            {v.display}
          </span>
        </td>
      ))}
    </tr>
  );
}

// ── Main component ────────────────────────────────────────────────────────

type AnalyticsTab = 'table' | 'graphs' | 'weekly';

export function Leaderboard({ entries, currentWeek, userId, confChampComplete, draftPicks, rankings, teams }: Props) {
  const navigate = useNavigate();
  const [analyticsTab, setAnalyticsTab] = useState<AnalyticsTab>('table');
  const teamsById = useMemo(() => new Map(teams.map(t => [t.id, t])), [teams]);

  const { analytics, undrafted, scatterPoints } = useMemo(
    () => computeAnalytics(entries, draftPicks, rankings),
    [entries, draftPicks, rankings]
  );

  const chartData = entries.map(e => ({
    name: chartLabel(e.display_name),
    points: e.total_points,
  }));
  const chartDomain: [number, number] = [
    Math.min(0, ...chartData.map(d => d.points)),
    Math.max(0, ...chartData.map(d => d.points)),
  ];

  // Weekly trend data
  const weeklyData = useMemo(() => {
    const weeks = Array.from({ length: currentWeek + 1 }, (_, i) => i);
    return weeks.map(w => {
      const row: Record<string, any> = { week: `Wk ${w}` };
      entries.forEach(e => {
        row[e.user_id] = e.weekly_scores.find(ws => ws.week === w)?.points ?? 0;
      });
      return row;
    }).filter(row => entries.some(e => (row[e.user_id] ?? 0) !== 0));
  }, [entries, currentWeek]);

  // Radar data — normalized against a fixed, real-world domain per metric
  // (roughly what "worst" and "best" actually look like for that stat),
  // not the group's own min/max. Min-max normalization always pins someone
  // to 0 and someone to 100 no matter how close the real numbers are — with
  // only 2-3 managers that made every axis a meaningless full swing. Domain
  // is [worst, best] in raw units; values outside it just clamp to the edge.
  const radarData = useMemo(() => {
    if (analytics.length === 0) return [];
    const metrics: { key: string; label: string; domain: [number, number] }[] = [
      { key: 'avg_rank',   label: 'Avg Rank',    domain: [25, 1] },   // AP Top 25 range
      { key: 'top25_avg',  label: 'Top 25%',     domain: [25, 1] },
      { key: 'best_pick',  label: 'Best Pick',   domain: [-20, 35] }, // typical single-team season point range
      { key: 'worst_pick', label: 'Worst Pick',  domain: [-20, 35] },
      { key: 'over_under', label: 'Draft Value', domain: [30, -30] }, // pick# − AP rank, lower is better
    ];
    return metrics.map(m => {
      const row: Record<string, any> = { metric: m.label };
      const [worst, best] = m.domain;
      analytics.forEach(a => {
        let raw: number;
        if (m.key === 'best_pick')       raw = a.best_pick?.points ?? 0;
        else if (m.key === 'worst_pick') raw = a.worst_pick?.points ?? 0;
        else if (m.key === 'over_under') raw = a.over_under_pts;
        else                              raw = (a as any)[m.key] ?? 0;

        const pct = ((raw - worst) / (best - worst)) * 100;
        row[a.user_id] = Math.max(0, Math.min(100, pct));
      });
      return row;
    });
  }, [analytics]);

  // Season trend — cumulative points per manager across weeks
  const trendData = useMemo(() => {
    const weeks = Array.from({ length: currentWeek + 1 }, (_, i) => i);
    const running: Record<string, number> = {};
    entries.forEach(e => { running[e.user_id] = 0; });
    return weeks.map(w => {
      const row: Record<string, any> = { week: `Wk ${w}` };
      entries.forEach(e => {
        running[e.user_id] += e.weekly_scores.find(ws => ws.week === w)?.points ?? 0;
        row[e.user_id] = running[e.user_id];
      });
      return row;
    });
  }, [entries, currentWeek]);

  // Draft value scatter — one series per manager so each gets its own color/legend entry
  const scatterByManager = useMemo(() => {
    return entries.map((e, i) => ({
      name: chartLabel(e.display_name),
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
              <XAxis type="number" hide domain={chartDomain} />
              <YAxis
                type="category" dataKey="name" width={90}
                tick={{ fill: '#adb5bd', fontSize: 12, fontFamily: 'DM Sans' }}
                axisLine={false} tickLine={false}
              />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ fill: 'rgba(255,255,255,0.03)' }}
              />
              <ReferenceLine x={0} stroke="#495057" />
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
                  {entry.roster.length > 0 ? (
                    <div className="flex items-center -space-x-1.5">
                      {entry.roster.slice(0, 6).map(t => (
                        <TeamLogo
                          key={t.team_id}
                          src={t.team_logo}
                          alt={t.team_name}
                          fallbackName={t.team_name}
                          size={18}
                          className="ring-2 ring-turf-950"
                        />
                      ))}
                      {entry.roster.length > 6 && (
                        <span className="pl-2 text-[10px] text-turf-500">+{entry.roster.length - 6} more</span>
                      )}
                    </div>
                  ) : (
                    <span>No teams</span>
                  )}
                  {entry.bonus_points !== 0 && (
                    <span className={entry.bonus_points > 0 ? 'text-amber-500' : 'text-red-300'}>
                      {entry.bonus_points > 0 ? '+' : ''}{entry.bonus_points} bonus
                    </span>
                  )}
                  {statPts !== 0 && (
                    <span className={statPts > 0 ? 'text-blue-400' : 'text-red-300'}>
                      {statPts > 0 ? '+' : ''}{statPts} stats{!confChampComplete ? ' ◎' : ''}
                    </span>
                  )}
                  {lastWeek && lastWeek.points !== 0 && (
                    <span className="flex items-center gap-0.5">
                      {lastWeek.points > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
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
                            {chartLabel(a.display_name)}
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
                      logo: a.best_pick?.team_logo,
                      teamName: a.best_pick?.team_name,
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
                      logo: a.worst_pick?.team_logo,
                      teamName: a.worst_pick?.team_name,
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
                      logo: a.best_team?.team_logo,
                      teamName: a.best_team?.team_name,
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
                      logo: a.worst_team?.team_logo,
                      teamName: a.worst_team?.team_name,
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
                      <span key={t.team_id} className="badge-gray text-xs cursor-default select-none inline-flex items-center gap-1.5">
                        <TeamLogo
                          src={teamsById.get(t.team_id)?.logo}
                          alt={t.team_name}
                          fallbackName={t.team_name}
                          size={16}
                        />
                        {t.team_name} <span className="text-turf-400">(#{t.rank})</span>
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
                <p className="text-turf-500 text-sm text-center py-8">No weekly data yet — check back once games are played</p>
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
                          name={chartLabel(e.display_name)}
                          dataKey={e.user_id}
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
                  <p className="text-turf-500 text-sm text-center py-8">No ranking data yet</p>
                ) : (
                  <div className="h-72 animate-radar-in" style={{ transformOrigin: 'center' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={radarData} margin={{ top: 8, right: 24, left: 24, bottom: 8 }}>
                        <PolarGrid stroke="#495057" />
                        <PolarAngleAxis dataKey="metric" tick={{ fill: '#6c757d', fontSize: 11 }} />
                        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
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
                          formatter={(value: number) => value.toFixed(1)}
                        />
                        <Legend
                          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                          formatter={(value) => <span style={{ color: '#adb5bd' }}>{value}</span>}
                        />
                        {entries.map((e, i) => (
                          <Radar
                            key={e.user_id}
                            name={chartLabel(e.display_name)}
                            dataKey={e.user_id}
                            stroke={PLAYER_COLORS[i] ?? '#22c55e'}
                            fill={PLAYER_COLORS[i] ?? '#22c55e'}
                            fillOpacity={0.12}
                            strokeWidth={2}
                            isAnimationActive={false}
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
                  <p className="text-turf-500 text-sm text-center py-8">No weekly data yet — check back once games are played</p>
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
                            name={chartLabel(e.display_name)}
                            dataKey={e.user_id}
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
                  <p className="text-turf-500 text-sm text-center py-8">No ranking data yet</p>
                ) : (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 16, right: 24, left: 8, bottom: 8 }}>
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
                          <Scatter key={m.name} name={m.name} data={m.data} fill={m.color} shape={TeamLogoDot} />
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
