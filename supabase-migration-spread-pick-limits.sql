-- ============================================================
-- Spread pick limit enforcement migration — run in Supabase SQL Editor
-- Project Settings → SQL Editor → New Query → Paste → Run
-- ============================================================
--
-- Today, the weekly and season-per-team spread pick limits
-- (scoring.spread_max_per_week / scoring.spread_max_per_team) are only
-- checked client-side, against whatever spread_picks rows happen to be
-- cached in the browser at the moment. Two picks submitted close enough
-- together (rapid clicks, a slow network response, multiple tabs) can both
-- pass that check before either one's result comes back, letting a user
-- end up with more picks in a week — or on one team for the season — than
-- the league allows, with no way to fix it except manually deleting rows.
--
-- This adds a database trigger as the authoritative backstop: it reads the
-- league's current scoring settings and rejects any insert/update that
-- would exceed either limit, no matter how the request got there. The
-- client-side check in useSpreadPicks.ts stays as-is — it's still useful
-- for immediate UI feedback — this is just the guarantee behind it.

create or replace function enforce_spread_pick_limits()
returns trigger as $$
declare
  max_per_week integer;
  max_per_team integer;
  week_count   integer;
  team_count   integer;
begin
  select
    coalesce((scoring->>'spread_max_per_week')::integer, 2),
    coalesce((scoring->>'spread_max_per_team')::integer, 3)
  into max_per_week, max_per_team
  from leagues where id = NEW.league_id;

  select count(*) into week_count
  from spread_picks
  where league_id = NEW.league_id
    and user_id   = NEW.user_id
    and week      = NEW.week
    and team_id  <> NEW.team_id
    and (TG_OP = 'INSERT' or id <> NEW.id);

  if week_count >= max_per_week then
    raise exception 'You can only make % spread picks per week', max_per_week;
  end if;

  select count(*) into team_count
  from spread_picks
  where league_id = NEW.league_id
    and user_id   = NEW.user_id
    and team_id   = NEW.team_id
    and week     <> NEW.week
    and (TG_OP = 'INSERT' or id <> NEW.id);

  if team_count >= max_per_team then
    raise exception 'This team has reached the season spread limit (%)', max_per_team;
  end if;

  return NEW;
end;
$$ language plpgsql;

drop trigger if exists spread_pick_limits_trigger on spread_picks;
create trigger spread_pick_limits_trigger
  before insert or update on spread_picks
  for each row
  execute function enforce_spread_pick_limits();

-- ============================================================
-- Note: this checks counts within a single transaction, which closes the
-- race window observed in practice (same-tab double-clicks, slow
-- responses). It does not use SERIALIZABLE isolation or explicit locking,
-- so it isn't airtight against two genuinely concurrent transactions
-- committing at the exact same instant — a gap not worth closing further
-- for a personal league's usage pattern, but worth knowing about.
-- ============================================================
