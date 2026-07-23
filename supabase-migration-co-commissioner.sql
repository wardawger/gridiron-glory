-- ============================================================
-- Co-commissioner migration — run in Supabase SQL Editor
-- Project Settings → SQL Editor → New Query → Paste → Run
-- ============================================================
-- No new columns needed — league_members.role already supports
-- 'commissioner' and 'member', and any number of rows in a league
-- can already be 'commissioner'. The existing "Commissioner can
-- manage members" policy already lets a commissioner promote or
-- demote any member's role.
--
-- This migration only closes a privilege-escalation gap: the
-- "Users can update their own membership" policy (added for the
-- Account page's display-name/avatar self-service) permits updating
-- ANY column on a member's own row — including role — since RLS
-- operates at the row level, not the column level. A regular member
-- could otherwise promote themselves to commissioner directly via
-- the API, bypassing the app UI entirely.
--
-- This trigger blocks any change to `role` unless the acting user
-- is already a commissioner of that league, regardless of which RLS
-- policy matched the row.

create or replace function prevent_self_role_escalation()
returns trigger as $$
begin
  if NEW.role is distinct from OLD.role then
    if not exists (
      select 1 from league_members
      where league_id = OLD.league_id
        and user_id = auth.uid()
        and role = 'commissioner'
    ) then
      raise exception 'Only a commissioner can change member roles';
    end if;
  end if;
  return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists guard_role_change on league_members;
create trigger guard_role_change
  before update on league_members
  for each row execute function prevent_self_role_escalation();
