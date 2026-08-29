-- ============================================================
-- RLS performance migration — run in Supabase SQL Editor
-- Project Settings → SQL Editor → New Query → Paste → Run
-- ============================================================
--
-- Fixes two categories the Supabase performance advisor flagged across
-- every RLS-protected table in this app:
--
--   1. auth_rls_initplan (36 occurrences): a bare auth.uid() inside a
--      policy's USING/WITH CHECK is re-evaluated once per row scanned.
--      Wrapping it as (select auth.uid()) turns it into a query-level
--      InitPlan Postgres evaluates exactly once, then reuses.
--
--   2. multiple_permissive_policies (35 occurrences): two or more
--      PERMISSIVE policies applying to the same table+command force
--      Postgres to evaluate and OR all of them together on every row.
--      Where this happens here it's because an "owner can X" policy and
--      a "commissioner can X" policy were written as two policies for
--      the same command, or a broad FOR ALL policy silently doubled up
--      with a dedicated SELECT policy — consolidated below into one
--      policy per command with the same conditions OR'd together, or
--      split FOR ALL into explicit INSERT/UPDATE/DELETE so it stops
--      overlapping the SELECT policy.
--
-- This changes no access-control behavior — every consolidated/rewritten
-- policy grants exactly the same rows to exactly the same callers as
-- before. It's a straight performance rewrite.

-- ── Missing foreign-key indexes (20) ────────────────────────────────────

create index if not exists idx_bench_picks_user_id            on bench_picks(user_id);
create index if not exists idx_captain_picks_user_id          on captain_picks(user_id);
create index if not exists idx_draft_picks_user_id            on draft_picks(user_id);
create index if not exists idx_free_agency_moves_league_id    on free_agency_moves(league_id);
create index if not exists idx_free_agency_moves_user_id      on free_agency_moves(user_id);
create index if not exists idx_invites_invited_by             on invites(invited_by);
create index if not exists idx_invites_league_id              on invites(league_id);
create index if not exists idx_league_members_user_id         on league_members(user_id);
create index if not exists idx_leagues_created_by             on leagues(created_by);
create index if not exists idx_manual_bonuses_awarded_by      on manual_bonuses(awarded_by);
create index if not exists idx_manual_bonuses_league_id       on manual_bonuses(league_id);
create index if not exists idx_manual_bonuses_user_id         on manual_bonuses(user_id);
create index if not exists idx_score_corrections_created_by   on score_corrections(created_by);
create index if not exists idx_score_corrections_league_id    on score_corrections(league_id);
create index if not exists idx_score_corrections_user_id      on score_corrections(user_id);
create index if not exists idx_season_history_archived_by     on season_history(archived_by);
create index if not exists idx_season_history_league_id       on season_history(league_id);
create index if not exists idx_waiver_claims_league_id        on waiver_claims(league_id);
create index if not exists idx_waiver_claims_resulting_move_id on waiver_claims(resulting_move_id);
create index if not exists idx_waiver_claims_user_id           on waiver_claims(user_id);

-- ── bench_picks ──────────────────────────────────────────────────────────

drop policy if exists "Members can read bench picks in their league" on bench_picks;
create policy "Members can read bench picks in their league"
  on bench_picks for select
  using (league_id in (select league_id from league_members where user_id = (select auth.uid())));

drop policy if exists "Users can insert their own bench picks" on bench_picks;
create policy "Users can insert their own bench picks"
  on bench_picks for insert
  with check (user_id = (select auth.uid()));

drop policy if exists "Commissioners can update any bench pick" on bench_picks;
drop policy if exists "Users can update their own bench picks" on bench_picks;
create policy "Users and commissioners can update bench picks"
  on bench_picks for update
  using (
    user_id = (select auth.uid())
    or league_id in (select league_id from league_members where user_id = (select auth.uid()) and role = 'commissioner')
  );

drop policy if exists "Commissioner can delete bench picks" on bench_picks;
drop policy if exists "Users can delete their own bench picks" on bench_picks;
create policy "Users and commissioners can delete bench picks"
  on bench_picks for delete
  using (
    user_id = (select auth.uid())
    or league_id in (select league_id from league_members where user_id = (select auth.uid()) and role = 'commissioner')
  );

-- ── captain_picks ────────────────────────────────────────────────────────
-- Was one FOR ALL "own picks" policy plus a dedicated SELECT policy — the
-- ALL policy's implicit SELECT silently doubled up with the SELECT policy.
-- Split into explicit INSERT/UPDATE/DELETE so only one policy applies per
-- command.

