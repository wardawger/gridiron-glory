// ─── Auth / Users ──────────────────────────────────────────────────────────

export interface Profile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
}

// ─── League ────────────────────────────────────────────────────────────────

export type LeagueRole = 'commissioner' | 'member';
export type DraftStatus = 'pending' | 'active' | 'complete';

export interface League {
  id: string;
  name: string;
  created_by: string;
  current_week: number;
  draft_status: DraftStatus;
  draft_order: string[];
  draft_current_pick: number;
  draft_scheduled_at: string | null;
  max_teams_per_user: number;
  scoring: ScoringSettings;
  created_at: string;
}

export type AvatarType = 'initial' | 'emoji' | 'logo' | 'upload';

export interface LeagueMember {
  league_id: string;
  user_id: string;
  display_name: string;
  role: LeagueRole;
  joined_at: string;
  avatar_type: AvatarType;
  avatar_value: string; // emoji char ('emoji'); image URL ('logo' or 'upload'); unused for 'initial'
}

// A curated set of sports-flavored emoji for the roster avatar picker
export const AVATAR_EMOJI_OPTIONS: string[] = [
  '🏈', '🏆', '🥇', '🔥', '⚡', '⭐', '👑', '🎯',
  '💪', '🚀', '🛡️', '⚔️', '🐐', '🦅', '🦁', '🐯',
  '🐻', '🐺', '🦂', '💀', '🥊', '🍀', '😈', '🤠',
];

export const AVATAR_MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB
export const AVATAR_MIN_DIMENSION  = 100;              // px
export const AVATAR_MAX_DIMENSION  = 2048;             // px
export const AVATAR_ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

// ─── Scoring ───────────────────────────────────────────────────────────────

export type StatBonusCategory = 'qbr' | 'rushing_tds' | 'receiving_tds' | 'def_ints' | 'sacks';

export const STAT_BONUS_CATEGORIES: StatBonusCategory[] = [
  'qbr', 'rushing_tds', 'receiving_tds', 'def_ints', 'sacks',
];

export const STAT_BONUS_LABELS: Record<StatBonusCategory, string> = {
  qbr:           'QBR (Passer Rating)',
  rushing_tds:   'Rushing TDs',
  receiving_tds: 'Receiving TDs',
  def_ints:      'Defensive INTs',
  sacks:         'Sacks',
};

export interface StatBonusCategorySettings {
  top_enabled: boolean;
  top_count: number;
  top_points: number;
  bottom_enabled: boolean;
  bottom_count: number;
  bottom_points: number; // may be negative
}

export interface ScoringSettings {
  win: number;
  win_ranked: number;
  win_top15: number;
  win_top5: number;
  loss: number;
  loss_g5: number;
  // Spread betting settings
  spread_enabled: boolean;
  spread_points: number;          // flat pts for covering, or multiplier base
  spread_is_multiplier: boolean;  // true = multiply base game score, false = flat pts
  spread_max_per_week: number;    // max spread picks per user per week
  spread_max_per_team: number;    // max times one team can be spread-picked all season
  spread_allow_captain_stack: boolean; // allow spread + captain on same team same week
  spread_allow_against_pick: boolean; // let users pick a team to NOT cover, not just to cover
  spread_miss_penalty_enabled: boolean; // override the miss penalty below instead of using the negated cover reward
  spread_miss_penalty_points: number;   // flat points subtracted on a miss when the override above is on (entered as a positive number)
  // Free agency settings
  free_agency_enabled: boolean;
  fa_max_moves_per_season: number; // max adds/drops per user for the whole season
  fa_max_moves_per_week: number;   // max adds/drops per user per week
  fa_penalty_enabled: boolean;
  fa_penalty_points: number;       // points subtracted the week a swap is made (entered as a positive number)
  // Statistical ranking bonus settings (top-N / bottom-N per category, among all drafted teams)
  stat_bonus_enabled: boolean; // master toggle for the whole feature
  stat_bonus_categories: Record<StatBonusCategory, StatBonusCategorySettings>;
  // Postseason/manual bonus point values — commissioner-configurable per league;
  // BONUS_DEFAULT_POINTS below is only the starting value for a brand-new league.
  bonus_points: Record<BonusType, number>;
  // Roster conference limits — enforced during the draft and free agency/waivers
  p4_conf_min: number;   // min teams required per P4 conference (SEC/Big Ten/Big 12/ACC), each
  p4_conf_max: number;   // max teams allowed per P4 conference, each
  g5_conf_min: number;   // min teams required from the combined G5/non-P4 pool (0 = no minimum)
  g5_conf_max: number;   // max teams allowed from the combined G5/non-P4 pool (99 = effectively unlimited)
  excluded_conferences: string[]; // conference names entirely banned from the draft/free-agency pool (empty = no restriction)
  // Waiver wire settings — when disabled, free agency stays instant (first-come-first-served)
  waiver_enabled: boolean;
  waiver_priority_metric: 'worst_record' | 'fewest_points';
  waiver_process_day: number;  // 0=Sun..6=Sat, evaluated in waiver_timezone
  waiver_timezone: string;     // IANA zone, e.g. 'America/New_York'
  // Starters/bench weekly lineups — when disabled, every rostered team
  // scores every week (today's behavior). starters_count + bench_count
  // must always equal the league's max_teams_per_user.
  bench_enabled: boolean;
  starters_count: number;
  bench_count: number;
}

