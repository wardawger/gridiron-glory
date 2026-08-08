import { useState, useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type {
  League, LeagueMember, ManualBonus, DraftPick, SpreadPick, FreeAgencyMove, BonusType,
} from '../../types';
import { BONUS_LABELS, normalizeScoring } from '../../types';
import { rosterAtWeek } from '../../services/roster';

interface Props {
  league: League;
  members: LeagueMember[];
  draftPicks: DraftPick[];
  freeAgencyMoves: FreeAgencyMove[];
  manualBonuses: ManualBonus[];
  spreadPicks: SpreadPick[];
  onAddBonus: (bonus: Omit<ManualBonus, 'id' | 'awarded_at' | 'awarded_by' | 'league_id'>) => void;
  onRemoveBonus: (id: string) => void;
  onOverrideSpread: (pickId: string, result: 'covered' | 'missed', points: number) => Promise<{ error?: string }>;
  onClearSpreadOverride: (pickId: string) => Promise<{ error?: string }>;
}

export function BonusesTab({
  league, members, draftPicks, freeAgencyMoves, manualBonuses, spreadPicks,
  onAddBonus, onRemoveBonus, onOverrideSpread, onClearSpreadOverride,
}: Props) {
  const bonusPointsConfig = useMemo(() => normalizeScoring(league.scoring).bonus_points, [league.scoring]);

  const [bonusUserId, setBonusUser]       = useState('');
  const [bonusType, setBonusType]         = useState<BonusType>('win_bowl');
  const [bonusTeamId, setBonusTeamId]     = useState('');
  const [bonusTeamName, setBonusTeamName] = useState('');
  const [bonusPoints, setBonusPoints]     = useState<string>(() => String(bonusPointsConfig.win_bowl));
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
                setBonusPoints(String(bonusPointsConfig[t]));
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
                return (
                  <div key={pick.id} className="px-4 py-3 flex items-center gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white text-sm font-medium">{mem?.display_name}</span>
                        <span className="text-turf-400 text-xs">·</span>
                        <span className="text-turf-300 text-xs">{team?.team_name ?? pick.team_id}</span>
                        <span className="text-turf-500 text-xs">Wk {pick.week}</span>
                        <span className="font-mono text-xs text-turf-500">{spreadLabel}</span>
                        {pick.commissioner_override && (
                          <span className="badge-gold text-xs">Override</span>
                        )}
                      </div>
                      <div className="text-xs text-turf-500 mt-0.5">
                        {pick.result
                          ? <span className={pick.result === 'covered' ? 'text-field-400' : 'text-red-300'}>
                              {pick.result === 'covered' ? '✓ Covered' : '✗ Missed'}
                              {pick.points !== null ? ` · ${pick.points > 0 ? '+' : ''}${pick.points} pts` : ''}
                            </span>
                          : <span className="text-turf-500">Pending</span>
                        }
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => onOverrideSpread(pick.id, 'covered', league.scoring.spread_points)}
                        className="text-xs border border-field-700 text-field-400 hover:bg-field-900/30 rounded px-2 py-1 transition-colors"
                      >
                        ✓ Covered
                      </button>
                      <button
                        onClick={() => onOverrideSpread(pick.id, 'missed', -league.scoring.spread_points)}
                        className="text-xs border border-red-800 text-red-300 hover:bg-red-900/20 rounded px-2 py-1 transition-colors"
                      >
                        ✗ Missed
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
    </div>
  );
}
