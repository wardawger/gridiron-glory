import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend,
  LineChart, Line, ScatterChart, Scatter, ReferenceLine,
} from 'recharts';
import { Crown, TrendingUp, TrendingDown, Star } from 'lucide-react';
import type { LeaderboardEntry, DraftPick, APRanking, CfbTeam } from '../../types';
import { computeAnalytics, tierFor } from '../../services/analytics';
import type { RosterAnalytics, MetricTier } from '../../services/analytics';
import { Avatar } from '../ui/Avatar';
import { TeamLogo } from '../ui/TeamLogo';
import { InfoTooltip } from '../ui/Tooltip';
import {
  seriesColor, CHART_TOOLTIP_STYLE, CHART_TOOLTIP_LABEL, CHART_TOOLTIP_ITEM, legendFormatter,
  CHART_AXIS_TICK, CHART_GRID, CHART_MUTED, CHART_SURFACE,
} from '../../lib/chartTheme';

interface Props {
  entries: LeaderboardEntry[];
  currentWeek: number;
  userId: string;
  confChampComplete: boolean;
  draftPicks: DraftPick[];
  rankings: APRanking[];
  teams: CfbTeam[];
}

// Compact team label for the analytics cells. Plain last-word truncation
// turned "Ohio State", "Florida State" and "Michigan State" into an
// identical "State" — keep the qualifier when the last word is generic.
const GENERIC_SUFFIXES = new Set(['State', 'Tech', 'A&M', 'College', 'University']);
function shortTeamName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return name;
  const last = parts[parts.length - 1];
  return GENERIC_SUFFIXES.has(last) ? parts.slice(-2).join(' ') : last;
}

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
    return <circle cx={cx} cy={cy} r={5} fill={fill} stroke={CHART_SURFACE} strokeWidth={1} />;
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
  polarity?: string | null;
}

function MetricLabel({ label, tooltip, polarity }: MetricTooltipProps) {
  return (
    <div className="min-w-0">
      <span className="inline-flex items-center gap-1.5">
        <span className="text-turf-300 text-xs font-medium">{label}</span>
        <InfoTooltip content={tooltip} position="bottom" width="w-56" />
      </span>
      {polarity && <p className="text-xs text-turf-500 leading-tight">{polarity}</p>}
    </div>
  );
}

// ── Metric definitions ────────────────────────────────────────────────────

// Every metric carries its own absolute [worst, best] domain, so "good" means
// good on a fixed scale rather than "best of whoever happens to be in this
// league". The previous relative min-max always painted one manager red and
// one green even when the spread was 0.3 of an AP rank. Domains match the
// ones radarData already used.
//
// `polarity` is displayed permanently under the label. It used to exist only
// inside the tooltip, so a reader had to open eleven of them to learn that
// "+8" is good in one row and bad three rows below.
interface MetricDef {
  id: string;
  label: string;
  polarity: string | null;
  tooltip: string;
  groupStart?: boolean;
  // null = shown for context, deliberately not scored.
  domain: [number, number] | null;
  value: (a: RosterAnalytics) => number | null;
  display: (a: RosterAnalytics) => string;
  logo?: (a: RosterAnalytics) => string | undefined;
  team?: (a: RosterAnalytics) => string | undefined;
}

const signed = (n: number) => `${n > 0 ? '+' : ''}${n}`;

