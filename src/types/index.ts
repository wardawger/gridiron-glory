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
  // Free agency settings
  free_agency_enabled: boolean;
  fa_max_moves_per_season: number; // max adds/drops per user for the whole season
  fa_max_moves_per_week: number;   // max adds/drops per user per week
  fa_penalty_enabled: boolean;
  fa_penalty_points: number;       // points subtracted the week a swap is made (entered as a positive number)
  // Statistical ranking bonus settings (Top 3 / Bottom 3 per category, among all drafted teams)
  stat_bonus_points: Record<StatBonusCategory, number>;        // points awarded/deducted per category, entered as a positive number
  stat_bonus_top3_enabled: boolean;
  stat_bonus_top3_categories: Record<StatBonusCategory, boolean>;
  stat_bonus_bottom3_enabled: boolean;
  stat_bonus_bottom3_categories: Record<StatBonusCategory, boolean>;
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
  // Free agency defaults — off until commissioner enables
  free_agency_enabled: false,
  fa_max_moves_per_season: 10,
  fa_max_moves_per_week: 2,
  fa_penalty_enabled: false,
  fa_penalty_points: 3,
  stat_bonus_points: { qbr: 3, rushing_tds: 3, receiving_tds: 3, def_ints: 3, sacks: 3 },
  stat_bonus_top3_enabled: true,
  stat_bonus_top3_categories: { qbr: true, rushing_tds: true, receiving_tds: true, def_ints: true, sacks: true },
  stat_bonus_bottom3_enabled: true,
  stat_bonus_bottom3_categories: { qbr: true, rushing_tds: true, receiving_tds: true, def_ints: true, sacks: true },
};

// Fills in any missing/legacy-shaped scoring fields with defaults — handles
// leagues saved before a settings field existed, or before it changed shape
// (e.g. stat_bonus_points used to be a single number, not per-category).
export function normalizeScoring(raw: Partial<ScoringSettings> | null | undefined): ScoringSettings {
  const isPlainObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);

  return {
    ...DEFAULT_SCORING,
    ...(raw ?? {}),
    stat_bonus_points: {
      ...DEFAULT_SCORING.stat_bonus_points,
      ...(isPlainObject(raw?.stat_bonus_points) ? raw!.stat_bonus_points as any : {}),
    },
    stat_bonus_top3_categories: {
      ...DEFAULT_SCORING.stat_bonus_top3_categories,
      ...(isPlainObject(raw?.stat_bonus_top3_categories) ? raw!.stat_bonus_top3_categories as any : {}),
    },
    stat_bonus_bottom3_categories: {
      ...DEFAULT_SCORING.stat_bonus_bottom3_categories,
      ...(isPlainObject(raw?.stat_bonus_bottom3_categories) ? raw!.stat_bonus_bottom3_categories as any : {}),
    },
  };
}

// ─── Draft ─────────────────────────────────────────────────────────────────

// P4 conferences for draft enforcement
export const P4_CONFERENCES = ['SEC', 'Big Ten', 'Big 12', 'ACC'] as const;
export type P4Conference = typeof P4_CONFERENCES[number];

// Draft rules: min 2 and max 3 from each P4 conference
export const DRAFT_CONF_MIN = 2;
export const DRAFT_CONF_MAX = 3;

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
  is_home: boolean;
  venue: string | null;
  tv: string | null;
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
  picked_at: string;
  result: 'covered' | 'missed' | null;
  points: number | null;
  commissioner_override: boolean;
}

// Map of teamId → spread point value (negative = favored, positive = underdog)
// null means no line available for that team this week
export type SpreadData = Record<string, number | null>;

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
  breakdown: ScoreBreakdown[];
  fa_points: number; // free agency penalty applied this week (<= 0)
}

export interface ScoreBreakdown {
  team_id: string;
  team_name: string;
  points: number;
  is_captain: boolean;
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
