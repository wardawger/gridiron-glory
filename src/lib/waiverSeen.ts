// Client-side "seen" tracking for waiver claim resolutions — purely a UI
// convenience for the Header notification badge (no DB column, no
// commissioner setting), so it's fine that this doesn't sync across devices.

function storageKey(leagueId: string, userId: string): string {
  return `gridiron_seen_waivers_${leagueId}_${userId}`;
}

export function getSeenWaiverClaimIds(leagueId: string, userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey(leagueId, userId));
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

// Marks the given claim ids as seen, pruning any previously-seen id that no
// longer appears in currentClaimIds so the stored set doesn't grow
// unbounded over a league's lifetime.
export function markWaiverClaimsSeen(
  leagueId: string, userId: string, claimIdsToMark: string[], currentClaimIds: Set<string>,
): void {
  try {
    const existing = getSeenWaiverClaimIds(leagueId, userId);
    const next = new Set<string>();
    existing.forEach(id => { if (currentClaimIds.has(id)) next.add(id); });
    claimIdsToMark.forEach(id => next.add(id));
    localStorage.setItem(storageKey(leagueId, userId), JSON.stringify(Array.from(next)));
  } catch { /* localStorage unavailable — badge just won't persist across reloads */ }
}
