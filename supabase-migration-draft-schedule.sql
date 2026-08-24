-- ============================================================
-- Scheduled draft date/time migration — run in Supabase SQL Editor
-- Project Settings → SQL Editor → New Query → Paste → Run
-- ============================================================
--
-- Adds an optional timestamp a commissioner can set for when the draft is
-- planned to start. Purely informational — it drives a countdown clock in
-- the Draft Room's pre-draft screen, but does not auto-start anything;
-- "Start Draft" stays a deliberate commissioner action. NULL means no
-- schedule has been set (the common case, and the default for every
-- existing league).

alter table leagues add column if not exists draft_scheduled_at timestamptz;