drop policy if exists "Users can manage their own captain picks" on captain_picks;
create policy "Users can insert their own captain picks"
  on captain_picks for insert
  with check (user_id = (select auth.uid()));
create policy "Users can update their own captain picks"
  on captain_picks for update
  using (user_id = (select auth.uid()));
create policy "Users can delete their own captain picks"
  on captain_picks for delete
  using (user_id = (select auth.uid()));

drop policy if exists "Members can view all captain picks in their league" on captain_picks;
create policy "Members can view all captain picks in their league"
  on captain_picks for select
  using (league_id in (select league_id from league_members where user_id = (select auth.uid())));

-- ── draft_picks ──────────────────────────────────────────────────────────

drop policy if exists "Commissioner can remove draft picks" on draft_picks;
create policy "Commissioner can remove draft picks"
  on draft_picks for delete
  using (league_id in (select league_id from league_members where user_id = (select auth.uid()) and role = 'commissioner'));

drop policy if exists "Users can make their own draft picks" on draft_picks;
create policy "Users can make their own draft picks"
  on draft_picks for insert
  with check (
    user_id = (select auth.uid())
    and league_id in (select league_id from league_members where user_id = (select auth.uid()))
  );

drop policy if exists "Members can view all draft picks in their league" on draft_picks;
create policy "Members can view all draft picks in their league"
  on draft_picks for select
  using (league_id in (select league_id from league_members where user_id = (select auth.uid())));

-- ── free_agency_moves ────────────────────────────────────────────────────

drop policy if exists "Commissioner can delete free agency moves" on free_agency_moves;
create policy "Commissioner can delete free agency moves"
  on free_agency_moves for delete
  using (league_id in (select league_id from league_members where user_id = (select auth.uid()) and role = 'commissioner'));

drop policy if exists "Users can make their own free agency moves" on free_agency_moves;
create policy "Users can make their own free agency moves"
  on free_agency_moves for insert
  with check (
    user_id = (select auth.uid())
    and league_id in (select league_id from league_members where user_id = (select auth.uid()))
  );

drop policy if exists "Members can view all free agency moves in their league" on free_agency_moves;
create policy "Members can view all free agency moves in their league"
  on free_agency_moves for select
  using (league_id in (select league_id from league_members where user_id = (select auth.uid())));

-- ── invites ──────────────────────────────────────────────────────────────
-- SELECT policy already uses is_league_commissioner(league_id) — a
-- per-row-varying argument means that call can't be hoisted regardless,
-- so it's left untouched. Only INSERT has a bare auth.uid().

drop policy if exists "Commissioner can create invites" on invites;
create policy "Commissioner can create invites"
  on invites for insert
  with check (league_id in (select league_id from league_members where user_id = (select auth.uid()) and role = 'commissioner'));

-- ── league_members ───────────────────────────────────────────────────────
-- DELETE policy already uses only is_league_commissioner(league_id), left
-- untouched for the same reason as invites' SELECT policy above.

drop policy if exists "Users can join leagues" on league_members;
create policy "Users can join leagues"
  on league_members for insert
  with check (
    user_id = (select auth.uid())
    and (role = 'member' or is_league_creator(league_id))
  );

drop policy if exists "Members can view all members in their league" on league_members;
create policy "Members can view all members in their league"
  on league_members for select
  using (user_id = (select auth.uid()) or is_league_member(league_id));

drop policy if exists "Members and commissioners can update memberships" on league_members;
create policy "Members and commissioners can update memberships"
  on league_members for update
  using (user_id = (select auth.uid()) or is_league_commissioner(league_id))
  with check (user_id = (select auth.uid()) or is_league_commissioner(league_id));

-- ── leagues ──────────────────────────────────────────────────────────────

drop policy if exists "Commissioner can delete league" on leagues;
create policy "Commissioner can delete league"
  on leagues for delete
  using (id in (select league_id from league_members where user_id = (select auth.uid()) and role = 'commissioner'));

drop policy if exists "Authenticated users can create leagues" on leagues;
create policy "Authenticated users can create leagues"
  on leagues for insert
  with check ((select auth.uid()) = created_by);

drop policy if exists "Members can view their league" on leagues;
create policy "Members can view their league"
  on leagues for select
  using (is_league_member(id) or created_by = (select auth.uid()));

