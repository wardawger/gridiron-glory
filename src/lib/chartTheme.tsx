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
export const CHART_AXIS_TICK = { fill: '#6c757d', fontSize: 11 };  // turf-600

export const legendFormatter = (value: string) => <span style={{ color: '#adb5bd' }}>{value}</span>;