export const DEFAULT_SCORING: ScoringSettings = {
  win: 1,
  win_ranked: 1,
  win_top15: 2,
  win_top5: 3,
  loss: -1,
  loss_g5: -5,
  // Spread defaults — off until commissioner enables
  spread_enabled: false,
  spread_points: 2,
  spread_is_multiplier: false,
  spread_max_per_week: 2,
  spread_max_per_team: 3,
  spread_allow_captain_stack: false,
  spread_allow_against_pick: false,
  spread_miss_penalty_enabled: false,
  spread_miss_penalty_points: 2,
  // Free agency defaults — off until commissioner enables
  free_agency_enabled: false,
  fa_max_moves_per_season: 10,
  fa_max_moves_per_week: 2,
  fa_penalty_enabled: false,
  fa_penalty_points: 3,
  stat_bonus_enabled: true,
  stat_bonus_categories: {
    qbr:           { top_enabled: true, top_count: 3, top_points: 3, bottom_enabled: true, bottom_count: 3, bottom_points: -3 },
    rushing_tds:   { top_enabled: true, top_count: 3, top_points: 3, bottom_enabled: true, bottom_count: 3, bottom_points: -3 },
    receiving_tds: { top_enabled: true, top_count: 3, top_points: 3, bottom_enabled: true, bottom_count: 3, bottom_points: -3 },
    def_ints:      { top_enabled: true, top_count: 3, top_points: 3, bottom_enabled: true, bottom_count: 3, bottom_points: -3 },
    sacks:         { top_enabled: true, top_count: 3, top_points: 3, bottom_enabled: true, bottom_count: 3, bottom_points: -3 },
  },
  p4_conf_min: 2,
  p4_conf_max: 3,
  g5_conf_min: 0,
  g5_conf_max: 99,
  excluded_conferences: [],
  // Real values are filled in by normalizeScoring() from BONUS_DEFAULT_POINTS,
  // declared further down this file — referencing it directly here would be a
  // temporal-dead-zone error (BONUS_DEFAULT_POINTS isn't initialized yet at
  // the point this module-level object literal itself evaluates).
  bonus_points: {} as Record<BonusType, number>,
  waiver_enabled: false,
  waiver_priority_metric: 'worst_record',
  waiver_process_day: 3, // Wednesday
  waiver_timezone: 'America/New_York',
  // Bench defaults — off until commissioner enables. 10/0 is a neutral
  // placeholder (every league that turns this on sets its own real split
  // summing to its own max_teams_per_user); it's never read while disabled.
  bench_enabled: false,
  starters_count: 10,
  bench_count: 0,
};

