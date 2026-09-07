-- ============================================================
-- GRIDIRON GLORY — Supabase Database Setup
-- Run this entire file in the Supabase SQL Editor
-- Project Settings → SQL Editor → New Query → Paste → Run
-- ============================================================

-- ── 1. LEAGUES ────────────────────────────────────────────────
create table leagues (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  created_by          uuid references auth.users(id),
  current_week        integer default 0,
  draft_status        text default 'pending',   -- pending | active | complete
  draft_order         text[] default '{}',       -- ordered user IDs
  draft_current_pick  integer default 1,
  max_teams_per_user  integer default 10,
  scoring             jsonb default '{
    "win": 1,
    "win_ranked": 1,
    "win_top15": 2,
    "win_top5": 3,
    "loss": -1,
    "loss_g6": -5
  }'::jsonb,
  created_at          timestamptz default now()
);

alter table leagues enable row level security;

create policy "Members can view their league"
  on leagues for select
  using (id in (
    select league_id from league_members where user_id = auth.uid()
  ));

create policy "Authenticated users can create leagues"
  on leagues for insert
  with check (auth.uid() = created_by);

create policy "Commissioner can update league"
  on leagues for update
  using (id in (
    select league_id from league_members
    where user_id = auth.uid() and role = 'commissioner'
  ));


-- ── 2. LEAGUE MEMBERS ─────────────────────────────────────────
create table league_members (
  id            uuid primary key default gen_random_uuid(),
  league_id     uuid references leagues(id) on delete cascade,
  user_id       uuid references auth.users(id),
  display_name  text not null,
  role          text default 'member',   -- commissioner | member
  joined_at     timestamptz default now(),
  avatar_type   text not null default 'initial' check (avatar_type in ('initial', 'emoji', 'logo', 'upload')),
  avatar_value  text not null default '', -- emoji char, or image URL for logo/upload
  unique(league_id, user_id)
);

alter table league_members enable row level security;

create policy "Members can view all members in their league"
  on league_members for select
  using (league_id in (
    select league_id from league_members where user_id = auth.uid()
  ));

create policy "Users can join leagues (insert own row)"
  on league_members for insert
  with check (user_id = auth.uid());

create policy "Users can update their own membership"
  on league_members for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Commissioner can manage members"
  on league_members for all
  using (league_id in (
    select league_id from league_members
    where user_id = auth.uid() and role = 'commissioner'
  ));


-- ── 3. DRAFT PICKS ────────────────────────────────────────────
create table draft_picks (
  id               uuid primary key default gen_random_uuid(),
  league_id        uuid references leagues(id) on delete cascade,
  user_id          uuid references auth.users(id),
  team_id          text not null,
  team_name        text not null,
  team_logo        text not null default '',
  team_conference  text not null default '',
  round            integer,
  pick_number      integer not null,
  picked_at        timestamptz default now(),
  unique(league_id, team_id)   -- each team can only be drafted once per league
);

alter table draft_picks enable row level security;

create policy "Members can view all draft picks in their league"
  on draft_picks for select
  using (league_id in (
    select league_id from league_members where user_id = auth.uid()
  ));

create policy "Users can make their own draft picks"
  on draft_picks for insert
  with check (
    user_id = auth.uid()
    and league_id in (
      select league_id from league_members where user_id = auth.uid()
    )
  );

create policy "Commissioner can remove draft picks"
  on draft_picks for delete
  using (league_id in (
    select league_id from league_members
    where user_id = auth.uid() and role = 'commissioner'
  ));


-- ── 4. CAPTAIN PICKS ──────────────────────────────────────────
create table captain_picks (
  id          uuid primary key default gen_random_uuid(),
  league_id   uuid references leagues(id) on delete cascade,
  user_id     uuid references auth.users(id),
  team_id     text not null,
  week        integer not null,
  picked_at   timestamptz default now(),
  unique(league_id, user_id, week)   -- one captain per user per week
);

alter table captain_picks enable row level security;

create policy "Members can view all captain picks in their league"
  on captain_picks for select
  using (league_id in (
    select league_id from league_members where user_id = auth.uid()
  ));

create policy "Users can manage their own captain picks"
  on captain_picks for all
  using (user_id = auth.uid());


-- ── 5. MANUAL BONUSES ─────────────────────────────────────────
create table manual_bonuses (
  id          uuid primary key default gen_random_uuid(),
  league_id   uuid references leagues(id) on delete cascade,
  user_id     uuid references auth.users(id),
  type        text not null,
  team_id     text not null,
  team_name   text not null,
  points      integer not null,
  note        text default '',
  awarded_at  timestamptz default now(),
  awarded_by  uuid references auth.users(id)
);

alter table manual_bonuses enable row level security;

create policy "Members can view bonuses in their league"
  on manual_bonuses for select
  using (league_id in (
    select league_id from league_members where user_id = auth.uid()
  ));

create policy "Commissioner can manage bonuses"
  on manual_bonuses for all
  using (league_id in (
    select league_id from league_members
    where user_id = auth.uid() and role = 'commissioner'
  ));


-- ── 6. FREE AGENCY MOVES ──────────────────────────────────────
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


-- ── 7. AVATAR STORAGE ─────────────────────────────────────────
-- Public-read bucket for uploaded roster avatar photos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do nothing;

create policy "Public can view avatar images"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "Users can upload their own avatar"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can replace their own avatar"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete their own avatar"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


-- ── 8. INVITES ────────────────────────────────────────────────
create table invites (
  id             uuid primary key default gen_random_uuid(),
  league_id      uuid references leagues(id) on delete cascade,
  invited_email  text not null,
  invited_by     uuid references auth.users(id),
  token          text unique default encode(gen_random_bytes(32), 'hex'),
  accepted       boolean default false,
  created_at     timestamptz default now()
);

alter table invites enable row level security;

create policy "Public can read invites by token (token is the secret)"
  on invites for select
  using (true);

create policy "Commissioner can create invites"
  on invites for insert
  with check (league_id in (
    select league_id from league_members
    where user_id = auth.uid() and role = 'commissioner'
  ));

create policy "Anyone can mark invite accepted"
  on invites for update
  using (true)
  with check (accepted = true);


-- ── 9. ENABLE REALTIME ────────────────────────────────────────
-- Go to: Supabase Dashboard → Database → Replication
-- Toggle ON for: draft_picks, leagues, captain_picks, free_agency_moves
-- (Or run these if using CLI)
-- alter publication supabase_realtime add table draft_picks;
-- alter publication supabase_realtime add table leagues;
-- alter publication supabase_realtime add table captain_picks;
-- alter publication supabase_realtime add table free_agency_moves;

-- ============================================================
-- DONE. Now:
-- 1. Go to Authentication → Providers → confirm Email is ON
-- 2. Go to Authentication → URL Configuration → set Site URL
-- 3. Copy Project URL and anon key to .env.local
-- ============================================================
