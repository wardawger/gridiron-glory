// ─── Auth / Users ──────────────────────────────────────────────────────────

export interface Profile {
  id: string;          // matches auth.users.id
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
  draft_order: string[];      // array of user IDs in snake order
  draft_current_pick: number; // index into the flat pick sequence
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

export interface DraftPick {
  id: string;
  league_id: string;
  user_id: string;
  team_id: string;
  team_name: string;
  team_logo: string;
  team_conference: string;
  round: number;
  pick_number: number;       // overall pick number (1-based)
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
  | 'bowl_eligible'
  | 'win_bowl'
  | 'make_cc'
  | 'win_cc'
  | 'make_cfp'
  | 'win_cfp_game'
  | 'heisman';

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
  bowl_eligible: 'Bowl Eligible',
  win_bowl:      'Won Bowl Game',
  make_cc:       'Made Conf. Championship',
  win_cc:        'Won Conf. Championship',
  make_cfp:      'Made CFP',
  win_cfp_game:  'Won CFP Game',
  heisman:       'Heisman Trophy',
};

export const BONUS_DEFAULT_POINTS: Record<BonusType, number> = {
  bowl_eligible: 5,
  win_bowl:      5,
  make_cc:       10,
  win_cc:        10,
  make_cfp:      5,
  win_cfp_game:  10,
  heisman:       15,
};

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

// GameData: teamId → week → GameResult
export type GameData = Record<string, Record<number, GameResult>>;

export interface APRanking {
  rank: number;
  team_name: string;
  team_id?: string;
  record: string;
  previous_rank: number | null;
  trend: 'up' | 'down' | 'same' | 'new';
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
