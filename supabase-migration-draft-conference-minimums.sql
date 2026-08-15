-- ============================================================
-- Draft conference-minimum backstop — run in Supabase SQL Editor
-- Project Settings → SQL Editor → New Query → Paste → Run
-- ============================================================
--
-- The client-side "you must pick from X" guard in DraftRoom.tsx had a
-- real bug: it checked each P4 conference's remaining need against
-- picks-remaining one conference at a time, never as a sum. A drafter
-- needing 1 more team in each of SEC, Big Ten, and Big 12 (3 total) with
-- only 2 picks left never tripped the guard, since each conference's own
-- need (1) was individually less than picks-remaining (2). This let a
-- real drafter take a non-P4 team twice in the same live draft after it
-- had already become mathematically impossible to hit the league's
-- minimums, corrupting the draft state both times and requiring a manual
-- fix against production data.
--
-- The client is fixed (DraftRoom.tsx now sums remaining need across every
-- category before deciding whether a pick is "safe"), but draft_picks had
-- zero server-side validation of the conference rules at all before this
-- -- this migration adds the same aggregate check as a trigger, so a
-- future client bug (or a direct API call bypassing the UI entirely)
-- can't corrupt a draft again. Mirrors the existing
-- enforce_spread_pick_limits trigger's role for the spread-pick limits.

create or replace function public.enforce_draft_conference_limits()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
declare
  p4_min       integer;
  p4_max       integer;
  g5_min       integer;
  g5_max       integer;
  max_teams    integer;
  is_p4        boolean;
  conf_count   integer;
  g5_count     integer;
  total_picks  integer;
  total_needed integer;
  picks_left   integer;
  category_needed integer;
begin
  select
    coalesce((scoring->>'p4_conf_min')::integer, 2),
    coalesce((scoring->>'p4_conf_max')::integer, 3),
    coalesce((scoring->>'g5_conf_min')::integer, 0),
    coalesce((scoring->>'g5_conf_max')::integer, 99),
    max_teams_per_user
  into p4_min, p4_max, g5_min, g5_max, max_teams
  from public.leagues where id = NEW.league_id;

  is_p4 := NEW.team_conference in ('SEC', 'Big Ten', 'Big 12', 'ACC');

  select count(*) into total_picks
  from public.draft_picks
  where league_id = NEW.league_id and user_id = NEW.user_id;

  select count(*) into conf_count
  from public.draft_picks
  where league_id = NEW.league_id and user_id = NEW.user_id and team_conference = NEW.team_conference;

  select count(*) into g5_count
  from public.draft_picks
  where league_id = NEW.league_id and user_id = NEW.user_id
    and team_conference not in ('SEC', 'Big Ten', 'Big 12', 'ACC');

  -- Max-per-conference / max-G5 check.
  if is_p4 and conf_count >= p4_max then
    raise exception 'Max % teams from %', p4_max, NEW.team_conference;
  end if;
  if not is_p4 and g5_count >= g5_max then
    raise exception 'Max % G5/non-P4 teams', g5_max;
  end if;

  -- Aggregate minimum check: sum the still-needed count across every P4
  -- conference plus the G5 bucket, and compare against picks remaining
  -- BEFORE this one. If there's no slack, this pick has to go toward a
  -- category that's still short.
  total_needed := greatest(0, p4_min - (select count(*) from public.draft_picks where league_id = NEW.league_id and user_id = NEW.user_id and team_conference = 'SEC'))
                + greatest(0, p4_min - (select count(*) from public.draft_picks where league_id = NEW.league_id and user_id = NEW.user_id and team_conference = 'Big Ten'))
                + greatest(0, p4_min - (select count(*) from public.draft_picks where league_id = NEW.league_id and user_id = NEW.user_id and team_conference = 'Big 12'))
                + greatest(0, p4_min - (select count(*) from public.draft_picks where league_id = NEW.league_id and user_id = NEW.user_id and team_conference = 'ACC'))
                + greatest(0, g5_min - g5_count);

  picks_left := max_teams - total_picks;

  if total_needed > 0 and total_needed >= picks_left then
    category_needed := case
      when is_p4 then greatest(0, p4_min - conf_count)
      else greatest(0, g5_min - g5_count)
    end;
    if category_needed = 0 then
      raise exception 'This pick would make it impossible to satisfy the P4/G5 conference minimums with the remaining picks';
    end if;
  end if;

  return NEW;
end;
$function$;

revoke execute on function public.enforce_draft_conference_limits() from public, anon, authenticated;

drop trigger if exists draft_conference_limits_trigger on public.draft_picks;
create trigger draft_conference_limits_trigger
  before insert on public.draft_picks
  for each row
  execute function public.enforce_draft_conference_limits();

-- ============================================================
-- Verified in a rolled-back transaction, impersonating the real drafter
-- who hit this bug, at their real pre-pick state (7 picks, 3 P4
-- conferences each needing 1 more, 2 picks left): the exact illegal pick
-- (a non-P4 team) correctly raised the exception above; a legal pick
-- toward one of the still-short conferences correctly succeeded.
-- ============================================================