// Fills in any missing/legacy-shaped scoring fields with defaults — handles
// leagues saved before a settings field existed, or before it changed shape
// (e.g. stat bonuses used to be a single global Top 3/Bottom 3, not
// per-category configurable counts and points).
export function normalizeScoring(raw: Partial<ScoringSettings> | null | undefined): ScoringSettings {
  const isPlainObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);

  const rawCategories = isPlainObject((raw as any)?.stat_bonus_categories)
    ? (raw as any).stat_bonus_categories as Record<string, unknown>
    : {};
  const categories = {} as Record<StatBonusCategory, StatBonusCategorySettings>;
  STAT_BONUS_CATEGORIES.forEach(cat => {
    const rawCat = isPlainObject(rawCategories[cat]) ? rawCategories[cat] as Partial<StatBonusCategorySettings> : {};
    categories[cat] = { ...DEFAULT_SCORING.stat_bonus_categories[cat], ...rawCat };
  });

  const rawBonusPoints = isPlainObject((raw as any)?.bonus_points)
    ? (raw as any).bonus_points as Record<string, unknown>
    : {};
  const bonusPoints = { ...BONUS_DEFAULT_POINTS } as Record<BonusType, number>;
  (Object.keys(BONUS_DEFAULT_POINTS) as BonusType[]).forEach(type => {
    const rawValue = rawBonusPoints[type];
    if (typeof rawValue === 'number') bonusPoints[type] = rawValue;
  });

  return {
    ...DEFAULT_SCORING,
    ...(raw ?? {}),
    stat_bonus_categories: categories,
    bonus_points: bonusPoints,
  };
}

// ─── Draft ─────────────────────────────────────────────────────────────────

// P4 conferences for draft/free-agency enforcement — the one canonical list;
// min/max team counts per category live on ScoringSettings (p4_conf_*/g5_conf_*).
export const P4_CONFERENCES = ['SEC', 'Big Ten', 'Big 12', 'ACC'] as const;
export type P4Conference = typeof P4_CONFERENCES[number];

export interface DraftPick {
  id: string;
  league_id: string;
  user_id: string;
  team_id: string;
  team_name: string;
  team_logo: string;
  team_conference: string;
  round: number;
  pick_number: number;
  picked_at: string;
}

// ─── Free Agency ───────────────────────────────────────────────────────────

export interface FreeAgencyMove {
  id: string;
  league_id: string;
  user_id: string;
  week: number;
  dropped_team_id: string;
  dropped_team_name: string;
  dropped_team_logo: string;
  dropped_team_conference: string;
  added_team_id: string;
  added_team_name: string;
  added_team_logo: string;
  added_team_conference: string;
  penalty_points: number; // <= 0, captured at time of the move
  created_at: string;
}

// A pending free-agency swap awaiting waiver-wire resolution. Only exists
// while scoring.waiver_enabled is on — resolution is performed exclusively
// by the process-waivers scheduled function (netlify/functions), never by a
// client, since it must be able to cancel a claim that isn't its own.
export type WaiverClaimStatus = 'pending' | 'processed' | 'cancelled';

export interface WaiverClaim {
  id: string;
  league_id: string;
  user_id: string;
  week: number;
  dropped_team_id: string;
  dropped_team_name: string;
  dropped_team_logo: string;
  dropped_team_conference: string;
  added_team_id: string;
  added_team_name: string;
  added_team_logo: string;
  added_team_conference: string;
  status: WaiverClaimStatus;
  priority_snapshot: number | null; // metric value used at resolution time, for audit
  submitted_at: string;
  processed_at: string | null;
  resulting_move_id: string | null; // set on the free_agency_moves row created if this claim wins
}

// ─── Roster / Captain ──────────────────────────────────────────────────────

export interface RosterEntry {
  team_id: string;
  team_name: string;
  team_logo: string;
  team_conference: string;
  team_color: string;
}

export interface CaptainPick {
  id: string;
  league_id: string;
  user_id: string;
  team_id: string;
  week: number;
  picked_at: string;
}

// Presence of a row = that team is benched for that user/week (doesn't
// score); absence = starter (the default — every team scores unless
// explicitly benched). Only meaningful when scoring.bench_enabled is on.
export interface BenchPick {
  id: string;
  league_id: string;
  user_id: string;
  team_id: string;
  week: number;
  picked_at: string;
}

// ─── Manual Bonus ──────────────────────────────────────────────────────────

