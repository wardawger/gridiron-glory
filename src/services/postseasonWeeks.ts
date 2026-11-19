// CFBD files every postseason game (bowls and College Football Playoff
// rounds alike) under week 1 of its "postseason" season type. The app keys
// each team's games by week number, so left as-is those games would land on
// top of the team's real Week 1 regular-season result. Postseason games are
// therefore assigned their own week numbers, starting after the regular
// season (week 15 is Army-Navy), counted in calendar weeks from a fixed date.
//
// A team plays at most one postseason game per calendar week (the longest
// gap-free stretch is a bowl followed by nothing; CFP rounds are 9+ days
// apart), so each team still has at most one game per week number.

export const POSTSEASON_FIRST_WEEK = 16;
// Championship game lands ~5 weeks after the first bowls; one spare week.
export const LAST_SCORED_WEEK = 22;
export const REGULAR_SEASON_LAST_WEEK = 15;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Fixed anchor (Dec 13 UTC of the season's year) rather than "the first game
// in the data", so week numbers don't shift if the schedule grows after
// first publication.
function anchorMs(seasonYear: number): number {
  return Date.UTC(seasonYear, 11, 13);
}

export function postseasonWeek(startDate: string | null | undefined, seasonYear: number): number {
  if (!startDate) return POSTSEASON_FIRST_WEEK;
  const t = new Date(startDate).getTime();
  if (Number.isNaN(t)) return POSTSEASON_FIRST_WEEK;
  const offset = Math.floor((t - anchorMs(seasonYear)) / WEEK_MS);
  return Math.min(LAST_SCORED_WEEK, Math.max(POSTSEASON_FIRST_WEEK, POSTSEASON_FIRST_WEEK + offset));
}

// The season a game belongs to is the year of its regular season, which for
// January games is the previous calendar year.
export function seasonYearOf(startDate: string | null | undefined, fallbackYear: number): number {
  if (!startDate) return fallbackYear;
  const d = new Date(startDate);
  if (Number.isNaN(d.getTime())) return fallbackYear;
  return d.getUTCMonth() <= 1 ? d.getUTCFullYear() - 1 : d.getUTCFullYear();
}

// 0..LAST_SCORED_WEEK, the full range a league can score.
export const ALL_WEEKS: number[] = Array.from({ length: LAST_SCORED_WEEK + 1 }, (_, i) => i);
