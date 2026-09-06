// Shared Recharts theming.
//
// Recharts' tooltip and legend only accept inline styles, so a chart can't
// reach the Tailwind turf tokens through a class. Each chart therefore
// hardcoded its own hex values, and they drifted: the Trophy Case chart
// still used #21262d/#30363d while the standings chart had been corrected
// to the real turf-900/turf-700 values. Both now read from here.

// One color per manager, assigned by index. Callers with more managers than
// colors must wrap: PLAYER_COLORS[i % PLAYER_COLORS.length].
export const PLAYER_COLORS = ['#f59e0b', '#60a5fa', '#a78bfa', '#34d399', '#f87171', '#fb923c'];

export const CHART_TOOLTIP_STYLE = {
  background: '#212529',        // turf-900
  border: '1px solid #495057',  // turf-700
  borderRadius: 8,
  fontSize: 12,
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
};
export const CHART_TOOLTIP_LABEL = { color: '#fff', marginBottom: 4, fontWeight: 600 };
export const CHART_TOOLTIP_ITEM = { color: '#adb5bd' };            // turf-500
export const CHART_AXIS_TICK = { fill: '#6c757d', fontSize: 12 };  // turf-600 — 12px is the readable floor

// Series color for manager index i. Wraps, so a league larger than the
// palette keeps cycling instead of handing every extra manager the same
// fallback (or, where the caller forgot a fallback, no color at all).
export const seriesColor = (i: number) => PLAYER_COLORS[i % PLAYER_COLORS.length];

// Dash pattern per manager index, for multi-series line charts. Two
// managers can legitimately have identical cumulative totals for a
// stretch of weeks (e.g. the same win/loss record early in a season) —
// when that happens, whichever <Line> renders last paints directly over
// the other's identical path, making the earlier one invisible even
// though its data and legend entry are both correct. A distinct dash
// pattern per series means an overlapping line still shows through the
// gaps instead of disappearing entirely. undefined (index 0) keeps the
// most common case — no overlap — reading as a plain solid line.
const SERIES_DASH = [undefined, '6 3', '2 3', '8 3 2 3', '3 6', '1 3'];
export const seriesDash = (i: number) => SERIES_DASH[i % SERIES_DASH.length];
export const CHART_GRID = '#495057';              // turf-700 — grids, cursors, reference lines
export const CHART_MUTED = '#adb5bd';             // turf-500 — legend/secondary label text
export const CHART_SURFACE = '#0d1117';           // turf-950 — page behind the chart
export const CHART_BAND = '#ffffff';              // low-opacity fill for alternating-week bands

export const legendFormatter = (value: string) => <span style={{ color: '#adb5bd' }}>{value}</span>;