export type BonusType =
  // Postseason — bowl
  | 'bowl_eligible'
  | 'not_bowl_eligible'
  | 'win_bowl'
  // Conference championship
  | 'make_cc'
  | 'win_cc'
  // CFP ladder
  | 'make_cfp'
  | 'make_cfp_quarterfinal'
  | 'make_cfp_semifinal'
  | 'make_cfp_final'
  | 'win_cfp_championship'
  // Awards
  | 'heisman_invitee'
  | 'heisman_winner'
  // Penalties
  | 'coach_fired'
  | 'fulmer_cup'
  // Statistical rankings (awarded after conf championships)
  | 'top3_qbr'
  | 'top3_rushing_td'
  | 'top3_receiving_td'
  | 'top3_int'
  | 'top3_sacks'
  | 'bottom3_qbr'
  | 'bottom3_rushing_td'
  | 'bottom3_receiving_td'
  | 'bottom3_int'
  | 'bottom3_sacks';

export interface ManualBonus {
  id: string;
  league_id: string;
  user_id: string;
  type: BonusType;
  team_id: string;
  team_name: string;
  points: number;
  note: string;
  awarded_at: string;
  awarded_by: string;
}

// ─── Score Correction ──────────────────────────────────────────────────────
// A flat, week-scoped point adjustment a commissioner can add on top of the
// auto-calculated weekly score to correct a wrong calculation — same role
// as fa_points, but commissioner-entered. team_id/team_name are optional
// context for the commissioner's own audit trail only — they never affect
// the math (no ScoreBreakdown line item), keeping this a simple, low-risk
// week-total delta identical in shape to how free-agency penalties work.
export interface ScoreCorrection {
  id: string;
  league_id: string;
  user_id: string;
  week: number;
  team_id: string | null;
  team_name: string | null;
  points: number;
  note: string;
  created_at: string;
  created_by: string;
}

export const BONUS_LABELS: Record<BonusType, string> = {
  // Bowl
  bowl_eligible:          'Bowl Eligible',
  not_bowl_eligible:      'Not Bowl Eligible',
  win_bowl:               'Won Bowl Game (Non-CFP)',
  // Conf championship
  make_cc:                'Made Conf. Championship',
  win_cc:                 'Won Conference',
  // CFP
  make_cfp:               'Made CFP',
  make_cfp_quarterfinal:  'Made CFP Quarterfinal',
  make_cfp_semifinal:     'Made CFP Semifinal',
  make_cfp_final:         'Made CFP Final',
  win_cfp_championship:   'Won CFP Championship',
  // Awards
  heisman_invitee:        'Heisman Invitee',
  heisman_winner:         'Heisman Winner',
  // Penalties
  coach_fired:            'Coach Fired',
  fulmer_cup:             'Fulmer Cup Suspension',
  // Statistical (post conf championship)
  top3_qbr:              'Top 3 in QBR',
  top3_rushing_td:       'Top 3 in Rushing TDs',
  top3_receiving_td:     'Top 3 in Receiving TDs',
  top3_int:              'Top 3 in INTs (Defense)',
  top3_sacks:            'Top 3 in Sacks',
  bottom3_qbr:           'Bottom 3 in QBR',
  bottom3_rushing_td:    'Bottom 3 in Rushing TDs',
  bottom3_receiving_td:  'Bottom 3 in Receiving TDs',
  bottom3_int:           'Bottom 3 in INTs (Defense)',
  bottom3_sacks:         'Bottom 3 in Sacks',
};

export const BONUS_DEFAULT_POINTS: Record<BonusType, number> = {
  bowl_eligible:          5,
  not_bowl_eligible:      -5,
  win_bowl:               5,
  make_cc:                10,
  win_cc:                 10,
  make_cfp:               5,
  make_cfp_quarterfinal:  10,
  make_cfp_semifinal:     15,
  make_cfp_final:         20,
  win_cfp_championship:   25,
  heisman_invitee:        10,
  heisman_winner:         15,
  coach_fired:            -10,
  fulmer_cup:             -2,
  top3_qbr:              3,
  top3_rushing_td:       3,
  top3_receiving_td:     3,
  top3_int:              3,
  top3_sacks:            3,
  bottom3_qbr:           -3,
  bottom3_rushing_td:    -3,
  bottom3_receiving_td:  -3,
  bottom3_int:           -3,
  bottom3_sacks:         -3,
};

