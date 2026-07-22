-- ============================================================
-- Free Agency migration — run in Supabase SQL Editor
-- Project Settings → SQL Editor → New Query → Paste → Run
-- ============================================================

create table free_agency_moves (
  id                        uuid primary key default gen_random_uuid(),
  league_id                 uuid references leagues(id) on delete cascade,
  user_id                   uuid references auth.users(id),
  week                      integer not null,
  dropped_team_id           text not null,
  dropped_team_name         text not null,
  dropped_team_logo         text not null default '',
  dropped_team_conference   text not null default '',
  added_team_id             text not null,
  added_team_name           text not null,
  added_team_logo           text not null default '',
  added_team_conference     text not null default '',
  penalty_points            numeric not null default 0,
  created_at                timestamptz default now()
);

alter table free_agency_moves enable row level security;

create policy "Members can view all free agency moves in their league"
  on free_agency_moves for select
  using (league_id in (
    select league_id from league_members where user_id = auth.uid()
  ));

create policy "Users can make their own free agency moves"
  on free_agency_moves for insert
  with check (
    user_id = auth.uid()
    and league_id in (
      select league_id from league_members where user_id = auth.uid()
    )
  );

-- ============================================================
-- Then: Supabase Dashboard → Database → Replication
-- Toggle ON realtime for: free_agency_moves
-- (Or run: alter publication supabase_realtime add table free_agency_moves;)
-- ============================================================
