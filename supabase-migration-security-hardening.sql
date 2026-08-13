-- ============================================================
-- Security hardening migration — run in Supabase SQL Editor
-- Project Settings → SQL Editor → New Query → Paste → Run
-- ============================================================
--
-- Closes a set of authorization holes found in a security audit of the
-- live database. The headline issue: the policy named "Commissioner can
-- manage members" on league_members was written as `FOR ALL USING (true)`.
-- The name said commissioner; the rule said everyone. Because Postgres
-- combines permissive policies with OR, that `true` overrode the correct
-- policy sitting next to it.
--
-- The `guard_role_change` trigger did block role escalation, but only
-- `BEFORE UPDATE` — so nothing stopped an attacker from INSERTing a fresh
-- membership row with role='commissioner' for a league they'd never
-- joined. Sign up, post one row, and you owned someone else's league at
-- the database level (every commissioner policy on every other table keys
-- off that same column).
--
-- Also fixed here: any signed-in user could UPDATE any league; every
-- invite token and invited email was readable by anonymous visitors; and
-- players could write their own spread_picks.points/result, which the
-- scoring engine trusts verbatim.

-- ── Helper predicates ─────────────────────────────────────────────────
-- SECURITY DEFINER so they read league_members without re-entering that
-- table's own RLS policies — a policy on league_members that subqueries
-- league_members directly causes infinite recursion. search_path is
-- pinned (rather than left mutable) so a caller can't shadow `public`
-- with their own schema and hijack a definer-rights function.

create or replace function public.is_league_commissioner(p_league_id uuid)
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
      and role      = 'commissioner'
  );
$$;

create or replace function public.is_league_creator(p_league_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from public.leagues
    where id = p_league_id and created_by = auth.uid()
  );
$$;

-- Postgres grants EXECUTE on a new function to PUBLIC by default, and both
-- anon and authenticated inherit from PUBLIC — so revoking from those two
-- roles by name accomplishes nothing. The revoke has to target PUBLIC, and
-- then the roles that genuinely need it get an explicit grant back.
--
-- `authenticated` really does need EXECUTE here: these are called from
-- inside RLS policy expressions, which evaluate with the querying role's
-- privileges, so without it every policy referencing them fails. anon does
-- not — no anonymous code path reaches such a policy, because the /join
-- flow goes through get_invite_by_token, which runs as its definer.
revoke execute on function public.is_league_commissioner(uuid) from public;
revoke execute on function public.is_league_creator(uuid)      from public;
grant  execute on function public.is_league_commissioner(uuid) to authenticated;
grant  execute on function public.is_league_creator(uuid)      to authenticated;

-- ── league_members ────────────────────────────────────────────────────
-- The critical fix. Note SELECT is deliberately left wide — tightening it
-- requires the definer helpers above to avoid recursion, and it's a
-- lesser (information-disclosure) concern than the write path. Tracked
-- separately rather than bundled into an urgent fix.

drop policy if exists "Commissioner can manage members" on public.league_members;
drop policy if exists "Users can join leagues"          on public.league_members;
drop policy if exists "Users can update their own membership" on public.league_members;

-- You may add yourself as a plain member (the invite-join path), or as
-- commissioner only for a league you personally created (createLeague()
-- inserts the founding commissioner row immediately after the league).
-- Inserting a commissioner row for anyone else, or for a league you
-- didn't create, is exactly the takeover this migration closes.
create policy "Users can join leagues"
  on public.league_members for insert
  with check (
    user_id = auth.uid()
    and (role = 'member' or public.is_league_creator(league_id))
  );

-- Own row (display name, avatar) always; anyone's row if you're a
-- commissioner of that league. The existing guard_role_change trigger
-- still gates the role column itself on top of this.
create policy "Members and commissioners can update memberships"
  on public.league_members for update
  using      (user_id = auth.uid() or public.is_league_commissioner(league_id))
  with check (user_id = auth.uid() or public.is_league_commissioner(league_id));

create policy "Commissioners can remove members"
  on public.league_members for delete
  using (public.is_league_commissioner(league_id));

-- ── leagues ───────────────────────────────────────────────────────────
-- Was `FOR UPDATE USING (true)` with no WITH CHECK: any signed-in user
-- could rewrite any league's scoring, draft status, name, or week.

drop policy if exists "Commissioner can update league" on public.leagues;

create policy "Commissioner can update league"
  on public.leagues for update
  using      (public.is_league_commissioner(id))
  with check (public.is_league_commissioner(id));

-- ── invites ───────────────────────────────────────────────────────────
-- "Public can read invites by token" was USING (true) granted to public,
-- so anonymous visitors could dump every token and invited email. RLS
-- can't enforce "you must have supplied the token" — that's a row filter,
-- not a query-shape constraint — so the by-token lookup moves into a
-- definer function that returns exactly one invite, and the table itself
-- is locked to commissioners.

drop policy if exists "Public can read invites by token" on public.invites;
drop policy if exists "Anyone can mark invite accepted"  on public.invites;

create policy "Commissioners can read their league invites"
  on public.invites for select
  using (public.is_league_commissioner(league_id));

