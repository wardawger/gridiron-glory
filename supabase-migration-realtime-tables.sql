-- ============================================================
-- Enable realtime for spread_picks and manual_bonuses
-- Run in Supabase SQL Editor
-- ============================================================
-- draft_picks, leagues, captain_picks, and free_agency_moves are
-- already in the supabase_realtime publication (confirmed via
-- select tablename from pg_publication_tables where pubname = 'supabase_realtime';)
-- but spread_picks and manual_bonuses were missing, so changes to
-- those tables never push live to other viewers — same class of
-- silent staleness as the draft_picks issue, just not yet reported.
--
-- If either statement errors saying the table is already a member,
-- that's fine — it just means it was already added.

alter publication supabase_realtime add table spread_picks;
alter publication supabase_realtime add table manual_bonuses;
