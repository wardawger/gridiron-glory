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

export interface LeagueMember {
  league_id: string;
  user_id: string;
  display_name: string;
  role: LeagueRole;
  joined_at: string;
}

// ─── Scoring ───────────────────────────────────────────────────────────────

export interface ScoringSettings {
  win: number;
  win_ranked: number;
  win_top15: number;
  win_top5: number;
  loss: number;
  loss_g5: number;
}

export const DEFAULT_SCORING: ScoringSettings = {
  win: 1,
  win_ranked: 1,
  win_top15: 2,
  win_top5: 3,
  loss: -1,
  loss_g5: -5,
};

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
  opponent_rank: number | null;
  result: 'W' | 'L' | null;
  is_g5_opponent: boolean;
  home_score: number | null;
  away_score: number | null;
  completed: boolean;
}

export type GameData = Record<string, Record<number, GameResult>>;

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
  stat:      'qbr' | 'rushing_tds' | 'receiving_tds' | 'def_ints' | 'sacks';
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
  breakdown: ScoreBreakdown[];
}

export interface ScoreBreakdown {
  team_id: string;
  team_name: string;
  points: number;
  is_captain: boolean;
  game: GameResult | null;
}

export interface LeaderboardEntry {
  user_id: string;
  display_name: string;
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