const METRICS: MetricDef[] = [
  {
    id: 'avg_rank',
    label: 'Avg AP Rank',
    polarity: 'lower is better',
    tooltip: 'Average AP ranking across all your drafted teams. Lower is better — it means your teams are ranked higher overall.',
    domain: [25, 1],
    value: a => (a.avg_rank > 0 ? a.avg_rank : null),
    display: a => (a.avg_rank > 0 ? a.avg_rank.toFixed(1) : '—'),
  },
  {
    id: 'top25',
    label: 'Top 25% Rank',
    polarity: 'lower is better',
    tooltip: 'Average AP rank of your top-quartile teams. Shows the strength of your best picks.',
    domain: [25, 1],
    value: a => (a.top25_avg > 0 ? a.top25_avg : null),
    display: a => (a.top25_avg > 0 ? a.top25_avg.toFixed(1) : '—'),
  },
  {
    id: 'bot25',
    label: 'Bottom 25% Rank',
    polarity: 'lower is better',
    tooltip: 'Average AP rank of your bottom-quartile teams. Lower numbers here mean even your worst picks are decent.',
    domain: [25, 1],
    value: a => (a.bot25_avg > 0 ? a.bot25_avg : null),
    display: a => (a.bot25_avg > 0 ? a.bot25_avg.toFixed(1) : '—'),
  },
  {
    id: 'record',
    label: 'Win/Loss Record',
    polarity: 'higher is better',
    groupStart: true,
    tooltip: 'Combined win-loss record across every completed game your rostered teams have played this season. Scored on win differential (wins minus losses).',
    domain: [-6, 6],
    value: a => (a.wins > 0 || a.losses > 0 ? a.wins - a.losses : null),
    display: a => (a.wins > 0 || a.losses > 0 ? `${a.wins}-${a.losses}` : '—'),
  },
  {
    id: 'captain',
    label: 'Captain Efficiency',
    polarity: 'higher is better',
    tooltip: 'How much of the best possible captain bonus you actually captured — 100% means you picked the highest-scoring eligible team as captain every week (ignoring the twice-per-team season limit).',
    domain: [0, 100],
    value: a => a.captain_efficiency,
    display: a => (a.captain_efficiency !== null ? `${a.captain_efficiency}%` : '—'),
  },
  {
    id: 'best_pick',
    label: 'Best Pick',
    polarity: 'higher is better',
    groupStart: true,
    tooltip: 'Your team that has earned the most fantasy points so far this season.',
    domain: [-20, 35],
    value: a => a.best_pick?.points ?? null,
    display: a => (a.best_pick ? `${shortTeamName(a.best_pick.team_name)} (${signed(a.best_pick.points)})` : '—'),
    logo: a => a.best_pick?.team_logo,
    team: a => a.best_pick?.team_name,
  },
  {
    id: 'worst_pick',
    label: 'Worst Pick',
    polarity: null,
    // Deliberately unscored. Ranking each manager's worst pick against the
    // others painted somebody's disaster green for being the least bad,
    // which taught nothing and read as a bug.
    tooltip: 'Your team that has earned the fewest fantasy points so far this season. Shown for context only — it is not scored against the other managers.',
    domain: null,
    value: a => a.worst_pick?.points ?? null,
    display: a => (a.worst_pick ? `${shortTeamName(a.worst_pick.team_name)} (${signed(a.worst_pick.points)})` : '—'),
    logo: a => a.worst_pick?.team_logo,
    team: a => a.worst_pick?.team_name,
  },
  {
    id: 'best_team',
    label: 'Best Ranked Team',
    polarity: null,
    tooltip: 'Your highest AP-ranked team this week.',
    domain: null,
    value: a => a.best_team?.rank ?? null,
    display: a => (a.best_team ? `${shortTeamName(a.best_team.team_name)} (#${a.best_team.rank})` : '—'),
    logo: a => a.best_team?.team_logo,
    team: a => a.best_team?.team_name,
  },
  {
    id: 'worst_team',
    label: 'Worst Ranked Team',
    polarity: null,
    tooltip: 'Your lowest AP-ranked team. Unranked teams are excluded.',
    domain: null,
    value: a => a.worst_team?.rank ?? null,
    display: a => (a.worst_team ? `${shortTeamName(a.worst_team.team_name)} (#${a.worst_team.rank})` : '—'),
    logo: a => a.worst_team?.team_logo,
    team: a => a.worst_team?.team_name,
  },
  {
    id: 'ou_pts',
    label: 'Over/Under Draft Pts',
    polarity: 'negative is better',
    groupStart: true,
    tooltip: 'Sum of (pick number − AP rank) for all your ranked teams. Negative means you drafted better than expected — you got high-ranked teams late.',
    domain: [30, -30],
    value: a => a.over_under_pts,
    display: a => signed(a.over_under_pts),
  },
  {
    id: 'ou_avg',
    label: 'Over/Under Avg',
    polarity: 'negative is better',
    tooltip: 'Average (pick number − AP rank) per ranked team. Negative means you consistently found value picks relative to their AP ranking.',
    domain: [15, -15],
    value: a => a.over_under_avg,
    display: a => signed(a.over_under_avg),
  },
];

// Tier is carried by a glyph as well as a color, so the ranking survives
// colorblindness and screen readers. Colour alone used to be the only signal,
// and at the old alphas the green and red washes differed by 1.05:1.
const TIER_GLYPH: Record<MetricTier, string> = { good: '▲', mid: '●', poor: '▼', none: '' };
const TIER_LABEL: Record<MetricTier, string> = { good: 'strong', mid: 'average', poor: 'weak', none: '' };
const TIER_TEXT: Record<MetricTier, string> = {
  good: 'text-field-400', mid: 'text-amber-400', poor: 'text-red-300', none: '',
};
const TIER_CELL: Record<MetricTier, string> = {
  good: 'bg-field-900/20', mid: 'bg-amber-900/15', poor: 'bg-red-950/25', none: '',
};