-- Deliberately returns no token column: the caller already has the token,
-- and not echoing it keeps this from becoming a token-confirmation oracle.
create or replace function public.get_invite_by_token(p_token text)
returns table (
  id           uuid,
  league_id    uuid,
  invited_email text,
  accepted     boolean,
  league_name  text
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select i.id, i.league_id, i.invited_email, i.accepted, l.name
  from public.invites i
  join public.leagues l on l.id = i.league_id
  where i.token = p_token;
$$;

-- Marking an invite used is now token-gated too, so knowing (or guessing)
-- an invite's uuid is no longer enough to burn someone else's invite.
create or replace function public.accept_invite(p_token text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.invites set accepted = true where token = p_token;
$$;

-- Anonymous visitors legitimately hit both of these: a /join/:token link
-- is opened before signing up. Revoke the blanket PUBLIC grant first so
-- EXECUTE lands on exactly the two roles that need it rather than on every
-- present and future role.
revoke execute on function public.get_invite_by_token(text) from public;
revoke execute on function public.accept_invite(text)       from public;
grant  execute on function public.get_invite_by_token(text) to anon, authenticated;
grant  execute on function public.accept_invite(text)       to anon, authenticated;

-- ── spread_picks ──────────────────────────────────────────────────────
-- The UPDATE policies only constrained user_id, leaving `points` and
-- `result` writable by the pick's owner. calcWeeklyScore() trusts a
-- stored points value verbatim whenever result is also non-null, so a
-- player could PATCH their own row to any score they liked.
--
-- A trigger rather than a WITH CHECK clause because this needs to compare
-- against the OLD row, which RLS check expressions can't see.

create or replace function public.guard_spread_pick_scoring()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- auth.uid() is null under the service-role key (the scheduled
  -- functions), which is trusted; anon never reaches here because RLS
  -- rejects it first.
  if auth.uid() is null or public.is_league_commissioner(NEW.league_id) then
    return NEW;
  end if;

  if TG_OP = 'INSERT' then
    NEW.result                := null;
    NEW.points                := null;
    NEW.commissioner_override := false;
  else
    NEW.result                := OLD.result;
    NEW.points                := OLD.points;
    NEW.commissioner_override := OLD.commissioner_override;
  end if;
  return NEW;
end;
$$;

drop trigger if exists guard_spread_pick_scoring_trigger on public.spread_picks;
create trigger guard_spread_pick_scoring_trigger
  before insert or update on public.spread_picks
  for each row
  execute function public.guard_spread_pick_scoring();

-- ── Definer-function hardening ────────────────────────────────────────
-- prevent_self_role_escalation is SECURITY DEFINER but had a mutable
-- search_path (flagged by Supabase's linter): a caller able to create
-- objects in an earlier schema could shadow the tables it reads and run
-- code with the definer's rights. Recreated with the path pinned.

create or replace function public.prevent_self_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if NEW.role is distinct from OLD.role then
    if not exists (
      select 1 from public.league_members
      where league_id = OLD.league_id
        and user_id   = auth.uid()
        and role      = 'commissioner'
    ) then
      raise exception 'Only a commissioner can change member roles';
    end if;
  end if;
  return NEW;
end;
$$;

-- enforce_spread_pick_limits was the last function left with a mutable
-- search_path. Recreated with it pinned and its table references
-- schema-qualified to match.
create or replace function public.enforce_spread_pick_limits()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
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
  from public.leagues where id = NEW.league_id;

  select count(*) into week_count
  from public.spread_picks
  where league_id = NEW.league_id
    and user_id   = NEW.user_id
    and week      = NEW.week
    and team_id  <> NEW.team_id
    and (TG_OP = 'INSERT' or id <> NEW.id);

  if week_count >= max_per_week then
    raise exception 'You can only make % spread picks per week', max_per_week;
  end if;

  select count(*) into team_count
  from public.spread_picks
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
$function$;

-- Trigger functions were reachable as RPCs at /rest/v1/rpc/<name>.
-- Calling one directly errors out, so the practical risk was low, but
-- there's no reason for them to sit on the exposed API surface at all.
-- Revoking doesn't stop the triggers firing: Postgres checks EXECUTE on a
-- trigger function when the trigger is created, not each time it runs.
--
-- rls_auto_enable (the event trigger that auto-enables RLS on new tables)
-- had explicit anon/authenticated grants on top of PUBLIC, so it needs
-- both forms of revoke to actually come off the API surface.
revoke execute on function public.prevent_self_role_escalation() from public;
revoke execute on function public.enforce_spread_pick_limits()   from public;
revoke execute on function public.guard_spread_pick_scoring()    from public;
revoke execute on function public.rls_auto_enable()              from public;
revoke execute on function public.rls_auto_enable()              from anon, authenticated;

-- ============================================================
-- Still open after this migration, by choice:
--   * leagues.SELECT and league_members.SELECT remain USING (true), so any
--     signed-in user can read league names/settings and member lists
--     across the whole database. Information disclosure, not a write
--     path. Tightening leagues.SELECT in particular needs care: the
--     /join/:token page reads a league's name before the visitor is a
--     member of it.
--   * draft_picks.INSERT doesn't enforce turn order at the database level
--     (any league member can insert a pick at any time). Game integrity
--     rather than security, and it requires already being in the league.
-- ============================================================
