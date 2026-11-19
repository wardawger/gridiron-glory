import { describe, it, expect } from 'vitest';
import { postseasonWeek, seasonYearOf, POSTSEASON_FIRST_WEEK, LAST_SCORED_WEEK } from './postseasonWeeks';

describe('postseasonWeek (2026 season)', () => {
  const wk = (iso: string) => postseasonWeek(iso, seasonYearOf(iso, 2026));

  it('puts early bowls in the first postseason week', () => {
    expect(wk('2026-12-13T18:00:00Z')).toBe(16);
    expect(wk('2026-12-12T20:00:00Z')).toBe(16); // before anchor clamps up
  });

  it('keeps a team\'s CFP rounds in distinct weeks', () => {
    const firstRound = wk('2026-12-20T20:00:00Z');
    const quarter = wk('2026-12-31T20:00:00Z');
    const semi = wk('2027-01-08T00:30:00Z');
    const final = wk('2027-01-19T01:30:00Z');
    expect(new Set([firstRound, quarter, semi, final]).size).toBe(4);
    expect([firstRound, quarter, semi, final]).toEqual([...[firstRound, quarter, semi, final]].sort((a, b) => a - b));
  });

  it('never collides with the regular season and stays in range', () => {
    for (const iso of ['2026-12-13T00:00:00Z', '2027-01-19T01:30:00Z', '2027-02-10T00:00:00Z']) {
      const w = wk(iso);
      expect(w).toBeGreaterThanOrEqual(POSTSEASON_FIRST_WEEK);
      expect(w).toBeLessThanOrEqual(LAST_SCORED_WEEK);
    }
  });

  it('falls back to the first postseason week on a missing or invalid date', () => {
    expect(postseasonWeek('', 2026)).toBe(POSTSEASON_FIRST_WEEK);
    expect(postseasonWeek('nonsense', 2026)).toBe(POSTSEASON_FIRST_WEEK);
  });

  it('treats January games as part of the prior season', () => {
    expect(seasonYearOf('2027-01-08T00:30:00Z', 2026)).toBe(2026);
    expect(seasonYearOf('2026-12-31T20:00:00Z', 2026)).toBe(2026);
  });
});
