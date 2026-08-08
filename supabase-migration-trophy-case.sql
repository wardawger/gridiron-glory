-- ============================================================
-- Trophy Case migration — run in Supabase SQL Editor
-- Project Settings → SQL Editor → New Query → Paste → Run
-- ============================================================

alter table season_history add column trophies jsonb;

-- Nullable — existing archived rows simply have no trophy snapshot.
-- Going forward, endSeason() populates this with a TrophySnapshot
-- (src/types/index.ts) computed by src/services/trophies.ts before the
-- underlying draft_picks/captain_picks/spread_picks/manual_bonuses/
-- free_agency_moves rows are deleted.
-- ============================================================
