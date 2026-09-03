-- Captain scoring: configurable multiplier, per-week min/max, per-team
-- season cap, and an optional "captain every team" requirement.
--
-- Two schema changes are needed.
--
-- 1. locked_multiplier
--    The multiplier is stamped onto each captain pick when it is made, the
--    same way spread_picks.locked_spread already freezes a line. Without
--    it, raising the multiplier mid-season would silently rescore every
--    week already played.
--
--    Existing rows predate the setting and all scored at 2x. They are left
--    NULL rather than backfilled, so the app can tell "made before this
--    existed" from "deliberately set to 2"; scoring treats NULL as 2 (see
--    LEGACY_CAPTAIN_MULTIPLIER in src/services/scoring.ts).
--
-- 2. The unique constraint
--    captain_picks_league_id_user_id_week_key is UNIQUE (league_id,
--    user_id, week), which enforces exactly one captain per manager per
--    week at the schema level. A configurable weekly maximum above 1 is
--    impossible while it stands. It is replaced by the same key plus
--    team_id, which still blocks captaining the same team twice in one
--    week while allowing several different teams.
--
-- The per-week min/max and the season cap need no column of their own:
-- they constrain when a pick may be created, and a past week's picks are
-- already locked by kickoff, so they cannot apply retroactively. The
-- weekly minimum is the one rule that affects scoring rather than input,
-- and it is gated on scoring.captain_min_effective_week in the
-- leagues.scoring jsonb blob.

alter table captain_picks
  add column if not exists locked_multiplier numeric;

comment on column captain_picks.locked_multiplier is
  'Captain multiplier in force when this pick was made. NULL for rows created before the multiplier was configurable, which scored at 2x.';

-- Swap the one-captain-per-week key for one that allows several distinct
-- teams in the same week. Guarded so re-running is harmless.
alter table captain_picks
  drop constraint if exists captain_picks_league_id_user_id_week_key;

alter table captain_picks
  drop constraint if exists captain_picks_league_id_user_id_week_team_id_key;

alter table captain_picks
  add constraint captain_picks_league_id_user_id_week_team_id_key
  unique (league_id, user_id, week, team_id);
