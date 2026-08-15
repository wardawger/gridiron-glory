-- ============================================================
-- Draft advancement regression fix — run in Supabase SQL Editor
-- Project Settings → SQL Editor → New Query → Paste → Run
-- ============================================================
--
-- supabase-migration-security-hardening.sql scoped leagues UPDATE to
-- is_league_commissioner(id). That broke draft-pick advancement in
-- production: makeDraftPick() (src/hooks/league/useLeagueCore.ts) has
-- every drafter -- not just the commissioner -- update their own
-- league's draft_current_pick/draft_status right after their pick is
-- inserted. That write started silently failing RLS for any
-- non-commissioner drafter, so the league never advanced past pick 1 and
-- the same picker could resubmit for the same pick number.
--
-- Live incident: in "Wilson Fam Jam", a non-commissioner drafter picked
-- Ohio State, the counter didn't move, their screen still showed pick 1
-- as open, and 25 seconds later they picked Ohio too -- both rows landed
-- as pick_number 1. Fixed by hand for that league (deleted the duplicate,
-- advanced draft_current_pick to 2); this migration is the actual fix so
-- it can't happen again.
--
-- Rather than reopen leagues UPDATE to all members (which would undo the
-- fix that stopped any signed-in user from rewriting a league's scoring,
-- name, or draft_order), a trigger clamps every column back to its old
-- value except draft_current_pick/draft_status when the actor isn't a
-- commissioner -- the same pattern already used for
-- guard_spread_pick_scoring.

create or replace function public.guard_league_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or public.is_league_commissioner(OLD.id) then
    return NEW;
  end if;

  -- Not a commissioner: only draft_current_pick and draft_status may
  -- change. Everything else reverts to its prior value regardless of
  -- what the client sent.
  NEW.name                := OLD.name;
  NEW.created_by           := OLD.created_by;
  NEW.current_week         := OLD.current_week;
  NEW.draft_order          := OLD.draft_order;
  NEW.max_teams_per_user   := OLD.max_teams_per_user;
  NEW.scoring              := OLD.scoring;
  NEW.created_at           := OLD.created_at;
  return NEW;
end;
$$;

-- New functions are granted EXECUTE to PUBLIC by default, which anon and
-- authenticated both inherit -- revoke explicitly from all three so this
-- doesn't sit on the exposed RPC surface. (A first attempt at this
-- migration issued the PUBLIC-only revoke in the same batch as the
-- CREATE FUNCTION/CREATE TRIGGER statements and it didn't take; issuing
-- it as its own statement against the already-created function is what
-- actually cleared the grant. Included as three roles here rather than
-- relying on the PUBLIC wildcard alone, to avoid relying on that
-- ordering quirk again.)
revoke execute on function public.guard_league_update() from public, anon, authenticated;

drop trigger if exists guard_league_update_trigger on public.leagues;
create trigger guard_league_update_trigger
  before update on public.leagues
  for each row
  execute function public.guard_league_update();

drop policy if exists "Commissioner can update league" on public.leagues;

create policy "Members can update their league"
  on public.leagues for update
  using      (public.is_league_member(id) or created_by = auth.uid())
  with check (public.is_league_member(id) or created_by = auth.uid());

-- ============================================================
-- Verified after applying, by impersonating a real non-commissioner
-- drafter inside a rolled-back transaction: they could advance
-- draft_current_pick, but an attempted simultaneous write to name/scoring
-- in the same statement was silently reverted by the trigger.
-- ============================================================
