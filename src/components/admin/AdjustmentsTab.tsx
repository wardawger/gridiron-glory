import { useState, useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type {
  League, LeagueMember, ManualBonus, DraftPick, SpreadPick, FreeAgencyMove, BonusType, ScoreCorrection,
  StatBonusCategory,
} from '../../types';
import { BONUS_LABELS, normalizeScoring } from '../../types';
import { rosterAtWeek } from '../../services/roster';

const WEEKS = Array.from({ length: 18 }, (_, i) => i); // weeks 0–17 — the full scored range, including conf-champ/bowl weeks

// The 10 stat-ranking BonusTypes default their award points from the
// Scoring tab's "Statistical Ranking Bonuses" settings (the single source
// of truth for those values) rather than from bonus_points — the naming
// isn't a simple string transform (e.g. top3_int -> def_ints, not "int"s),
// so it needs an explicit lookup.
const STAT_BONUS_TYPE_TO_CATEGORY: Partial<Record<BonusType, { cat: StatBonusCategory; side: 'top' | 'bottom' }>> = {
  top3_qbr:             { cat: 'qbr',           side: 'top' },
  top3_rushing_td:      { cat: 'rushing_tds',   side: 'top' },
  top3_receiving_td:    { cat: 'receiving_tds', side: 'top' },
  top3_int:             { cat: 'def_ints',      side: 'top' },
  top3_sacks:           { cat: 'sacks',         side: 'top' },
  bottom3_qbr:          { cat: 'qbr',           side: 'bottom' },
  bottom3_rushing_td:   { cat: 'rushing_tds',   side: 'bottom' },
  bottom3_receiving_td: { cat: 'receiving_tds', side: 'bottom' },
  bottom3_int:          { cat: 'def_ints',      side: 'bottom' },
  bottom3_sacks:        { cat: 'sacks',         side: 'bottom' },
};

interface Props {
  league: League;
  members: LeagueMember[];
  draftPicks: DraftPick[];
  freeAgencyMoves: FreeAgencyMove[];
  manualBonuses: ManualBonus[];
  spreadPicks: SpreadPick[];
  scoreCorrections: ScoreCorrection[];
  onAddBonus: (bonus: Omit<ManualBonus, 'id' | 'awarded_at' | 'awarded_by' | 'league_id'>) => void;
  onRemoveBonus: (id: string) => void;
  onOverrideSpread: (pickId: string, result: 'covered' | 'missed' | 'push', points: number) => Promise<{ error?: string }>;
  onClearSpreadOverride: (pickId: string) => Promise<{ error?: string }>;
  onAddCorrection: (correction: Omit<ScoreCorrection, 'id' | 'league_id' | 'created_at' | 'created_by'>) => Promise<{ error?: string }>;
  onRemoveCorrection: (id: string) => Promise<{ error?: string }>;
}

export function AdjustmentsTab({
  league, members, draftPicks, freeAgencyMoves, manualBonuses, spreadPicks, scoreCorrections,
  onAddBonus, onRemoveBonus, onOverrideSpread, onClearSpreadOverride, onAddCorrection, onRemoveCorrection,
}: Props) {
  const normalizedScoring = useMemo(() => normalizeScoring(league.scoring), [league.scoring]);
  const bonusPointsConfig = normalizedScoring.bonus_points;

  const defaultPointsFor = (t: BonusType): number => {
    const mapping = STAT_BONUS_TYPE_TO_CATEGORY[t];
    if (!mapping) return bonusPointsConfig[t];
    const c = normalizedScoring.stat_bonus_categories[mapping.cat];
    return mapping.side === 'top' ? c.top_points : c.bottom_points;
  };

  const [bonusUserId, setBonusUser]       = useState('');
  const [bonusType, setBonusType]         = useState<BonusType>('win_bowl');
  const [bonusTeamId, setBonusTeamId]     = useState('');
  const [bonusTeamName, setBonusTeamName] = useState('');
  const [bonusPoints, setBonusPoints]     = useState<string>(() => String(defaultPointsFor('win_bowl')));
  const [bonusNote, setBonusNote]         = useState('');

  // Teams currently rostered by the selected user (draft + free agency swaps)
  const userTeams = useMemo(() => {
    if (!bonusUserId) return [];
    return rosterAtWeek(bonusUserId, league.current_week, draftPicks, freeAgencyMoves)
      .map(t => ({ team_id: t.team_id, team_name: t.team_name }))
      .sort((a, b) => a.team_name.localeCompare(b.team_name));
  }, [draftPicks, freeAgencyMoves, bonusUserId, league.current_week]);

  // When user changes, reset team selection
  const handleUserChange = (uid: string) => {
    setBonusUser(uid);
    setBonusTeamId('');
    setBonusTeamName('');
  };

  // When team selection changes, populate both id and name
  const handleTeamChange = (teamId: string) => {
    const team = userTeams.find(t => t.team_id === teamId);
    setBonusTeamId(teamId);
    setBonusTeamName(team?.team_name ?? '');
  };

  const handleAddBonus = () => {
    if (!bonusUserId || !bonusTeamId || !bonusTeamName) return;
    onAddBonus({
      user_id:   bonusUserId,
      type:      bonusType,
      team_id:   bonusTeamId,
      team_name: bonusTeamName,
      points:    parseInt(bonusPoints) || 0,
      note:      bonusNote,
    });
    setBonusTeamId('');
    setBonusTeamName('');
    setBonusNote('');
  };

  // ─── Score correction form ────────────────────────────────────────────────
  const [correctionUserId, setCorrectionUser] = useState('');
  const [correctionWeek, setCorrectionWeek]   = useState(league.current_week);
  const [correctionTeamId, setCorrectionTeamId] = useState('');
  const [correctionTeamName, setCorrectionTeamName] = useState('');
  const [correctionPoints, setCorrectionPoints] = useState('');
  const [correctionNote, setCorrectionNote]   = useState('');
  const [correctionError, setCorrectionError] = useState('');
  const [addingCorrection, setAddingCorrection] = useState(false);

  // Team options reflect the roster AS OF the chosen week (not the league's
  // current week) since a correction can target a past week's roster.
  const correctionTeams = useMemo(() => {
    if (!correctionUserId) return [];
    return rosterAtWeek(correctionUserId, correctionWeek, draftPicks, freeAgencyMoves)
      .map(t => ({ team_id: t.team_id, team_name: t.team_name }))
      .sort((a, b) => a.team_name.localeCompare(b.team_name));
  }, [draftPicks, freeAgencyMoves, correctionUserId, correctionWeek]);

  const handleCorrectionUserChange = (uid: string) => {
    setCorrectionUser(uid);
    setCorrectionTeamId('');
    setCorrectionTeamName('');
  };

  const handleCorrectionTeamChange = (teamId: string) => {
    const team = correctionTeams.find(t => t.team_id === teamId);
    setCorrectionTeamId(teamId);
    setCorrectionTeamName(team?.team_name ?? '');
  };

  const handleAddCorrection = async () => {
    if (!correctionUserId || !correctionPoints) return;
    setAddingCorrection(true);
    setCorrectionError('');
    const result = await onAddCorrection({
      user_id:   correctionUserId,
      week:      correctionWeek,
      team_id:   correctionTeamId || null,
      team_name: correctionTeamId ? correctionTeamName : null,
      points:    parseFloat(correctionPoints) || 0,
      note:      correctionNote,
    });
    setAddingCorrection(false);
    if (result.error) { setCorrectionError(result.error); return; }
    setCorrectionTeamId('');
    setCorrectionTeamName('');
    setCorrectionPoints('');
    setCorrectionNote('');
  };

  return (
    <div className="space-y-4">
      <div className="card p-5 space-y-4">
        <p className="text-sm text-turf-400">Award postseason bonuses manually (bowls, CFP, Heisman, etc.).</p>
        <div className="grid grid-cols-2 gap-4">

          {/* Player selector */}
          <div>
            <label className="label">Player</label>
            <select className="input" value={bonusUserId} onChange={e => handleUserChange(e.target.value)}>
              <option value="">Select player…</option>
              {members.map(m => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}
            </select>
          </div>

          {/* Bonus type */}
          <div>
            <label className="label">Bonus Type</label>
            <select
              className="input"
              value={bonusType}
              onChange={e => {
                const t = e.target.value as BonusType;
                setBonusType(t);
                setBonusPoints(String(defaultPointsFor(t)));
              }}
            >
              {(Object.entries(BONUS_LABELS) as [BonusType, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {/* Team — populated from that user's draft picks */}
          <div>
            <label className="label">Team</label>
            {bonusUserId ? (
              userTeams.length > 0 ? (
                <select
                  className="input"
                  value={bonusTeamId}
                  onChange={e => handleTeamChange(e.target.value)}
                >
                  <option value="">Select team…</option>
                  {userTeams.map(p => (
                    <option key={p.team_id} value={p.team_id}>
                      {p.team_name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="input text-turf-500 cursor-default">No teams drafted yet</div>
              )
            ) : (
              <div className="input text-turf-500 cursor-default">Select a player first</div>
            )}
          </div>

          {/* Points */}
          <div>
            <label className="label">Points</label>
            <input className="input font-mono" type="number" value={bonusPoints}
              onChange={e => setBonusPoints(e.target.value)} />
          </div>

          {/* Note */}
          <div className="col-span-2">
            <label className="label">Note (optional)</label>
            <input className="input" placeholder="e.g. SEC Championship win" value={bonusNote}
              onChange={e => setBonusNote(e.target.value)} />
          </div>
        </div>

        <button
          onClick={handleAddBonus}
          disabled={!bonusUserId || !bonusTeamId}
          className="btn-gold"
        >
          <Plus className="w-4 h-4" /> Award Bonus
        </button>
      </div>

      {/* Awarded bonuses list */}
      {manualBonuses.length > 0 && (
        <div className="card divide-y divide-turf-800">
          {manualBonuses.map(b => {
            const mem = members.find(m => m.user_id === b.user_id);
            return (
              <div key={b.id} className="flex items-center gap-4 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white">{mem?.display_name}</span>
                    <span className="badge-gold text-xs">{BONUS_LABELS[b.type]}</span>
                  </div>
                  <p className="text-xs text-turf-500">{b.team_name} · {b.note}</p>
                </div>
                <span className={`font-mono font-bold ${b.points >= 0 ? 'text-gold-400' : 'text-red-300'}`}>
                  {b.points >= 0 ? '+' : '-'}{Math.abs(b.points)}
                </span>
                <button onClick={() => onRemoveBonus(b.id)} className="btn-ghost btn-sm text-red-300 hover:text-red-200">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Spread pick overrides */}
      {league.scoring.spread_enabled && spreadPicks.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-turf-800">
            <h3 className="font-medium text-white text-sm">Spread Pick Overrides</h3>
            <p className="text-xs text-turf-400 mt-0.5">Manually set result for any spread pick if auto-scoring is incorrect</p>
          </div>
          <div className="divide-y divide-turf-800 max-h-96 overflow-y-auto">
            {spreadPicks
              .sort((a, b) => b.week - a.week || a.user_id.localeCompare(b.user_id))
              .map(pick => {
                const mem = members.find(m => m.user_id === pick.user_id);
                const team = rosterAtWeek(pick.user_id, pick.week, draftPicks, freeAgencyMoves)
                  .find(t => t.team_id === pick.team_id);
                const spreadLabel = pick.locked_spread > 0
                  ? `+${pick.locked_spread} (underdog)`
                  : `${pick.locked_spread} (favored)`;
                const pickWon = !pick.result || pick.result === 'push'
                  ? null
                  : (pick.side === 'cover' ? pick.result === 'covered' : pick.result === 'missed');
                return (
                  <div key={pick.id} className="px-4 py-3 flex items-center gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white text-sm font-medium">{mem?.display_name}</span>
                        <span className="text-turf-400 text-xs">·</span>
                        <span className="text-turf-300 text-xs">{team?.team_name ?? pick.team_id}</span>
                        <span className="text-turf-500 text-xs">Wk {pick.week}</span>
                        <span className="font-mono text-xs text-turf-500">{spreadLabel}</span>
                        <span className="text-xs text-turf-500">{pick.side === 'against' ? 'Against' : 'Cover'}</span>
                        {pick.commissioner_override && (
                          <span className="badge-gold text-xs">Override</span>
                        )}
                      </div>
                      <div className="text-xs text-turf-500 mt-0.5">
                        {pick.result
                          ? <span className={pick.result === 'push' ? 'text-turf-400' : pickWon ? 'text-field-400' : 'text-red-300'}>
                              {pick.result === 'push' ? '= Push' : pick.result === 'covered' ? (pickWon ? '✓ Covered' : '✗ Covered') : (pickWon ? '✓ Missed' : '✗ Missed')}
                              {pick.points !== null ? ` · ${pick.points > 0 ? '+' : ''}${pick.points} pts` : ''}
                            </span>
                          : <span className="text-turf-500">Pending</span>
                        }
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => onOverrideSpread(pick.id, 'covered', pick.side === 'cover' ? league.scoring.spread_points : -league.scoring.spread_points)}
                        className="text-xs border border-field-700 text-field-400 hover:bg-field-900/30 rounded px-2 py-1 transition-colors"
                      >
                        ✓ Covered
                      </button>
                      <button
                        onClick={() => onOverrideSpread(pick.id, 'missed', pick.side === 'against' ? league.scoring.spread_points : -league.scoring.spread_points)}
                        className="text-xs border border-red-800 text-red-300 hover:bg-red-900/20 rounded px-2 py-1 transition-colors"
                      >
                        ✗ Missed
                      </button>
                      <button
                        onClick={() => onOverrideSpread(pick.id, 'push', 0)}
                        className="text-xs border border-turf-600 text-turf-300 hover:bg-turf-800/40 rounded px-2 py-1 transition-colors"
                      >
                        = Push
                      </button>
                      {pick.commissioner_override && (
                        <button
                          onClick={() => onClearSpreadOverride(pick.id)}
                          className="text-xs text-turf-500 hover:text-turf-300 transition-colors"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Score correction form */}
      <div className="card p-5 space-y-4">
        <div>
          <h3 className="font-medium text-white text-sm">Score Correction</h3>
          <p className="text-xs text-turf-400 mt-0.5">
            Add a flat point adjustment to a manager's total for a specific week — a safety net for when
            automatic scoring gets something wrong. Team is optional context only; it doesn't affect the math.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Player</label>
            <select className="input" value={correctionUserId} onChange={e => handleCorrectionUserChange(e.target.value)}>
              <option value="">Select player…</option>
              {members.map(m => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}
            </select>
          </div>

          <div>
            <label className="label">Week</label>
            <select className="input" value={correctionWeek} onChange={e => setCorrectionWeek(parseInt(e.target.value))}>
              {WEEKS.map(w => <option key={w} value={w}>Week {w}</option>)}
            </select>
          </div>

          <div>
            <label className="label">Team (optional)</label>
            {correctionUserId ? (
              <select className="input" value={correctionTeamId} onChange={e => handleCorrectionTeamChange(e.target.value)}>
                <option value="">No specific team</option>
                {correctionTeams.map(p => (
                  <option key={p.team_id} value={p.team_id}>{p.team_name}</option>
                ))}
              </select>
            ) : (
              <div className="input text-turf-500 cursor-default">Select a player first</div>
            )}
          </div>

          <div>
            <label className="label">Points</label>
            <input className="input font-mono" type="number" step="0.5" value={correctionPoints}
              onChange={e => setCorrectionPoints(e.target.value)} placeholder="e.g. 3 or -2" />
          </div>

          <div className="col-span-2">
            <label className="label">Note</label>
            <input className="input" placeholder="e.g. Missed a ranked-win bonus for Week 4" value={correctionNote}
              onChange={e => setCorrectionNote(e.target.value)} />
          </div>
        </div>

        {correctionError && <p className="text-xs text-red-300">{correctionError}</p>}

        <button
          onClick={handleAddCorrection}
          disabled={!correctionUserId || !correctionPoints || addingCorrection}
          className="btn-gold"
        >
          <Plus className="w-4 h-4" /> {addingCorrection ? 'Applying…' : 'Apply Correction'}
        </button>
      </div>

      {/* Existing corrections list */}
      {scoreCorrections.length > 0 && (
        <div className="card divide-y divide-turf-800">
          {scoreCorrections
            .sort((a, b) => b.week - a.week)
            .map(c => {
              const mem = members.find(m => m.user_id === c.user_id);
              return (
                <div key={c.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-white">{mem?.display_name}</span>
                      <span className="text-turf-500 text-xs">Wk {c.week}</span>
                      {c.team_name && <span className="badge-gold text-xs">{c.team_name}</span>}
                    </div>
                    {c.note && <p className="text-xs text-turf-500">{c.note}</p>}
                  </div>
                  <span className={`font-mono font-bold ${c.points >= 0 ? 'text-gold-400' : 'text-red-300'}`}>
                    {c.points >= 0 ? '+' : ''}{c.points}
                  </span>
                  <button onClick={() => onRemoveCorrection(c.id)} className="btn-ghost btn-sm text-red-300 hover:text-red-200">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
