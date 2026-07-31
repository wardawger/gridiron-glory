-- ============================================================
-- Waiver Wire migration — run in Supabase SQL Editor
-- Project Settings → SQL Editor → New Query → Paste → Run
-- ============================================================

create table waiver_claims (
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
  status                    text not null default 'pending' check (status in ('pending', 'processed', 'cancelled')),
  priority_snapshot         numeric,
  submitted_at              timestamptz not null default now(),
  processed_at              timestamptz,
  resulting_move_id         uuid references free_agency_moves(id)
);

alter table waiver_claims enable row level security;

create policy "Members can view all waiver claims in their league"
  on waiver_claims for select
  using (league_id in (
    select league_id from league_members where user_id = auth.uid()
  ));

create policy "Users can submit their own waiver claims"
  on waiver_claims for insert
  with check (
    user_id = auth.uid()
    and league_id in (
      select league_id from league_members where user_id = auth.uid()
    )
  );

-- Deliberately no update/delete policy: claim resolution (pending -> processed/cancelled)
-- is performed exclusively by the process-waivers scheduled function via the
-- Supabase service-role key, so no user session can alter or cancel a claim.

-- ============================================================
-- Then: Supabase Dashboard → Database → Replication
-- Toggle ON realtime for: waiver_claims
-- (Or run: alter publication supabase_realtime add table waiver_claims;)
-- ============================================================
