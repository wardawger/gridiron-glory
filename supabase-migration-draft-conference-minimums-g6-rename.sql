-- ============================================================
-- Fix enforce_draft_conference_limits after the G5→G6 rename
-- run in Supabase SQL Editor
-- ============================================================
--
-- supabase-migration-g6-rename.sql renamed leagues.scoring's
-- g5_conf_min/g5_conf_max keys to g6_conf_min/g6_conf_max, but this
-- trigger (installed by supabase-migration-draft-conference-minimums.sql)
-- still read the old key names directly from the jsonb column. Left
-- unfixed, every read of scoring->>'g5_conf_min'/'g5_conf_max' would
-- silently come back null and coalesce to the hardcoded defaults (0/99,
-- meaning "no limit"), regardless of what a commissioner had actually
-- configured — a client/server mismatch that would let a direct API call
-- bypass a real, intentionally-configured G6 draft quota. Same trigger
-- logic, just reading the renamed keys.

create or replace function public.enforce_draft_conference_limits()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
declare
  p4_min       integer;
  p4_max       integer;
  g6_min       integer;
  g6_max       integer;
  max_teams    integer;
  is_p4        boolean;
  conf_count   integer;
  g6_count     integer;
  total_picks  integer;
  total_needed integer;
  picks_left   integer;
  category_needed integer;
begin
  select
    coalesce((scoring->>'p4_conf_min')::integer, 2),
    coalesce((scoring->>'p4_conf_max')::integer, 3),
    coalesce((scoring->>'g6_conf_min')::integer, 0),
    coalesce((scoring->>'g6_conf_max')::integer, 99),
    max_teams_per_user
  into p4_min, p4_max, g6_min, g6_max, max_teams
  from public.leagues where id = NEW.league_id;

  is_p4 := NEW.team_conference in ('SEC', 'Big Ten', 'Big 12', 'ACC');

  select count(*) into total_picks
  from public.draft_picks
  where league_id = NEW.league_id and user_id = NEW.user_id;

  select count(*) into conf_count
  from public.draft_picks
  where league_id = NEW.league_id and user_id = NEW.user_id and team_conference = NEW.team_conference;

  select count(*) into g6_count
  from public.draft_picks
  where league_id = NEW.league_id and user_id = NEW.user_id
    and team_conference not in ('SEC', 'Big Ten', 'Big 12', 'ACC');

  -- Max-per-conference / max-G6 check.
  if is_p4 and conf_count >= p4_max then
    raise exception 'Max % teams from %', p4_max, NEW.team_conference;
  end if;
  if not is_p4 and g6_count >= g6_max then
    raise exception 'Max % G6/non-P4 teams', g6_max;
  end if;

  -- Aggregate minimum check: sum the still-needed count across every P4
  -- conference plus the G6 bucket, and compare against picks remaining
  -- BEFORE this one. If there's no slack, this pick has to go toward a
  -- category that's still short.
  total_needed := greatest(0, p4_min - (select count(*) from public.draft_picks where league_id = NEW.league_id and user_id = NEW.user_id and team_conference = 'SEC'))
                + greatest(0, p4_min - (select count(*) from public.draft_picks where league_id = NEW.league_id and user_id = NEW.user_id and team_conference = 'Big Ten'))
                + greatest(0, p4_min - (select count(*) from public.draft_picks where league_id = NEW.league_id and user_id = NEW.user_id and team_conference = 'Big 12'))
                + greatest(0, p4_min - (select count(*) from public.draft_picks where league_id = NEW.league_id and user_id = NEW.user_id and team_conference = 'ACC'))
                + greatest(0, g6_min - g6_count);

  picks_left := max_teams - total_picks;

  if total_needed > 0 and total_needed >= picks_left then
    category_needed := case
      when is_p4 then greatest(0, p4_min - conf_count)
      else greatest(0, g6_min - g6_count)
    end;
    if category_needed = 0 then
      raise exception 'This pick would make it impossible to satisfy the P4/G6 conference minimums with the remaining picks';
    end if;
  end if;

  return NEW;
end;
$function$;
