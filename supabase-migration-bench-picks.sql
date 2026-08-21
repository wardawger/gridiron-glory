-- ============================================================
-- Starters / Bench weekly lineups migration — run in Supabase SQL Editor
-- Project Settings → SQL Editor → New Query → Paste → Run
-- ============================================================
--
-- Adds an optional per-league "bench" feature: each roster splits into a
-- fixed number of starters (score that week) and bench (don't). A row in
-- bench_picks means that team is benched for that user that week; absence
-- means it's a starter. Mirrors spread_picks' table shape and RLS (the
-- more recently security-audited pattern, not captain_picks' original
-- looser one) rather than introducing a new access pattern.
--
-- The kickoff lock ("can't change once the team's game has started") is
-- the same accepted client-only gap as captain_picks/spread_picks today —
-- game start times live in CFBD data fetched live, never persisted here,
-- so Postgres has nothing to check it against.

create table bench_picks (
  id          uuid primary key default gen_random_uuid(),
  league_id   uuid references leagues(id) on delete cascade,
  user_id     uuid references auth.users(id),
  team_id     text not null,
  week        integer not null,
  picked_at   timestamptz default now(),
  unique(league_id, user_id, team_id, week)
);

alter table bench_picks enable row level security;

create policy "Members can read bench picks in their league"
  on bench_picks for select
  using (league_id in (
    select league_id from league_members where user_id = auth.uid()
  ));

create policy "Users can insert their own bench picks"
  on bench_picks for insert
  with check (user_id = auth.uid());

create policy "Users can update their own bench picks"
  on bench_picks for update
  using (user_id = auth.uid());

create policy "Users can delete their own bench picks"
  on bench_picks for delete
  using (user_id = auth.uid());

create policy "Commissioners can update any bench pick"
  on bench_picks for update
  using (league_id in (
    select league_id from league_members
    where user_id = auth.uid() and role = 'commissioner'
  ));

create policy "Commissioner can delete bench picks"
  on bench_picks for delete
  using (league_id in (
    select league_id from league_members
    where user_id = auth.uid() and role = 'commissioner'
  ));

alter publication supabase_realtime add table bench_picks;

-- ── Weekly count backstop ──────────────────────────────────────────────
-- Same rationale as enforce_spread_pick_limits: useBenchPicks.ts checks
-- the exact-count invariant client-side before swapping, but two rapid
-- inserts (double-click, multiple tabs) could both pass that check before
-- either result comes back. This rejects an insert that would push a
-- user's bench count for the week past the league's configured bench_count.

-- search_path pinned per this session's established fix for
-- enforce_spread_pick_limits (see supabase-migration-security-hardening.sql)
-- — a mutable search_path on a SECURITY DEFINER-adjacent trigger function
-- lets a caller able to create objects earlier in the path shadow the
-- tables it reads.
create or replace function enforce_bench_pick_limits()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  max_bench  integer;
  week_count integer;
begin
  select coalesce((scoring->>'bench_count')::integer, 0)
  into max_bench
  from leagues where id = NEW.league_id;

  select count(*) into week_count
  from bench_picks
  where league_id = NEW.league_id
    and user_id   = NEW.user_id
    and week      = NEW.week
    and team_id  <> NEW.team_id
    and (TG_OP = 'INSERT' or id <> NEW.id);

  if week_count >= max_bench then
    raise exception 'You can only bench % teams per week', max_bench;
  end if;

  return NEW;
end;
$$;

drop trigger if exists bench_pick_limits_trigger on bench_picks;
create trigger bench_pick_limits_trigger
  before insert or update on bench_picks
  for each row
  execute function enforce_bench_pick_limits();

-- ── League scoring invariant backstop ──────────────────────────────────
-- The commissioner UI (CreateLeaguePage/ScoringTab) checks starters+bench
-- equals max_teams_per_user before saving, but a CHECK constraint closes
-- the same gap as every other client-only validation in this app: it's
-- evaluated on every insert/update of leagues regardless of how the row
-- got there. NULL (bench_enabled absent, e.g. existing leagues) is treated
-- as satisfied — a CHECK only rejects a row when the expression is
-- explicitly false.

alter table leagues add constraint bench_counts_valid check (
  not coalesce((scoring->>'bench_enabled')::boolean, false)
  or (
    coalesce((scoring->>'starters_count')::integer, 0)
    + coalesce((scoring->>'bench_count')::integer, 0)
  ) = max_teams_per_user
);

-- ============================================================
-- Note: the weekly-count trigger checks within a single transaction, same
-- caveat as enforce_spread_pick_limits — it closes the practical race
-- window (same-tab double-clicks, slow responses) without full
-- SERIALIZABLE isolation. Not worth tightening further for a personal
-- league's usage pattern.
-- ============================================================
