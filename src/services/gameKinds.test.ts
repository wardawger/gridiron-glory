import { describe, it, expect } from 'vitest';
import { classifyGame } from './gameKinds';

describe('classifyGame', () => {
  it('uses the structured playoff round when present', () => {
    expect(classifyGame({ playoff: { competition: 'cfp', round: 'first_round' } }, true)).toBe('cfp_first_round');
    expect(classifyGame({ playoff: { round: 'quarterfinal' } }, true)).toBe('cfp_quarterfinal');
    expect(classifyGame({ playoff: { round: 'semifinal' } }, true)).toBe('cfp_semifinal');
    expect(classifyGame({ playoff: { round: 'championship' } }, true)).toBe('cfp_championship');
  });

  it('falls back to notes for playoff games', () => {
    expect(classifyGame({ notes: 'Rose Bowl - CFP Quarterfinal' }, true)).toBe('cfp_quarterfinal');
    expect(classifyGame({ notes: 'Peach Bowl - College Football Playoff Semifinal' }, true)).toBe('cfp_semifinal');
    expect(classifyGame({ notes: 'CFP National Championship' }, true)).toBe('cfp_championship');
    expect(classifyGame({ notes: 'College Football Playoff First Round' }, true)).toBe('cfp_first_round');
  });

  it('treats other postseason games as bowls', () => {
    expect(classifyGame({ notes: 'Pop-Tarts Bowl' }, true)).toBe('bowl');
    expect(classifyGame({ notes: null, playoff: null }, true)).toBe('bowl');
  });

  it('detects FBS conference championships in the regular season', () => {
    const base = { homeClassification: 'fbs', awayClassification: 'fbs', conferenceGame: true };
    expect(classifyGame({ ...base, notes: 'SEC Championship Game' }, false)).toBe('conference_championship');
  });

  it('does not mistake lower-division playoffs or ordinary games', () => {
    const base = { homeClassification: 'fbs', awayClassification: 'fbs', conferenceGame: true };
    expect(classifyGame({ ...base, notes: 'Division II Championship - First Round' }, false)).toBe('regular');
    expect(classifyGame({ homeClassification: 'fcs', awayClassification: 'fcs', notes: 'Big Sky Championship' }, false)).toBe('regular');
    expect(classifyGame({ ...base, notes: 'EARLY: Noon - 1pm ET start' }, false)).toBe('regular');
  });
});
