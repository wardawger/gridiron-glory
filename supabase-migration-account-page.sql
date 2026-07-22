-- ============================================================
-- Account page migration — run in Supabase SQL Editor
-- Project Settings → SQL Editor → New Query → Paste → Run
-- ============================================================
-- Without this, only commissioners can change their own display
-- name — regular members' updates get silently dropped by RLS.

create policy "Users can update their own membership"
  on league_members for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
