-- ============================================================
-- Delete League migration — run in Supabase SQL Editor
-- Project Settings → SQL Editor → New Query → Paste → Run
-- ============================================================
-- The `leagues` table has no DELETE policy at all today, so a
-- commissioner-triggered delete would be blocked outright. Everything
-- that references leagues(id) with ON DELETE CASCADE in
-- supabase-setup.sql (league_members, draft_picks, captain_picks,
-- manual_bonuses, invites) gets cleaned up automatically once the
-- league row itself can be deleted — cascades aren't subject to RLS.
--
-- spread_picks and free_agency_moves are deleted explicitly by the
-- app before the league row goes, as a safety net in case either
-- table's cascade isn't configured the same way. These policies make
-- that explicit delete possible for the commissioner.

create policy "Commissioner can delete league"
  on leagues for delete
  using (id in (
    select league_id from league_members
    where user_id = auth.uid() and role = 'commissioner'
  ));

create policy "Commissioner can delete spread picks"
  on spread_picks for delete
  using (league_id in (
    select league_id from league_members
    where user_id = auth.uid() and role = 'commissioner'
  ));

create policy "Commissioner can delete free agency moves"
  on free_agency_moves for delete
  using (league_id in (
    select league_id from league_members
    where user_id = auth.uid() and role = 'commissioner'
  ));
