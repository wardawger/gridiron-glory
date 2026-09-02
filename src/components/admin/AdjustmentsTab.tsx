import { useState, useMemo, useId } from 'react';
import { Plus, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import type {
  League, LeagueMember, ManualBonus, DraftPick, SpreadPick, FreeAgencyMove, BonusType, ScoreCorrection,
  StatBonusCategory, GameData,
} from '../../types';
import { BONUS_LABELS, normalizeScoring } from '../../types';
import { rosterAtWeek } from '../../services/roster';
import { scoreGame, spreadPointsForOutcome } from '../../services/scoring';
import { DialogShell } from '../ui/DialogShell';

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

type SpreadResult = 'covered' | 'missed' | 'push';

interface Props {
  league: League;
  members: LeagueMember[];
  draftPicks: DraftPick[];
  freeAgencyMoves: FreeAgencyMove[];
  manualBonuses: ManualBonus[];
  spreadPicks: SpreadPick[];
  scoreCorrections: ScoreCorrection[];
  gameData: GameData;
  onAddBonus: (bonus: Omit<ManualBonus, 'id' | 'awarded_at' | 'awarded_by' | 'league_id'>) => void | Promise<void>;
  onRemoveBonus: (id: string) => void | Promise<void>;
  onOverrideSpread: (pickId: string, result: SpreadResult, points: number) => Promise<{ error?: string }>;
  onClearSpreadOverride: (pickId: string) => Promise<{ error?: string }>;
  onAddCorrection: (correction: Omit<ScoreCorrection, 'id' | 'league_id' | 'created_at' | 'created_by'>) => Promise<{ error?: string }>;
  onRemoveCorrection: (id: string) => Promise<{ error?: string }>;
}

const selectCls = 'input [&>option]:bg-turf-800 [&>option]:text-white';

export function AdjustmentsTab({
  league, members, draftPicks, freeAgencyMoves, manualBonuses, spreadPicks, scoreCorrections, gameData,
  onAddBonus, onRemoveBonus, onOverrideSpread, onClearSpreadOverride, onAddCorrection, onRemoveCorrection,
}: Props) {
  const uid = useId();
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
  const [addingBonus, setAddingBonus]     = useState(false);

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

  const handleAddBonus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bonusUserId || !bonusTeamId || !bonusTeamName || addingBonus) return;
    setAddingBonus(true);
    try {
      await onAddBonus({
        user_id:   bonusUserId,
        type:      bonusType,
        team_id:   bonusTeamId,
        team_name: bonusTeamName,
        points:    parseFloat(bonusPoints) || 0,
        note:      bonusNote,
      });
      setBonusTeamId('');
      setBonusTeamName('');
      setBonusNote('');
    } finally {
      setAddingBonus(false);
    }
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

  const handleAddCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctionUserId || !correctionPoints || addingCorrection) return;
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
    if (result.error) { setCorrectionError(`Couldn’t apply the correction: ${result.error}. Try again.`); return; }
    setCorrectionTeamId('');
    setCorrectionTeamName('');
    setCorrectionPoints('');
    setCorrectionNote('');
  };

  // ─── Spread overrides ─────────────────────────────────────────────────────
  // Sorted copies — Array.prototype.sort mutates in place, and these arrays
  // are props shared with the rest of the app.
  const sortedSpreadPicks = useMemo(
    () => [...spreadPicks].sort((a, b) => b.week - a.week || a.user_id.localeCompare(b.user_id)),
    [spreadPicks]
  );
  const sortedCorrections = useMemo(
    () => [...scoreCorrections].sort((a, b) => b.week - a.week),
    [scoreCorrections]
  );

  const [overridePendingId, setOverridePendingId] = useState<string | null>(null);
  const [overrideError, setOverrideError] = useState('');

  // Points for a forced outcome, computed with the same function live
  // scoring uses — so an override in multiplier mode (or with a custom
  // miss penalty) awards exactly what auto-scoring would have.
  const overridePoints = (pick: SpreadPick, result: SpreadResult): number => {
    const game = gameData[pick.team_id]?.[pick.week];
    const base = game ? scoreGame(game, normalizedScoring, false) : 0;
    return spreadPointsForOutcome(normalizedScoring, pick.side, result, base);
  };

  const runOverride = async (pick: SpreadPick, action: () => Promise<{ error?: string }>) => {
    if (overridePendingId) return;
    setOverridePendingId(pick.id);
    setOverrideError('');
    try {
      const r = await action();
      if (r.error) setOverrideError(`Couldn’t update that pick: ${r.error}. Try again.`);
    } finally {
      setOverridePendingId(null);
    }
  };

  // ─── Delete confirmations ─────────────────────────────────────────────────
  const [pendingDelete, setPendingDelete] = useState<{ kind: 'bonus' | 'correction'; id: string; summary: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError('');
    try {
      if (pendingDelete.kind === 'bonus') {
        await onRemoveBonus(pendingDelete.id);
      } else {
        const r = await onRemoveCorrection(pendingDelete.id);
        if (r.error) { setDeleteError(`Couldn’t remove it: ${r.error}. Try again.`); return; }
      }
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  const overrideBtn = 'text-xs rounded px-2.5 py-1.5 min-h-8 border transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-field-400';

  return (
    <div className="space-y-4">
      <form onSubmit={handleAddBonus} className="card p-5 space-y-4">
        <div>
          <h3 className="font-medium text-white text-sm">Award Bonus</h3>
          <p className="text-xs text-turf-400 mt-0.5">Award postseason bonuses manually (bowls, CFP, Heisman, etc.).</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Player selector */}
          <div>
            <label htmlFor={`${uid}-b-player`} className="label">Player</label>
            <select id={`${uid}-b-player`} name="bonus_player" className={selectCls} value={bonusUserId} onChange={e => handleUserChange(e.target.value)}>
              <option value="">Select player…</option>
              {members.map(m => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}
            </select>
          </div>

          {/* Bonus type */}
          <div>
            <label htmlFor={`${uid}-b-type`} className="label">Bonus Type</label>
            <select
              id={`${uid}-b-type`}
              name="bonus_type"
              className={selectCls}
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
            <label htmlFor={`${uid}-b-team`} className="label">Team</label>
            <select
              id={`${uid}-b-team`}
              name="bonus_team"
              className={selectCls}
              value={bonusTeamId}
              disabled={!bonusUserId || userTeams.length === 0}
              onChange={e => handleTeamChange(e.target.value)}
            >
              <option value="">
                {!bonusUserId ? 'Select a player first' : userTeams.length === 0 ? 'No teams drafted yet' : 'Select team…'}
              </option>
              {userTeams.map(p => (
                <option key={p.team_id} value={p.team_id}>{p.team_name}</option>
              ))}
            </select>
          </div>

          {/* Points */}
          <div>
            <label htmlFor={`${uid}-b-points`} className="label">Points</label>
            <input
              id={`${uid}-b-points`}
              name="bonus_points"
              className="input font-mono tabular-nums"
              type="number"
              inputMode="decimal"
              autoComplete="off"
              step="0.5"
              value={bonusPoints}
              onChange={e => setBonusPoints(e.target.value)}
            />
          </div>

          {/* Note */}
          <div className="sm:col-span-2">
            <label htmlFor={`${uid}-b-note`} className="label">Note (optional)</label>
            <input
              id={`${uid}-b-note`}
              name="bonus_note"
              className="input"
              autoComplete="off"
              placeholder="SEC Championship win…"
              value={bonusNote}
              onChange={e => setBonusNote(e.target.value)}
            />
          </div>
        </div>

        <button type="submit" disabled={!bonusUserId || !bonusTeamId || addingBonus} className="btn-gold">
          {addingBonus ? <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Plus className="w-4 h-4" aria-hidden="true" />}
          {addingBonus ? 'Awarding…' : 'Award Bonus'}
        </button>
      </form>

      {/* Awarded bonuses list */}
      {manualBonuses.length > 0 && (
        <div className="card divide-y divide-turf-800">
          {manualBonuses.map(b => {
            const mem = members.find(m => m.user_id === b.user_id);
            const summary = `${BONUS_LABELS[b.type]} for ${mem?.display_name ?? 'this manager'} (${b.team_name})`;
            return (
              <div key={b.id} className="flex items-center gap-4 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-white">{mem?.display_name}</span>
                    <span className="badge-gold text-xs">{BONUS_LABELS[b.type]}</span>
                  </div>
                  <p className="text-xs text-turf-500 truncate">{b.team_name}{b.note ? ` · ${b.note}` : ''}</p>
                </div>
                <span className={`font-mono font-bold tabular-nums ${b.points >= 0 ? 'text-gold-400' : 'text-red-300'}`}>
                  {b.points >= 0 ? '+' : '−'}{Math.abs(b.points)}
                </span>
                <button
                  type="button"
                  onClick={() => { setDeleteError(''); setPendingDelete({ kind: 'bonus', id: b.id, summary }); }}
                  className="btn-ghost btn-sm text-red-300 hover:text-red-200"
                  aria-label={`Remove bonus: ${summary}`}
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Spread pick overrides */}
      {league.scoring.spread_enabled && sortedSpreadPicks.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-turf-800">
            <h3 className="font-medium text-white text-sm">Spread Pick Overrides</h3>
            <p className="text-xs text-turf-400 mt-0.5">Manually set the result for any spread pick if auto-scoring is incorrect. Points follow the league’s point mode.</p>
          </div>
          {overrideError && (
            <p role="alert" className="text-xs text-red-300 px-5 py-2 border-b border-turf-800">{overrideError}</p>
          )}
          <div className="divide-y divide-turf-800 max-h-96 overflow-y-auto overscroll-contain">
            {sortedSpreadPicks.map(pick => {
              const mem = members.find(m => m.user_id === pick.user_id);
              const team = rosterAtWeek(pick.user_id, pick.week, draftPicks, freeAgencyMoves)
                .find(t => t.team_id === pick.team_id);
              const spreadLabel = pick.locked_spread > 0
                ? `+${pick.locked_spread} (underdog)`
                : `${pick.locked_spread} (favored)`;
              const pickWon = !pick.result || pick.result === 'push'
                ? null
                : (pick.side === 'cover' ? pick.result === 'covered' : pick.result === 'missed');
              const pending = overridePendingId === pick.id;
              const who = `${mem?.display_name ?? 'manager'}, ${team?.team_name ?? pick.team_id}, week ${pick.week}`;
              const resultOptions: { result: SpreadResult; label: string; glyph: string; cls: string }[] = [
                { result: 'covered', label: 'Covered', glyph: '✓', cls: 'border-field-700 text-field-400 hover:bg-field-900/30 aria-pressed:bg-field-900/40' },
                { result: 'missed',  label: 'Missed',  glyph: '✗', cls: 'border-red-800 text-red-300 hover:bg-red-900/20 aria-pressed:bg-red-900/30' },
                { result: 'push',    label: 'Push',    glyph: '=', cls: 'border-turf-600 text-turf-300 hover:bg-turf-800/40 aria-pressed:bg-turf-800/60' },
              ];
              return (
                <div key={pick.id} className="px-4 py-3 flex items-center gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white text-sm font-medium">{mem?.display_name}</span>
                      <span className="text-turf-400 text-xs" aria-hidden="true">·</span>
                      <span className="text-turf-300 text-xs">{team?.team_name ?? pick.team_id}</span>
                      <span className="text-turf-500 text-xs">Wk {pick.week}</span>
                      <span className="font-mono text-xs text-turf-500 tabular-nums">{spreadLabel}</span>
                      <span className="text-xs text-turf-500">{pick.side === 'against' ? 'Against' : 'Cover'}</span>
                      {pick.commissioner_override && (
                        <span className="badge-gold text-xs">Override</span>
                      )}
                    </div>
                    <div className="text-xs text-turf-500 mt-0.5">
                      {pick.result
                        ? <span className={pick.result === 'push' ? 'text-turf-400' : pickWon ? 'text-field-400' : 'text-red-300'}>
                            <span aria-hidden="true">{pick.result === 'push' ? '= ' : pickWon ? '✓ ' : '✗ '}</span>
                            {pick.result === 'push' ? 'Push' : pick.result === 'covered' ? 'Covered' : 'Missed'}
                            {pick.result !== 'push' && <span className="sr-only"> — pick {pickWon ? 'won' : 'lost'}</span>}
                            {pick.points !== null ? ` · ${pick.points > 0 ? '+' : ''}${pick.points} pts` : ''}
                          </span>
                        : <span className="text-turf-500">Pending</span>
                      }
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0" role="group" aria-label={`Override result for ${who}`}>
                    {resultOptions.map(o => (
                      <button
                        key={o.result}
                        type="button"
                        disabled={pending}
                        aria-pressed={pick.commissioner_override && pick.result === o.result}
                        aria-label={`Mark ${o.label.toLowerCase()}: ${who}`}
                        onClick={() => runOverride(pick, () => onOverrideSpread(pick.id, o.result, overridePoints(pick, o.result)))}
                        className={`${overrideBtn} ${o.cls}`}
                      >
                        <span aria-hidden="true">{o.glyph} </span>{o.label}
                      </button>
                    ))}
                    {pick.commissioner_override && (
                      <button
                        type="button"
                        disabled={pending}
                        aria-label={`Clear override: ${who}`}
                        onClick={() => runOverride(pick, () => onClearSpreadOverride(pick.id))}
                        className={`${overrideBtn} border-transparent text-turf-500 hover:text-turf-300`}
                      >
                        Clear
                      </button>
                    )}
                    {pending && <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none text-turf-500" aria-hidden="true" />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Score correction form */}
      <form onSubmit={handleAddCorrection} className="card p-5 space-y-4">
        <div>
          <h3 className="font-medium text-white text-sm">Score Correction</h3>
          <p className="text-xs text-turf-400 mt-0.5">
            Add a flat point adjustment to a manager’s total for a specific week — a safety net for when
            automatic scoring gets something wrong. Team is optional context only; it doesn’t affect the math.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor={`${uid}-c-player`} className="label">Player</label>
            <select id={`${uid}-c-player`} name="correction_player" className={selectCls} value={correctionUserId} onChange={e => handleCorrectionUserChange(e.target.value)}>
              <option value="">Select player…</option>
              {members.map(m => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor={`${uid}-c-week`} className="label">Week</label>
            <select id={`${uid}-c-week`} name="correction_week" className={selectCls} value={correctionWeek} onChange={e => setCorrectionWeek(parseInt(e.target.value))}>
              {WEEKS.map(w => <option key={w} value={w}>Week {w}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor={`${uid}-c-team`} className="label">Team (optional)</label>
            <select
              id={`${uid}-c-team`}
              name="correction_team"
              className={selectCls}
              value={correctionTeamId}
              disabled={!correctionUserId}
              onChange={e => handleCorrectionTeamChange(e.target.value)}
            >
              <option value="">{correctionUserId ? 'No specific team' : 'Select a player first'}</option>
              {correctionTeams.map(p => (
                <option key={p.team_id} value={p.team_id}>{p.team_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={`${uid}-c-points`} className="label">Points</label>
            <input
              id={`${uid}-c-points`}
              name="correction_points"
              className="input font-mono tabular-nums"
              type="number"
              inputMode="decimal"
              autoComplete="off"
              step="0.5"
              value={correctionPoints}
              onChange={e => setCorrectionPoints(e.target.value)}
              placeholder="3 or -2…"
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor={`${uid}-c-note`} className="label">Note</label>
            <input
              id={`${uid}-c-note`}
              name="correction_note"
              className="input"
              autoComplete="off"
              placeholder="Missed a ranked-win bonus for Week 4…"
              value={correctionNote}
              onChange={e => setCorrectionNote(e.target.value)}
            />
          </div>
        </div>

        {correctionError && <p role="alert" className="text-xs text-red-300">{correctionError}</p>}

        <button type="submit" disabled={!correctionUserId || !correctionPoints || addingCorrection} className="btn-gold">
          {addingCorrection ? <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Plus className="w-4 h-4" aria-hidden="true" />}
          {addingCorrection ? 'Applying…' : 'Apply Correction'}
        </button>
      </form>

      {/* Existing corrections list */}
      {sortedCorrections.length > 0 && (
        <div className="card divide-y divide-turf-800">
          {sortedCorrections.map(c => {
            const mem = members.find(m => m.user_id === c.user_id);
            const summary = `${c.points >= 0 ? '+' : ''}${c.points} pts for ${mem?.display_name ?? 'this manager'}, week ${c.week}`;
            return (
              <div key={c.id} className="flex items-center gap-4 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-white">{mem?.display_name}</span>
                    <span className="text-turf-500 text-xs">Wk {c.week}</span>
                    {c.team_name && <span className="badge-gold text-xs">{c.team_name}</span>}
                  </div>
                  {c.note && <p className="text-xs text-turf-500 truncate">{c.note}</p>}
                </div>
                <span className={`font-mono font-bold tabular-nums ${c.points >= 0 ? 'text-gold-400' : 'text-red-300'}`}>
                  {c.points >= 0 ? '+' : ''}{c.points}
                </span>
                <button
                  type="button"
                  onClick={() => { setDeleteError(''); setPendingDelete({ kind: 'correction', id: c.id, summary }); }}
                  className="btn-ghost btn-sm text-red-300 hover:text-red-200"
                  aria-label={`Remove correction: ${summary}`}
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirmation */}
      {pendingDelete && (
        <DialogShell onClose={() => setPendingDelete(null)} locked={deleting} labelledBy={`${uid}-del-title`} panelClassName="border-red-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-900/40 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-300" aria-hidden="true" />
            </div>
            <h3 id={`${uid}-del-title`} className="font-display text-xl text-white tracking-wide">
              {pendingDelete.kind === 'bonus' ? 'Remove Bonus?' : 'Remove Correction?'}
            </h3>
          </div>
          <p className="text-sm text-turf-300">
            This removes <span className="text-white font-medium">{pendingDelete.summary}</span> and recalculates standings.
            You can award it again later if needed.
          </p>
          {deleteError && <p role="alert" className="text-xs text-red-300">{deleteError}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setPendingDelete(null)} disabled={deleting} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="button" onClick={confirmDelete} disabled={deleting} className="btn-danger flex-1">
              {deleting && <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              {deleting ? 'Removing…' : 'Yes, Remove'}
            </button>
          </div>
        </DialogShell>
      )}
    </div>
  );
}
