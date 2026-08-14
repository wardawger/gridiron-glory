-- ============================================================
-- cfbd_cache deny-all policy — run in Supabase SQL Editor
-- Project Settings → SQL Editor → New Query → Paste → Run
-- ============================================================
--
-- Clears the Security Advisor's "RLS Enabled No Policy" info notice on
-- cfbd_cache. That table is a server-side cache written only by
-- cfbd-proxy.mjs using the service-role key, which bypasses RLS entirely
-- regardless of any policy defined here -- with zero policies, RLS was
-- already denying every row to every other role by default. The linter
-- can't distinguish "locked down on purpose" from "forgot a policy" from
-- the outside, since both look identical (a protected table with nothing
-- granted). This adds an explicit deny-all policy so the intent is on
-- record, without changing actual access.
--
-- Verified no behavior change by impersonating a real authenticated user
-- inside a rolled-back transaction both before and after: 0 rows visible
-- either way.

create policy "No client access to cfbd_cache"
  on public.cfbd_cache
  for all
  to public
  using (false);
