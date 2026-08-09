-- ============================================================
-- Score Corrections migration — run in Supabase SQL Editor
-- Project Settings → SQL Editor → New Query → Paste → Run
-- ============================================================

create table score_corrections (
  id            uuid primary key default gen_random_uuid(),
  league_id     uuid references leagues(id) on delete cascade,
  user_id       uuid references auth.users(id),
  week          integer not null,
  team_id       text,
  team_name     text,
  points        numeric not null,
  note          text not null default '',
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id)
);

alter table score_corrections enable row level security;

create policy "Members can view score corrections in their league"
  on score_corrections for select
  using (league_id in (
    select league_id from league_members where user_id = auth.uid()
  ));

create policy "Commissioner can manage score corrections"
  on score_corrections for all
  using (league_id in (
    select league_id from league_members
    where user_id = auth.uid() and role = 'commissioner'
  ));

-- ============================================================
-- Then: Supabase Dashboard → Database → Replication
-- Toggle ON realtime for: score_corrections
-- (Or run: alter publication supabase_realtime add table score_corrections;)
-- ============================================================
