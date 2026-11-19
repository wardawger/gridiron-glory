import type { GameKind } from '../types';

// Classifies a raw CFBD /games entry so postseason scoring can tell a bowl
// from a playoff round from a conference championship. CFBD carries a
// structured `playoff` object ({ competition, round, roundName, ... }) on
// playoff games; `notes` is the free-text fallback, and the only signal for
// conference championships (which CFBD files in the regular season).
const PLAYOFF_ROUNDS: Record<string, GameKind> = {
  first_round: 'cfp_first_round',
  quarterfinal: 'cfp_quarterfinal',
  semifinal: 'cfp_semifinal',
  championship: 'cfp_championship',
};

function fromText(text: string): GameKind | null {
  const t = text.toLowerCase();
  if (!/\bcfp\b|college football playoff|national championship/.test(t)) return null;
  if (/national championship|\bchampionship game\b/.test(t)) return 'cfp_championship';
  if (/semi/.test(t)) return 'cfp_semifinal';
  if (/quarter/.test(t)) return 'cfp_quarterfinal';
  if (/first.?round/.test(t)) return 'cfp_first_round';
  return null;
}

const FBS = 'fbs';

export function classifyGame(g: any, postseason: boolean): GameKind {
  const playoff = g?.playoff;
  if (playoff && typeof playoff === 'object') {
    const round = String(playoff.round ?? '').toLowerCase().replace(/[\s-]+/g, '_');
    if (PLAYOFF_ROUNDS[round]) return PLAYOFF_ROUNDS[round];
    const named = fromText(String(playoff.roundName ?? ''));
    if (named) return named;
  }
  const notes = String(g?.notes ?? '');
  if (postseason) {
    return fromText(notes) ?? 'bowl';
  }
  // Regular-season feed: a conference championship is an FBS-vs-FBS
  // conference game whose notes name a "Championship" (excluding the
  // lower-division NCAA championship rounds CFBD also lists).
  const homeClass = String(g?.homeClassification ?? g?.home_classification ?? '').toLowerCase();
  const awayClass = String(g?.awayClassification ?? g?.away_classification ?? '').toLowerCase();
  const conf = g?.conferenceGame ?? g?.conference_game;
  if (
    /championship/i.test(notes)
    && !/division|ncaa|fcs|playoff|cfp|national/i.test(notes)
    && homeClass === FBS && awayClass === FBS
    && conf !== false
  ) return 'conference_championship';
  return 'regular';
}

export const CFP_KINDS: GameKind[] = ['cfp_first_round', 'cfp_quarterfinal', 'cfp_semifinal', 'cfp_championship'];

// Captains don't apply to conference championships or any playoff round.
// Bowls (non-CFP) stay captain-eligible.
export function isCaptainEligibleGame(game: { game_kind?: GameKind } | null | undefined): boolean {
  const k = game?.game_kind;
  return !(k === 'conference_championship' || (k && CFP_KINDS.includes(k)));
}