// One metric's value as rendered in a cell: optional team logo, the value,
// and its tier glyph.
function MetricValue({ metric, a, tier }: { metric: MetricDef; a: RosterAnalytics; tier: MetricTier }) {
  const text = metric.display(a);
  const logo = metric.logo?.(a);
  const team = metric.team?.(a);
  return (
    <span className={`inline-flex items-center gap-1.5 ${text === '—' ? 'text-turf-500' : 'text-white'}`}>
      {logo && team && <TeamLogo src={logo} alt="" fallbackName={team} size={16} />}
      <span className="tabular-nums">{text}</span>
      {tier !== 'none' && (
        <>
          <span aria-hidden="true" className={TIER_TEXT[tier]}>{TIER_GLYPH[tier]}</span>
          <span className="sr-only">, {TIER_LABEL[tier]}</span>
        </>
      )}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────

type AnalyticsTab = 'table' | 'graphs' | 'weekly';
const ANALYTICS_TABS: AnalyticsTab[] = ['table', 'weekly', 'graphs'];

export function Leaderboard({ entries, currentWeek, userId, confChampComplete, draftPicks, rankings, teams }: Props) {
  const [analyticsTab, setAnalyticsTab] = useState<AnalyticsTab>('table');

  // Roving arrow-key focus for the analytics tablist (WAI-ARIA tabs pattern).
  const onTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = ANALYTICS_TABS[(idx + delta + ANALYTICS_TABS.length) % ANALYTICS_TABS.length];
    setAnalyticsTab(next);
    (e.currentTarget.parentElement?.querySelector(`#analytics-tab-${next}`) as HTMLElement | null)?.focus();
  };
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
      color: seriesColor(i),
      data: scatterPoints.filter(p => p.user_id === e.user_id),
    })).filter(m => m.data.length > 0);
  }, [entries, scatterPoints]);

  return (
    <div className="space-y-6 animate-fade-in motion-reduce:animate-none">

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
                tick={{ fill: CHART_MUTED, fontSize: 12, fontFamily: 'DM Sans' }}
                axisLine={false} tickLine={false}
              />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ fill: 'rgba(255,255,255,0.03)' }}
              />
              <ReferenceLine x={0} stroke={CHART_GRID} />
              <Bar dataKey="points" radius={[0, 4, 4, 0]} maxBarSize={28}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={seriesColor(i)} fillOpacity={i === 0 ? 1 : 0.75} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Standings List ────────────────────────────── */}
      <div className="card divide-y divide-turf-800">
        {entries.length === 0 && (
          <p className="text-turf-500 text-sm text-center py-10">No managers yet — standings appear once the league has members.</p>
        )}
        {entries.map((entry, idx) => {
          const isMe      = entry.user_id === userId;
          const weekScore = entry.weekly_scores.find(w => w.week === currentWeek);
          const lastWeek  = entry.weekly_scores.find(w => w.week === currentWeek - 1);
          const statPts   = (entry as any).stat_points ?? 0;

          return (
            <Link
              key={entry.user_id}
              to={`/roster/${entry.user_id}`}
              className={`w-full flex items-center gap-4 px-5 py-4 hover:bg-turf-800/50 transition-colors text-left group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-field-400 ${isMe ? 'bg-field-950/30' : ''}`}
            >
              <div className="w-8 flex-shrink-0 text-center">
                {idx === 0
                  ? <><Crown className="w-5 h-5 text-gold-400 mx-auto" aria-hidden="true" /><span className="sr-only">1st place</span></>
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
                  {idx === 0 && <Star className="w-3 h-3 text-gold-400 fill-gold-400" aria-hidden="true" />}
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
                        <span className="pl-2 text-xs text-turf-500">+{entry.roster.length - 6} more</span>
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
                      {statPts > 0 ? '+' : ''}{statPts} stats
                      {!confChampComplete && (
                        <span title="Provisional — final once conference championships are complete">
                          {' ◎'}<span className="sr-only"> (provisional)</span>
                        </span>
                      )}
                    </span>
                  )}
                  {lastWeek && lastWeek.points !== 0 && (
                    <span className="flex items-center gap-0.5">
                      {lastWeek.points > 0 ? <TrendingUp className="w-3 h-3" aria-hidden="true" /> : <TrendingDown className="w-3 h-3" aria-hidden="true" />}
                      {lastWeek.points > 0 ? '+' : ''}{lastWeek.points} last wk
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="font-mono font-bold text-xl text-white group-hover:text-field-400 transition-colors">{entry.total_points}</div>
                <div className="text-xs text-turf-500">{weekScore ? `${weekScore.points > 0 ? '+' : ''}${weekScore.points} wk` : '—'}</div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* ── Roster Analytics ─────────────────────────── */}
      {analytics.length > 0 && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-turf-800">
            <h2 className="section-title text-xl">Roster Analytics</h2>
            <div role="tablist" aria-label="Roster analytics view" className="flex gap-1 bg-turf-800 p-1 rounded-lg">
              {ANALYTICS_TABS.map((id, idx) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  id={`analytics-tab-${id}`}
                  aria-selected={analyticsTab === id}
                  aria-controls={`analytics-panel-${id}`}
                  tabIndex={analyticsTab === id ? 0 : -1}
                  onClick={() => setAnalyticsTab(id)}
                  onKeyDown={e => onTabKeyDown(e, idx)}
                  className={`px-3 py-1.5 min-h-[32px] rounded-md text-xs font-medium transition-colors capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-field-400 ${
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
            <div role="tabpanel" id="analytics-panel-table" aria-labelledby="analytics-tab-table">
              <div
                className="overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-field-400"
                tabIndex={0}
                aria-label="Roster analytics by manager, scrolls horizontally"
              >
                <table className="w-full text-sm" aria-label="Roster analytics by manager">
                  <caption className="sr-only">Metrics down the side, managers across the top.</caption>
                  <thead>
                    <tr className="border-b border-turf-800">
                      <th scope="col" className="px-4 py-3 text-left text-xs text-turf-500 uppercase tracking-wide font-medium w-44 sticky left-0 bg-turf-900 z-10 border-r border-turf-800">
                        Metric
                      </th>
                      {analytics.map((a, i) => {
                        const isMe = a.user_id === userId;
                        return (
                          <th
                            key={a.user_id}
                            scope="col"
                            className={`px-3 py-3 text-center ${isMe ? 'bg-field-950/30' : ''}`}
                          >
                            <Link
                              to={`/roster/${a.user_id}`}
                              className="inline-flex items-center gap-1.5 max-w-[9rem] rounded hover:text-field-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-field-400"
                            >
                              <span
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: seriesColor(i) }}
                              />
                              <span className="font-sans font-bold text-sm text-white truncate">
                                {chartLabel(a.display_name)}
                              </span>
                            </Link>
                            {isMe && <span className="badge-green text-xs mt-1 mx-auto block w-fit">You</span>}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-turf-800/50">
                    {METRICS.map(m => (
                      <tr key={m.id} className={`group hover:bg-turf-800/20 transition-colors ${m.groupStart ? 'border-t-[6px] border-t-turf-800/30' : ''}`}>
                        <th
                          scope="row"
                          className="px-4 py-2.5 text-left font-normal sticky left-0 bg-turf-900 group-hover:bg-turf-800 transition-colors z-10 border-r border-turf-800"
                        >
                          <MetricLabel label={m.label} tooltip={m.tooltip} polarity={m.polarity} />
                        </th>
                        {analytics.map(a => {
                          const tier = m.domain ? tierFor(m.value(a), m.domain) : 'none';
                          const isMe = a.user_id === userId;
                          return (
                            <td
                              key={a.user_id}
                              className={`px-3 py-2.5 text-center font-mono text-xs font-medium ${TIER_CELL[tier]} ${isMe ? 'ring-1 ring-inset ring-field-800/40' : ''}`}
                            >
                              <MetricValue metric={m} a={a} tier={tier} />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="border-t border-turf-800 px-4 py-3 flex items-center gap-x-4 gap-y-1 text-xs text-turf-500 flex-wrap">
                <span className="flex items-center gap-1"><span className="text-field-400" aria-hidden="true">▲</span> Strong</span>
                <span className="flex items-center gap-1"><span className="text-amber-400" aria-hidden="true">●</span> Average</span>
                <span className="flex items-center gap-1"><span className="text-red-300" aria-hidden="true">▼</span> Weak</span>
                <span className="text-turf-500">Each metric is judged on its own fixed scale, not ranked against the other managers.</span>
              </div>

              {/* Undrafted top teams */}
              {undrafted.length > 0 && (
                <div className="border-t border-turf-800 px-4 py-4">
                  <p className="text-xs text-turf-500 uppercase tracking-wide font-medium mb-2">
                    Best Available — Not Drafted
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {undrafted.map(t => (
                      <span key={t.team_id} className="badge-gray text-xs inline-flex items-center gap-1.5">
                        <TeamLogo
                          src={teamsById.get(t.team_id)?.logo}
                          alt=""
                          fallbackName={t.team_name}
                          size={16}
                        />
                        {shortTeamName(t.team_name)} <span className="text-turf-400 tabular-nums">(#{t.rank})</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── WEEKLY VIEW ── */}
          {analyticsTab === 'weekly' && (
            <div role="tabpanel" id="analytics-panel-weekly" aria-labelledby="analytics-tab-weekly" className="p-5">
              <p className="text-xs text-turf-500 mb-4">Points scored per week by each player</p>
              {weeklyData.length === 0 ? (
                <p className="text-turf-500 text-sm text-center py-8">No weekly data yet — check back once games are played</p>
              ) : (
                <div className="h-72" role="img" aria-label={`Bar chart of points scored per week by each manager, weeks 0 through ${currentWeek}`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={weeklyData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <XAxis dataKey="week" tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} />
                      <YAxis tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={CHART_TOOLTIP_STYLE}
                        labelStyle={CHART_TOOLTIP_LABEL}
                        itemStyle={CHART_TOOLTIP_ITEM}
                        cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} formatter={legendFormatter} />
                      {entries.map((e, i) => (
                        <Bar
                          key={e.user_id}
                          name={chartLabel(e.display_name)}
                          dataKey={e.user_id}
                          fill={seriesColor(i)}
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
            <div role="tabpanel" id="analytics-panel-graphs" aria-labelledby="analytics-tab-graphs" className="p-5 space-y-4">
              {/* Radar */}
              <div className="card-inner p-4">
                <h3 className="font-display text-lg tracking-wide text-white">Roster profile</h3>
                <p className="text-xs text-turf-500 mt-0.5 mb-4">Normalized roster quality across 5 dimensions (higher = better)</p>
                {radarData.length === 0 ? (
                  <p className="text-turf-500 text-sm text-center py-8">No ranking data yet</p>
                ) : (
                  <div
                    className="h-72 animate-radar-in motion-reduce:animate-none"
                    style={{ transformOrigin: 'center' }}
                    role="img"
                    aria-label="Radar chart comparing each manager's roster on average rank, top-25 rank, best pick, worst pick, and draft value"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={radarData} margin={{ top: 8, right: 24, left: 24, bottom: 8 }}>
                        <PolarGrid stroke={CHART_GRID} />
                        <PolarAngleAxis dataKey="metric" tick={CHART_AXIS_TICK} />
                        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                        <Tooltip
                          contentStyle={CHART_TOOLTIP_STYLE}
                          labelStyle={CHART_TOOLTIP_LABEL}
                          itemStyle={CHART_TOOLTIP_ITEM}
                          formatter={(value: number) => value.toFixed(1)}
                        />
                        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} formatter={legendFormatter} />
                        {entries.map((e, i) => (
                          <Radar
                            key={e.user_id}
                            name={chartLabel(e.display_name)}
                            dataKey={e.user_id}
                            stroke={seriesColor(i)}
                            fill={seriesColor(i)}
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
                  <div className="h-72" role="img" aria-label="Line chart of each manager's cumulative points across the season">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                        <XAxis dataKey="week" tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} />
                        <YAxis tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} />
                        <Tooltip
                          contentStyle={CHART_TOOLTIP_STYLE}
                          labelStyle={CHART_TOOLTIP_LABEL}
                          itemStyle={CHART_TOOLTIP_ITEM}
                        />
                        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} formatter={legendFormatter} />
                        {entries.map((e, i) => (
                          <Line
                            key={e.user_id}
                            type="monotone"
                            name={chartLabel(e.display_name)}
                            dataKey={e.user_id}
                            stroke={seriesColor(i)}
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
                  <div className="h-72" role="img" aria-label="Scatter plot of each drafted team's pick number against its AP rank, colored by manager">
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 16, right: 24, left: 8, bottom: 8 }}>
                        <XAxis
                          type="number" dataKey="pick_number" name="Pick"
                          tick={CHART_AXIS_TICK} axisLine={false} tickLine={false}
                          label={{ value: 'Pick #', position: 'insideBottom', offset: -4, ...CHART_AXIS_TICK }}
                        />
                        <YAxis
                          type="number" dataKey="rank" name="AP Rank" reversed
                          tick={CHART_AXIS_TICK} axisLine={false} tickLine={false}
                          label={{ value: 'AP rank', angle: -90, position: 'insideLeft', ...CHART_AXIS_TICK }}
                        />
                        <Tooltip cursor={{ strokeDasharray: '3 3', stroke: CHART_GRID }} content={<ScatterTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} formatter={legendFormatter} />
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
