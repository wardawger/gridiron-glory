-- ============================================================
-- League data RPC migration — run in Supabase SQL Editor
-- Project Settings → SQL Editor → New Query → Paste → Run
-- ============================================================
--
-- loadLeagueData() (src/hooks/league/useLeagueCore.ts) fired 11 separate
-- Supabase queries in parallel every time a league loads or switches —
-- league_members, draft_picks, captain_picks, manual_bonuses, spread_picks,
-- free_agency_moves, waiver_claims, score_corrections, bench_picks, invites,
-- season_history. That's 11 round-trips (and, under concurrent load from
-- multiple users, 11x the odds of hitting a transient failure like a
-- Postgres statement timeout) where one would do.
--
-- get_league_data() returns all 11 tables' rows for one league as a single
-- jsonb payload in one round-trip. SECURITY INVOKER (the default — not
-- specifying SECURITY DEFINER) means it runs as the calling role, so every
-- table's existing RLS policies still apply exactly as if the client had
-- queried that table directly: a non-commissioner still gets an empty
-- invites array, not real invite rows, because invites' own SELECT policy
-- (scoped to commissioners) still gates the query the function runs
-- internally. This changes no access-control behavior, only round-trips.

create or replace function public.get_league_data(p_league_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'members',           coalesce((select jsonb_agg(t)                                from public.league_members   t where t.league_id = p_league_id), '[]'::jsonb),
    'draft_picks',        coalesce((select jsonb_agg(t order by t.pick_number)         from public.draft_picks      t where t.league_id = p_league_id), '[]'::jsonb),
    'captain_picks',      coalesce((select jsonb_agg(t)                                from public.captain_picks    t where t.league_id = p_league_id), '[]'::jsonb),
    'manual_bonuses',     coalesce((select jsonb_agg(t)                                from public.manual_bonuses   t where t.league_id = p_league_id), '[]'::jsonb),
    'spread_picks',       coalesce((select jsonb_agg(t)                                from public.spread_picks     t where t.league_id = p_league_id), '[]'::jsonb),
    'free_agency_moves',  coalesce((select jsonb_agg(t)                                from public.free_agency_moves t where t.league_id = p_league_id), '[]'::jsonb),
    'waiver_claims',      coalesce((select jsonb_agg(t)                                from public.waiver_claims    t where t.league_id = p_league_id), '[]'::jsonb),
    'score_corrections',  coalesce((select jsonb_agg(t)                                from public.score_corrections t where t.league_id = p_league_id), '[]'::jsonb),
    'bench_picks',        coalesce((select jsonb_agg(t)                                from public.bench_picks      t where t.league_id = p_league_id), '[]'::jsonb),
    'invites',            coalesce((select jsonb_agg(t order by t.created_at desc)     from public.invites          t where t.league_id = p_league_id), '[]'::jsonb),
    'season_history',     coalesce((select jsonb_agg(t order by t.archived_at desc)    from public.season_history   t where t.league_id = p_league_id), '[]'::jsonb)
  );
$$;

grant execute on function public.get_league_data(uuid) to authenticated;
