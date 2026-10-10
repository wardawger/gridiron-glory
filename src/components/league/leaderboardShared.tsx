import { useState, useMemo, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Star, ChevronRight } from 'lucide-react';
import type { LeaderboardEntry, WeeklyScore, GameResult, StatBonusCategory, CfbTeam } from '../../types';
import type { RosterAnalytics, MetricTier } from '../../services/analytics';
import { TeamLogo } from '../ui/TeamLogo';
import { InfoTooltip } from '../ui/Tooltip';
import { PLAYER_COLORS, CHART_SURFACE } from '../../lib/chartTheme';

// Compact team label for the analytics cells. Plain last-word truncation
// turned "Ohio State", "Florida State" and "Michigan State" into an
// identical "State" — keep the qualifier when the last word is generic.
export const GENERIC_SUFFIXES = new Set(['State', 'Tech', 'A&M', 'College', 'University']);
export function shortTeamName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return name;
  const last = parts[parts.length - 1];
  return GENERIC_SUFFIXES.has(last) ? parts.slice(-2).join(' ') : last;
}

// Short display label for charts — first name plus a last-initial, so two
// managers who share a first word (e.g. "Mr. Wilson" / "Mr. Anderson") still
// read as distinct on axes/legends. Never used as a data key — user_id is,
// since even this can theoretically collide.
export function chartLabel(displayName: string): string {
  const parts = displayName.trim().split(/\s+/);
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts[0]} ${parts[1][0]}`;
}

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-turf-900 border border-turf-700 rounded-lg px-3 py-2 text-sm shadow-xl shadow-black/40">
      <p className="font-medium text-white mb-1">{label}</p>
      <p className="text-field-400 font-mono">{payload[0].value} pts</p>
    </div>
  );
};

// Weekly chart tooltip. Paired with shared={false} on the Tooltip, so it
// receives only the bar actually under the cursor. The default shared
// behaviour stacked all six managers into one panel tall enough to cover the
// chart behind it.
export const WeeklyTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  const pts = Number(p.value);
  return (
    <div className="bg-turf-900 border border-turf-700 rounded-lg px-3 py-2 shadow-xl shadow-black/40">
      <p className="flex items-center gap-1.5 text-sm font-medium text-white">
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: p.color ?? p.fill }}
        />
        {p.name}
      </p>
      <p className="text-xs text-turf-500">{label ?? p.payload?.week}</p>
      <p className={`font-mono text-sm tabular-nums ${pts < 0 ? 'text-red-300' : 'text-field-400'}`}>
        {pts > 0 ? '+' : ''}{pts} pts
      </p>
    </div>
  );
};

// Custom scatter point — a team logo in a colored ring (ring color still
// carries which manager's series it belongs to, matching the legend)
// instead of a plain dot. Recharts renders scatter shapes as raw SVG, so
// this uses an <image> with a circular clip rather than the app's usual
// <TeamLogo> (which relies on an <img> onError fallback that isn't valid
// inside an SVG tree) — falls back to a plain dot if a team has no logo.
export function TeamLogoDot(props: any) {
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

export const ScatterTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="bg-turf-900 border border-turf-700 rounded-lg px-3 py-2 text-sm shadow-xl shadow-black/40">
      <p className="font-medium text-white mb-1">{p.team_name}</p>
      <p className="text-turf-400 text-xs">{p.label ?? chartLabel(p.display_name)}</p>
      <p className="text-turf-300 font-mono text-xs mt-1">Pick #{p.pick_number} · AP #{p.rank}</p>
    </div>
  );
};

// ── Metric tooltip ────────────────────────────────────────────────────────

export interface MetricTooltipProps {
  label: string;
  tooltip: string;
  polarity?: string | null;
}

export function MetricLabel({ label, tooltip, polarity }: MetricTooltipProps) {
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
export interface MetricDef {
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

export const signed = (n: number) => `${n > 0 ? '+' : ''}${n}`;

// QBR (passer rating) carries long float tails from CFBD's raw aggregate —
// rounded to the nearest hundredth for display. Every other stat category
// is already a whole-number count (TDs, sacks, interceptions), so left as-is.
export const formatStatValue = (stat: StatBonusCategory, value: number) =>
  stat === 'qbr' ? value.toFixed(2) : String(value);

export type OpenGameModalArgs = { game: GameResult; teamId: string; teamName: string; teamLogo: string; week: number; isCaptain: boolean };

// One ring, three arcs sharing that same radius and layered on top of each
// other rather than three separate concentric rings — the actual pattern in
// github.com/chartjs/Chart.js/discussions/11183 ("overlapping arcs" means
// arcs stacked on the same ring, not nested rings at different radii).
// Drawn longest-fraction-first so each shorter arc sits visibly on top of
// the longer ones behind it, same as the reference screenshot's bold
// foreground arc over a lighter background one. totalPossible's own
// fraction of itself is always 1, so its arc always paints the full ring —
// that's intentional: it's the backdrop the average and weekly arcs are
// read against, not a competing arc that could visually lose to them.
// Rebuilt in plain SVG since this app charts with Recharts, which has no
// radial-gauge primitive. Colors match the Season Standings bar chart at
// the top of this page exactly — PLAYER_COLORS[1] (blue), PLAYER_COLORS[0]
// (amber/yellow), PLAYER_COLORS[3] (green) — rather than the gradient
// palette this component originally borrowed from its styling reference
// (codepen.io/rozklad/pen/qVObdP), so the two charts on this page read as
// one consistent color system instead of two unrelated ones.
export const WEEK_RING_LAYERS = [
  { key: 'possible' as const, color: PLAYER_COLORS[1], label: 'Total possible' },
  { key: 'average'  as const, color: PLAYER_COLORS[3], label: 'League average' },
  { key: 'weekly'   as const, color: PLAYER_COLORS[0], label: 'Weekly points' },
];

// Sweeps every arc in from 0 and counts the center number up alongside it,
// re-running whenever the underlying values change (switching the week tab
// re-triggers it, same as a fresh reveal). Driven by one shared progress
// value via requestAnimationFrame rather than a CSS transition, since the
// center number needs to animate in lockstep with the arcs and CSS can't
// interpolate text content. Skips straight to the end state for
// prefers-reduced-motion, matching this app's motion-reduce convention
// elsewhere — checked once via a ref since it can't change mid-session.
export function useAnimatedProgress(deps: number[], durationMs = 700): number {
  const [progress, setProgress] = useState(0);
  const reduceMotion = useRef(
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    if (reduceMotion.current) { setProgress(1); return; }
    let raf: number;
    const start = performance.now();
    setProgress(0);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      setProgress(1 - Math.pow(1 - t, 3)); // ease-out-cubic
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return progress;
}

export function WeekPointsRings({ weekly, leagueAverage, totalPossible }: {
  weekly: number; leagueAverage: number; totalPossible: number;
}) {
  // Guards divide-by-zero on a scoreless/bye week — every arc just reads 0.
  const scale = Math.max(totalPossible, 1);
  const fractionOf = (v: number) => Math.max(0, Math.min(1, v / scale));
  const values: Record<(typeof WEEK_RING_LAYERS)[number]['key'], number> = {
    possible: totalPossible, average: leagueAverage, weekly,
  };
  const RADIUS = 48;
  const STROKE = 16;
  const CENTER = 60;
  const circumference = 2 * Math.PI * RADIUS;
  const progress = useAnimatedProgress([weekly, leagueAverage, totalPossible]);

  // All three arcs start at the same angle (12 o'clock), so whichever is
  // drawn last sits on top and fully covers any shorter arc behind it —
  // fixed draw order broke this the moment weekly points outscored the
  // league average, since "weekly" was always drawn over "average" and
  // silently erased it whenever its own fraction was the larger one.
  // Sorting by fraction descending at render time keeps every arc visible:
  // longest painted first as the backdrop, each shorter one layered on top.
  // Sorted by each arc's real target fraction (not the animated one) so the
  // stacking order stays fixed throughout the reveal instead of reshuffling
  // as they grow in.
  const drawOrder = WEEK_RING_LAYERS
    .map(r => ({ ...r, fraction: fractionOf(values[r.key]) }))
    .sort((a, b) => b.fraction - a.fraction);

  return (
    <div className="flex items-center gap-4">
      <svg width={120} height={120} viewBox="0 0 120 120" className="flex-shrink-0" aria-hidden="true">
        {/* Rotated so 0% starts at 12 o'clock and sweeps clockwise, matching
            how a progress ring reads everywhere else in this app. */}
        <g transform={`rotate(-90 ${CENTER} ${CENTER})`}>
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" stroke="currentColor" className="text-turf-800" strokeWidth={STROKE} />
          {drawOrder.map(r => (
            <circle
              key={r.key}
              cx={CENTER} cy={CENTER} r={RADIUS}
              fill="none" stroke={r.color}
              strokeWidth={STROKE} strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - r.fraction * progress)}
            />
          ))}
        </g>
        <text
          x={CENTER} y={CENTER}
          textAnchor="middle" dominantBaseline="central"
          className={`font-mono font-bold ${weekly > 0 ? 'fill-field-400' : weekly < 0 ? 'fill-red-300' : 'fill-turf-400'}`}
          style={{ fontSize: 22 }}
        >
          {signed(Math.round(weekly * progress))}
        </text>
      </svg>
      <div className="space-y-1 text-xs">
        {WEEK_RING_LAYERS.map(r => (
          <div key={r.key} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: r.color }} aria-hidden="true" />
            <span className="text-turf-500">{r.label}</span>
            <span className="text-turf-300 font-mono ml-auto pl-2">{signed(Math.round(values[r.key]))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Per-team scoring breakdown, one week at a time, used by the expandable
// standings row. spread_points is a component already folded into `points`
// (see calcWeeklyScore) — shown as an annotation, not added again. Each
// instance owns its own selected-week tab state, so expanding two managers'
// rows at once never lets one's week selection leak into the other's.
export function WeeklyBreakdownTable({
  entry, allEntries, currentWeek, teamsById, onOpenGameModal,
}: {
  entry: LeaderboardEntry;
  allEntries: LeaderboardEntry[];
  currentWeek: number;
  teamsById: Map<string, CfbTeam>;
  onOpenGameModal: (args: OpenGameModalArgs) => void;
}) {
  const [selectedWeek, setSelectedWeek] = useState(currentWeek);
  const weeks = useMemo(() => Array.from({ length: currentWeek + 1 }, (_, w) => w), [currentWeek]);
  const score = entry.weekly_scores.find((w: WeeklyScore) => w.week === selectedWeek);

  // Nothing in this app's scoring defines a hard cap a week's points top
  // out at — there's no fixed "max possible" anywhere in the schema — so
  // it's approximated here as the best any manager actually posted that
  // week: the real ceiling that week's game outcomes produced, not a
  // theoretical one.
  const { leagueAverage, totalPossible } = useMemo(() => {
    const weekPoints = allEntries.map(e => e.weekly_scores.find(w => w.week === selectedWeek)?.points ?? 0);
    const sum = weekPoints.reduce((s, p) => s + p, 0);
    return {
      leagueAverage: weekPoints.length > 0 ? sum / weekPoints.length : 0,
      totalPossible: weekPoints.length > 0 ? Math.max(...weekPoints) : 0,
    };
  }, [allEntries, selectedWeek]);

  // By week 17 this strip would render 18 tab buttons in one scrolling row
  // with nothing marking which one is "now" — past the ~4-choice point
  // where a decision point stops being scannable. Collapsed to the most
  // recent RECENT_WEEKS by default; "All weeks" reveals the rest without
  // losing them. Always includes selectedWeek even when collapsed, so
  // picking an older week (or this instance mounting on a bye week) never
  // hides the tab that's actually active.
  const RECENT_WEEKS = 5;
  const [showAllWeeks, setShowAllWeeks] = useState(false);
  const visibleWeeks = showAllWeeks || weeks.length <= RECENT_WEEKS
    ? weeks
    : Array.from(new Set([...weeks.slice(-RECENT_WEEKS), selectedWeek])).sort((a, b) => a - b);

  // Benched teams are excluded from both — a manager's "did my active
  // roster win" read shouldn't be diluted by teams that couldn't score
  // regardless of their real-world result.
  const activeBreakdown = score?.breakdown.filter(b => !b.is_benched) ?? [];
  const played = activeBreakdown.filter(b => b.game).length;
  const won = activeBreakdown.filter(b => b.game && b.points > 0).length;
  const captainRow = score?.breakdown.find(b => b.is_captain) ?? null;

  return (
    <div>
      <div role="tablist" aria-label="Select week" className="flex items-center gap-1 overflow-x-auto mb-3">
        {!showAllWeeks && weeks.length > RECENT_WEEKS && (
          <button
            type="button"
            onClick={() => setShowAllWeeks(true)}
            className="flex-shrink-0 px-2 py-1 rounded-md text-xs font-medium text-turf-500 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-field-400"
          >
            +{weeks.length - visibleWeeks.length} more
          </button>
        )}
        {visibleWeeks.map(w => (
          <button
            key={w}
            type="button"
            role="tab"
            aria-selected={selectedWeek === w}
            onClick={() => setSelectedWeek(w)}
            className={`flex-shrink-0 px-2.5 py-1 rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-field-400 ${
              selectedWeek === w ? 'bg-field-500 text-turf-950' : 'bg-turf-800 text-turf-400 hover:text-white'
            }`}
          >
            Wk {w}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Left: this week's ring chart plus two real, derivable stat tiles —
            no invented per-pick metrics, since this app scores drafted
            teams, not individual picks against a spread. */}
        <div className="card p-4">
          <div className="flex items-start justify-between gap-2 mb-4">
            <div>
              <p className="text-xs text-turf-500 uppercase tracking-wide">Week {selectedWeek} Breakdown</p>
              <p className="text-sm text-turf-400 mt-0.5">Team scoring this week</p>
            </div>
            {score && (
              <span className={`flex-shrink-0 ${score.points > leagueAverage ? 'badge-green' : score.points < leagueAverage ? 'badge-red' : 'badge-gray'}`}>
                {score.points > leagueAverage ? 'Above Average' : score.points < leagueAverage ? 'Below Average' : 'On Average'}
              </span>
            )}
          </div>

          <WeekPointsRings weekly={score?.points ?? 0} leagueAverage={leagueAverage} totalPossible={totalPossible} />

          <div className="grid grid-cols-2 gap-2 mt-4">
            <div className="card-inner p-3">
              <p className="text-xs text-turf-500 uppercase tracking-wide">Teams Won</p>
              <p className="font-mono font-bold text-white text-lg mt-1">{played > 0 ? `${won}/${played}` : '—'}</p>
            </div>
            <div className="card-inner p-3 min-w-0">
              <p className="text-xs text-turf-500 uppercase tracking-wide inline-flex items-center gap-1">
                <Star className="w-3 h-3 fill-amber-400 text-amber-400" aria-hidden="true" />
                Captain Pick
              </p>
              {captainRow ? (
                <p className="font-bold text-white text-sm mt-1 flex items-center gap-1.5 min-w-0">
                  <TeamLogo src={teamsById.get(captainRow.team_id)?.logo} alt="" fallbackName={captainRow.team_name} size={18} className="flex-shrink-0" />
                  <span className="truncate min-w-0 flex-1">{captainRow.team_name} ×{captainRow.captain_multiplier}</span>
                </p>
              ) : (
                <p className="font-bold text-white text-sm mt-1">—</p>
              )}
            </div>
          </div>

          <Link
            to={`/roster/${entry.user_id}`}
            className="btn-secondary btn-sm w-full mt-4 flex items-center justify-between"
          >
            View Full Roster
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </div>

        {/* Right: per-team rows, unchanged data/interactions (click for
            matchup detail, captain/spread/benched badges) — restyled from a
            plain list into boxed rows with a colored net-impact chip. */}
        <div className="card p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div>
              <p className="text-xs text-turf-500 uppercase tracking-wide">Week {selectedWeek} Matchups</p>
              <p className="text-sm text-turf-400 mt-0.5">
                {score && score.breakdown.length > 0
                  ? `${score.breakdown.length} team${score.breakdown.length === 1 ? '' : 's'} scored`
                  : 'No games this week'}
              </p>
            </div>
            {score && score.breakdown.length > 0 && (
              <span className="text-xs text-turf-600 uppercase tracking-wide flex-shrink-0">Net Impact</span>
            )}
          </div>

          {!score || score.breakdown.length === 0 ? (
            <p className="text-sm text-turf-600 text-center py-8">No games this week</p>
          ) : (
            <div
              role="table"
              aria-label={`Per-team scoring for week ${selectedWeek}`}
              className="grid grid-cols-1 sm:grid-cols-2 gap-2"
            >
              {score.breakdown.map(b => (
                <button
                  key={b.team_id}
                  type="button"
                  role="row"
                  disabled={!b.game}
                  onClick={() => b.game && onOpenGameModal({
                    game: b.game, teamId: b.team_id, teamName: b.team_name,
                    teamLogo: teamsById.get(b.team_id)?.logo ?? '', week: selectedWeek, isCaptain: b.is_captain,
                  })}
                  className={`card-inner flex items-center gap-2 p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-field-400 ${
                    b.game ? 'hover:border-turf-600' : 'cursor-default'
                  }`}
                >
                  <TeamLogo src={teamsById.get(b.team_id)?.logo} alt="" fallbackName={b.team_name} size={28} className={`flex-shrink-0 ${b.is_benched ? 'opacity-50' : ''}`} />
                  <span className={`truncate min-w-0 flex-1 ${b.is_benched ? 'text-turf-600 line-through' : 'text-turf-300'}`}>{b.team_name}</span>
                  {b.is_benched && <span className="badge-gray flex-shrink-0">Benched</span>}
                  {b.is_captain && (
                    <span className="badge-gold flex-shrink-0 inline-flex items-center gap-0.5">
                      <Star className="w-3 h-3 fill-current" aria-hidden="true" />×{b.captain_multiplier}
                    </span>
                  )}
                  {b.spread_points !== 0 && <span className="badge-purple flex-shrink-0">Spread {signed(b.spread_points)}</span>}
                  <span className={`flex-shrink-0 font-mono text-xs font-bold px-2 py-0.5 rounded-full ${
                    b.points > 0 ? 'bg-field-900/60 text-field-400' : b.points < 0 ? 'bg-red-900/60 text-red-300' : 'bg-turf-700 text-turf-400'
                  }`}>
                    {signed(b.points)}
                  </span>
                </button>
              ))}
            </div>
          )}

          {score && score.fa_points !== 0 && (
            <p className="text-xs text-red-300 mt-2">Free agency penalty: {score.fa_points}</p>
          )}
          {score && score.correction_points !== 0 && (
            <p className="text-xs text-turf-400 mt-2">Commissioner correction: {signed(score.correction_points)}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export const METRICS: MetricDef[] = [
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
    polarity: null,
    groupStart: true,
    tooltip: 'Your team that has earned the most fantasy points so far this season. Shown for context only — it is not scored against the other managers.',
    domain: null,
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

// Tier reaches the reader three ways: bar length (positional, so it survives
// colorblindness), bar color (fast to scan), and sr-only text. That is why
// there is no cell wash — colour alone used to be the only signal, and at the
// old alphas the green and red washes differed by just 1.05:1.
export const TIER_LABEL: Record<MetricTier, string> = { good: 'strong', mid: 'average', poor: 'weak', none: '' };
export const TIER_BAR: Record<MetricTier, string> = {
  good: 'bg-field-400', mid: 'bg-amber-400', poor: 'bg-red-400', none: '',
};

// One metric's value in a cell: optional team logo, the value, and a bar
// showing where that value falls on the metric's own fixed scale. Length is
// the primary encoding; color repeats it so the grid stays scannable.
export function MetricValue({ metric, a, tier, position }: {
  metric: MetricDef;
  a: RosterAnalytics;
  tier: MetricTier;
  position: number | null;
}) {
  const text = metric.display(a);
  const logo = metric.logo?.(a);
  const team = metric.team?.(a);
  return (
    <>
      <span className={`inline-flex items-center gap-1.5 ${text === '—' ? 'text-turf-500' : 'text-white'}`}>
        {logo && team && <TeamLogo src={logo} alt="" fallbackName={team} size={16} />}
        <span className="tabular-nums">{text}</span>
        {tier !== 'none' && <span className="sr-only">, {TIER_LABEL[tier]}</span>}
      </span>
      {position !== null && (
        <span className="relative mx-auto mt-1.5 block h-[3px] w-12 rounded-full bg-turf-800" aria-hidden="true">
          {/* 4% floor so the weakest value still reads as a mark rather than
              as missing data */}
          <span
            className={`absolute inset-y-0 left-0 rounded-full ${TIER_BAR[tier]}`}
            style={{ width: `${Math.max(4, position * 100)}%` }}
          />
        </span>
      )}
    </>
  );
}

export type AnalyticsTab = 'table' | 'graphs' | 'weekly';
export const ANALYTICS_TABS: AnalyticsTab[] = ['table', 'weekly', 'graphs'];
