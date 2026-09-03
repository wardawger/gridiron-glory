// Shared by every surface that prints a game's kickoff date/time — was
// duplicated (and drifted) across RosterView, GameScoreModal, ScoreboardPage,
// and DraftRoom. `includeTimeZone` defaults to true (matching three of the
// four call sites); RosterView passes false, preserving the one place a
// zone abbreviation was deliberately dropped rather than silently
// re-introducing it everywhere.
export function formatGameDate(
  startDate: string | null | undefined,
  startTimeTbd: boolean,
  includeTimeZone = true,
): { date: string; time: string } {
  if (!startDate) return { date: 'TBD', time: 'TBD' };
  const d = new Date(startDate);
  const date = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const time = startTimeTbd
    ? 'TBD'
    : d.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        ...(includeTimeZone ? { timeZoneName: 'short' as const } : {}),
      });
  return { date, time };
}