// Group bonus types for the admin UI
export const BONUS_GROUPS: { label: string; types: BonusType[] }[] = [
  {
    label: 'Bowl Season',
    types: ['bowl_eligible', 'not_bowl_eligible', 'win_bowl'],
  },
  {
    label: 'Conference Championship',
    types: ['make_cc', 'win_cc'],
  },
  {
    label: 'College Football Playoff',
    types: ['make_cfp', 'make_cfp_quarterfinal', 'make_cfp_semifinal', 'make_cfp_final', 'win_cfp_championship'],
  },
  {
    label: 'Awards',
    types: ['heisman_invitee', 'heisman_winner'],
  },
  {
    label: 'Penalties',
    types: ['coach_fired', 'fulmer_cup'],
  },
  {
    label: 'Statistical Rankings (post Conf. Championship)',
    types: [
      'top3_qbr', 'top3_rushing_td', 'top3_receiving_td', 'top3_int', 'top3_sacks',
      'bottom3_qbr', 'bottom3_rushing_td', 'bottom3_receiving_td', 'bottom3_int', 'bottom3_sacks',
    ],
  },
];

// ─── CFBD / Game Data ──────────────────────────────────────────────────────

export interface CfbTeam {
  id: string;
  name: string;
  conference: string;
  logo: string;
  color: string;
  alt_color: string;
  is_g5: boolean;
}

// Team strength ratings (FPI + SP+), all as 1-N ranks (1 = best), null if
// not yet published for the current data year.
export interface TeamRatings {
  fpi_rank: number | null;
  offense_rank: number | null;
  defense_rank: number | null;
  sos_rank: number | null; // lower = tougher schedule; preseason estimate until CFBD publishes current-season SOS
}

export interface GameResult {
  week: number;
  opponent: string;
  opponent_id: string;
  opponent_rank: number | null;
  opponent_logo: string | null;
  result: 'W' | 'L' | null;
  is_g5_opponent: boolean;
  home_score: number | null;
  away_score: number | null;
  completed: boolean;
  // Schedule detail fields
  start_date: string | null;
  start_time_tbd: boolean; // from CFBD's own startTimeTBD — authoritative, don't re-derive from the date
  is_home: boolean;
  venue: string | null;
  tv: string | null;
  // Weather — CFBD only has real data within roughly a week of kickoff, so
  // all of these are null for most future games until forecasts populate.
  weather_condition: string | null; // e.g. "Clear", "Light Rain", "Fog"
  weather_temp: number | null;      // °F
  wind_speed: number | null;        // mph
  game_indoors: boolean;
}

export type GameData = Record<string, Record<number, GameResult>>;

// ─── Spread Betting ────────────────────────────────────────────────────────

export interface SpreadPick {
  id: string;
  league_id: string;
  user_id: string;
  team_id: string;
  week: number;
  locked_spread: number;   // negative = team is favored, positive = underdog
  side: 'cover' | 'against'; // which side of the line the pick is betting on
  picked_at: string;
  result: 'covered' | 'missed' | 'push' | null;
  points: number | null;
  commissioner_override: boolean;
}

// Map of teamId → spread point value (negative = favored, positive = underdog)
// null means no line available for that team this week
export type SpreadData = Record<string, number | null>;

// Live in-game state from CFBD's Patreon-only /scoreboard endpoint —
// distinct from GameResult (which only knows "not yet played" vs "final").
// Only populated for games currently in progress; empty/absent otherwise.
export interface LiveGameStatus {
  status: string;              // 'scheduled' | 'in_progress' | 'completed'
  period: number | null;       // quarter (1-4, 5+ for OT)
  clock: string | null;        // time remaining in the period, e.g. "9:24"
  situation: string | null;    // down & distance text, e.g. "1st & 10"
  possession: string | null;   // team name currently with the ball
  // Carried so a game that finished can show its final score immediately —
  // this app's own /games endpoint (GameResult.completed/home_score/
  // away_score) sits behind a 30-minute cache and can lag well behind a
  // game's real completion, leaving the scoreboard stuck showing pre-game
  // info for up to 30 minutes after the final whistle otherwise.
  home_points: number | null;
  away_points: number | null;
}

