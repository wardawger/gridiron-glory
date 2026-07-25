-- ============================================================
-- League History migration — run in Supabase SQL Editor
-- Project Settings → SQL Editor → New Query → Paste → Run
-- ============================================================

create table season_history (
  id            uuid primary key default gen_random_uuid(),
  league_id     uuid not null references leagues(id) on delete cascade,
  season_label  text not null,
  standings     jsonb not null,   -- SeasonHistoryEntry[], sorted by rank
  archived_at   timestamptz not null default now(),
  archived_by   uuid not null references auth.users(id)
);

alter table season_history enable row level security;

create policy "Members can view their league's season history"
  on season_history for select
  using (league_id in (
    select league_id from league_members where user_id = auth.uid()
  ));

create policy "Commissioners can archive a season"
  on season_history for insert
  with check (
    archived_by = auth.uid()
    and league_id in (
      select league_id from league_members
      where user_id = auth.uid() and role = 'commissioner'
    )
  );

-- ============================================================
-- Then: Supabase Dashboard → Database → Replication
-- Toggle ON realtime for: season_history
-- (Or run: alter publication supabase_realtime add table season_history;)
-- ============================================================
