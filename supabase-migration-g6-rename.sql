-- ============================================================
-- G5 → G6 rename migration — run in Supabase SQL Editor
-- Project Settings → SQL Editor → New Query → Paste → Run
-- ============================================================
--
-- "G5" (Group of 5) is renamed to "G6" (Group of 6) app-wide — the six
-- named non-Power-4 conferences are American Athletic, Conference USA,
-- Mid-American, Mountain West, Pac-12, and Sun Belt. Every league's
-- `leagues.scoring` jsonb blob stores three keys under the old name
-- (loss_g5, g5_conf_min, g5_conf_max) that the app now reads/writes under
-- the new name (loss_g6, g6_conf_min, g6_conf_max). Without this migration,
-- normalizeScoring()'s shallow merge would leave a league's real
-- customizations sitting under the old, now-unread key names and silently
-- fall back to defaults for the new ones — this rewrites every row in
-- place so nothing is lost.
--
-- This does not touch season_history.trophies — that column stores a
-- frozen, self-contained snapshot (each entry already embeds its own
-- label/description at archive time, not a live lookup by category id),
-- so an already-archived season correctly keeps showing "G5 Gambler" as
-- the historical record it is, rather than being rewritten after the fact.

update public.leagues
set scoring = (
  (scoring - 'loss_g5' - 'g5_conf_min' - 'g5_conf_max')
  || jsonb_build_object(
    'loss_g6',     coalesce(scoring->'loss_g5',     to_jsonb(-5)),
    'g6_conf_min', coalesce(scoring->'g5_conf_min', to_jsonb(0)),
    'g6_conf_max', coalesce(scoring->'g5_conf_max', to_jsonb(99))
  )
)
where scoring ? 'loss_g5' or scoring ? 'g5_conf_min' or scoring ? 'g5_conf_max';
