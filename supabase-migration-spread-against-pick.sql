-- ============================================================
-- Against-the-spread picks migration — run in Supabase SQL Editor
-- Project Settings → SQL Editor → New Query → Paste → Run
-- ============================================================
--
-- Adds a `side` column to spread_picks so a user can bet that a team will
-- NOT cover the spread, not just that it will cover. Existing rows all
-- default to 'cover', which matches how every pick made before this
-- migration was implicitly scored.
--
-- No change is needed for the `result` column (still plain text) to allow
-- the new 'push' value alongside the existing 'covered'/'missed' — a push
-- (the actual margin lands exactly on the line) now always resolves to
-- zero points either way, regardless of which side was picked.

alter table spread_picks
  add column if not exists side text not null default 'cover';

alter table spread_picks
  add constraint spread_picks_side_check check (side in ('cover', 'against'));
