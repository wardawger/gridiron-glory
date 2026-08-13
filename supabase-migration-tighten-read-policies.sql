-- ============================================================
-- Read-policy tightening migration — run in Supabase SQL Editor
-- Project Settings → SQL Editor → New Query → Paste → Run
-- ============================================================
--
-- Follow-up to supabase-migration-security-hardening.sql, which closed the
-- write-side authorization holes but deliberately left the read side alone
-- so the urgent fix stayed small.
--
-- Before this, leagues.SELECT and league_members.SELECT were both
-- USING (true): any signed-in user could enumerate every league in the
-- database along with its scoring settings, and every membership row in
-- it — display names, user ids, and who commissions what.
--
-- Verified after applying, by impersonating a real member inside a rolled
-- back transaction (set local role authenticated + request.jwt.claims):
-- that member now sees 1 league of 10, 3 membership rows of 20, and 30
-- draft picks of 80. Anonymous callers get [] from both tables.

create or replace function public.is_league_member(p_league_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from public.league_members
    where league_id = p_league_id
      and user_id   = auth.uid()
  );
$$;

-- SECURITY DEFINER so the policy on league_members can call this without
-- re-entering league_members' own RLS and recursing forever. anon is left
-- out on purpose: no anonymous path reaches a policy that calls it, since
-- the /join flow goes through get_invite_by_token, which runs as its
-- definer. `authenticated` does need it — RLS policy expressions evaluate
-- with the querying role's privileges.
revoke execute on function public.is_league_member(uuid) from public;
grant  execute on function public.is_league_member(uuid) to authenticated;

-- The `created_by` disjunct is load-bearing, not belt-and-braces:
-- createLeague() inserts the league and reads it straight back with
-- .select().single() BEFORE inserting the founding league_members row, so
-- at that moment the creator is not yet a member and a membership-only
-- policy would break league creation outright.
drop policy if exists "Members can view their league" on public.leagues;

create policy "Members can view their league"
  on public.leagues for select
  using (public.is_league_member(id) or created_by = auth.uid());

-- The user_id disjunct short-circuits for your own row without a function
-- call. It also keeps the `league_id IN (SELECT league_id FROM
-- league_members WHERE user_id = auth.uid())` subqueries that other
-- tables' policies rely on working — RLS applies to those subqueries too,
-- so your own membership rows have to stay visible for them to resolve.
drop policy if exists "Members can view all members in their league" on public.league_members;

create policy "Members can view all members in their league"
  on public.league_members for select
  using (user_id = auth.uid() or public.is_league_member(league_id));

-- ============================================================
-- Still open after this migration, by choice:
--   * draft_picks.INSERT doesn't enforce turn order at the database level
--     (any member of a league can insert a pick at any time). That's game
--     integrity rather than security, and it requires already being in the
--     league.
-- ============================================================