export interface APRanking {
  rank: number;
  team_name: string;
  team_id?: string;
  record: string;
  previous_rank: number | null;
  trend: 'up' | 'down' | 'same' | 'new';
}

// ─── Season Stats ──────────────────────────────────────────────────────────

export interface TeamSeasonStats {
  team_id: string;
  qbr:           number | null;   // passer rating
  rushing_tds:   number | null;
  receiving_tds: number | null;
  def_ints:      number | null;
  sacks:         number | null;
}

export interface StatRankingBonus {
  team_id:   string;
  team_name: string;
  stat:      StatBonusCategory;
  rank:      number;   // 1 = best
  points:    number;   // +3 or -3
  value:     number;   // actual stat value
  isPreview: boolean;  // true until commissioner locks conf championship week
}

// ─── Scoring Outputs ───────────────────────────────────────────────────────

export interface WeeklyScore {
  user_id: string;
  week: number;
  points: number;
  captain_team_id: string | null;
  spread_team_ids: string[];
  bench_team_ids: string[];
  breakdown: ScoreBreakdown[];
  fa_points: number; // free agency penalty applied this week (<= 0)
  correction_points: number; // commissioner score corrections applied this week
}

export interface ScoreBreakdown {
  team_id: string;
  team_name: string;
  points: number;
  is_captain: boolean;
  is_benched: boolean;
  spread_points: number;
  game: GameResult | null;
}

export interface LeaderboardEntry {
  user_id: string;
  display_name: string;
  avatar_type: AvatarType;
  avatar_value: string;
  total_points: number;
  weekly_scores: WeeklyScore[];
  bonus_points: number;
  stat_bonuses: StatRankingBonus[];
  stat_points: number;
  roster: RosterEntry[];
}

// ─── Season History ────────────────────────────────────────────────────────
// A frozen snapshot of a league's final standings, captured by a
// commissioner via "End Season" (after the real-world national championship
// game) before the league resets for a new season.

export interface SeasonHistoryEntry {
  user_id: string;
  display_name: string;
  avatar_type: AvatarType;
  avatar_value: string;
  total_points: number;
  rank: number;
}

export interface SeasonHistory {
  id: string;
  league_id: string;
  season_label: string;
  standings: SeasonHistoryEntry[];
  archived_at: string;
  trophies?: TrophySnapshot | null; // absent/null for seasons archived before this feature shipped
}

// ─── Trophy Case ───────────────────────────────────────────────────────────
// Achievement categories computed by src/services/trophies.ts, either live
// (current season) or frozen into SeasonHistory.trophies at endSeason() time.

export type TrophyCategoryId =
  | 'undefeated_team'
  | 'beat_spread'
  | 'used_free_agency'
  | 'heisman_winner'
  | 'p4_conf_champion'
  | 'negative_week'
  | 'first_losing_record_draft'
  | 'g5_team'
  | 'independent_team'
  | 'bad_week_tier'
  | 'made_cfp'
  | 'made_conf_championship';

export interface TrophyTeamRef {
  team_id: string;
  team_name: string;
  team_logo: string;
}

export interface TrophyWinner {
  user_id: string;
  display_name: string;
  avatar_type: AvatarType;
  avatar_value: string;
  teams: TrophyTeamRef[]; // empty for whole-roster trophies (negative week, bad week tier)
  tier?: number;          // conference-champion count, bad-week threshold index
  detail?: string;        // e.g. "Week 6 · −14 pts", or a date for the "first" trophy
}

export interface TrophyCategory {
  id: TrophyCategoryId;
  label: string;
  description: string;
  winners: TrophyWinner[];
}

export interface TrophySnapshot {
  computedAt: string;
  categories: TrophyCategory[];
}

// ─── Invites ───────────────────────────────────────────────────────────────

export interface Invite {
  id: string;
  league_id: string;
  invited_email: string;
  invited_by: string;
  token: string;
  accepted: boolean;
  created_at: string;
  leagues?: { name: string };
}