drop policy if exists "Members can update their league" on leagues;
create policy "Members can update their league"
  on leagues for update
  using (is_league_member(id) or created_by = (select auth.uid()))
  with check (is_league_member(id) or created_by = (select auth.uid()));

-- ── manual_bonuses ───────────────────────────────────────────────────────
-- Same FOR ALL / SELECT overlap as captain_picks — split.

drop policy if exists "Commissioner can manage bonuses" on manual_bonuses;
create policy "Commissioner can insert bonuses"
  on manual_bonuses for insert
  with check (league_id in (select league_id from league_members where user_id = (select auth.uid()) and role = 'commissioner'));
create policy "Commissioner can update bonuses"
  on manual_bonuses for update
  using (league_id in (select league_id from league_members where user_id = (select auth.uid()) and role = 'commissioner'));
create policy "Commissioner can delete bonuses"
  on manual_bonuses for delete
  using (league_id in (select league_id from league_members where user_id = (select auth.uid()) and role = 'commissioner'));

drop policy if exists "Members can view bonuses in their league" on manual_bonuses;
create policy "Members can view bonuses in their league"
  on manual_bonuses for select
  using (league_id in (select league_id from league_members where user_id = (select auth.uid())));

-- ── score_corrections ────────────────────────────────────────────────────
-- Same FOR ALL / SELECT overlap as captain_picks — split.

drop policy if exists "Commissioner can manage score corrections" on score_corrections;
create policy "Commissioner can insert score corrections"
  on score_corrections for insert
  with check (league_id in (select league_id from league_members where user_id = (select auth.uid()) and role = 'commissioner'));
create policy "Commissioner can update score corrections"
  on score_corrections for update
  using (league_id in (select league_id from league_members where user_id = (select auth.uid()) and role = 'commissioner'));
create policy "Commissioner can delete score corrections"
  on score_corrections for delete
  using (league_id in (select league_id from league_members where user_id = (select auth.uid()) and role = 'commissioner'));

drop policy if exists "Members can view score corrections in their league" on score_corrections;
create policy "Members can view score corrections in their league"
  on score_corrections for select
  using (league_id in (select league_id from league_members where user_id = (select auth.uid())));

-- ── season_history ───────────────────────────────────────────────────────

drop policy if exists "Commissioners can archive a season" on season_history;
create policy "Commissioners can archive a season"
  on season_history for insert
  with check (
    archived_by = (select auth.uid())
    and league_id in (select league_id from league_members where user_id = (select auth.uid()) and role = 'commissioner')
  );

drop policy if exists "Members can view their league's season history" on season_history;
create policy "Members can view their league's season history"
  on season_history for select
  using (league_id in (select league_id from league_members where user_id = (select auth.uid())));

-- ── spread_picks ─────────────────────────────────────────────────────────

drop policy if exists "Members can read spread picks in their league" on spread_picks;
create policy "Members can read spread picks in their league"
  on spread_picks for select
  using (league_id in (select league_id from league_members where user_id = (select auth.uid())));

drop policy if exists "Users can insert their own spread picks" on spread_picks;
create policy "Users can insert their own spread picks"
  on spread_picks for insert
  with check (user_id = (select auth.uid()));

drop policy if exists "Commissioners can update any spread pick" on spread_picks;
drop policy if exists "Users can update their own spread picks" on spread_picks;
create policy "Users and commissioners can update spread picks"
  on spread_picks for update
  using (
    user_id = (select auth.uid())
    or league_id in (select league_id from league_members where user_id = (select auth.uid()) and role = 'commissioner')
  );

drop policy if exists "Commissioner can delete spread picks" on spread_picks;
drop policy if exists "Users can delete their own spread picks" on spread_picks;
create policy "Users and commissioners can delete spread picks"
  on spread_picks for delete
  using (
    user_id = (select auth.uid())
    or league_id in (select league_id from league_members where user_id = (select auth.uid()) and role = 'commissioner')
  );

-- ── waiver_claims ────────────────────────────────────────────────────────

drop policy if exists "Users can submit their own waiver claims" on waiver_claims;
create policy "Users can submit their own waiver claims"
  on waiver_claims for insert
  with check (
    user_id = (select auth.uid())
    and league_id in (select league_id from league_members where user_id = (select auth.uid()))
  );

drop policy if exists "Members can view all waiver claims in their league" on waiver_claims;
create policy "Members can view all waiver claims in their league"
  on waiver_claims for select
  using (league_id in (select league_id from league_members where user_id = (select auth.uid())));
