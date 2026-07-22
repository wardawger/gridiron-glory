import { useState, useMemo } from 'react';
import { Shield, UserPlus, Copy, Check, Trash2, Plus, Mail, Settings, Gift, RotateCcw, AlertTriangle } from 'lucide-react';
import type {
  League, LeagueMember, ManualBonus, DraftPick, SpreadPick, FreeAgencyMove,
  BonusType, ScoringSettings,
} from '../../types';
import { BONUS_LABELS, BONUS_DEFAULT_POINTS, DEFAULT_SCORING } from '../../types';
import { rosterAtWeek } from '../../services/roster';

interface Props {
  league: League;
  members: LeagueMember[];
  draftPicks: DraftPick[];
  manualBonuses: ManualBonus[];
  spreadPicks: SpreadPick[];
  freeAgencyMoves: FreeAgencyMove[];
  isCommissioner: boolean;
  onSendInvite: (email: string) => Promise<{ token?: string; error?: string }>;
  onUpdateWeek: (week: number) => void;
  onUpdateScoring: (s: ScoringSettings) => void;
  onAddBonus: (bonus: Omit<ManualBonus, 'id' | 'awarded_at' | 'awarded_by' | 'league_id'>) => void;
  onRemoveBonus: (id: string) => void;
  onRemoveFromRoster: (userId: string, teamId: string) => void;
  onResetDraft: () => Promise<{ error?: string }>;
  onOverrideSpread: (pickId: string, result: 'covered' | 'missed', points: number) => Promise<{ error?: string }>;
  onClearSpreadOverride: (pickId: string) => Promise<{ error?: string }>;
}

type Tab = 'members' | 'scoring' | 'bonuses';

export function AdminPanel({
  league, members, draftPicks, manualBonuses, spreadPicks, freeAgencyMoves, isCommissioner,
  onSendInvite, onUpdateWeek, onUpdateScoring, onAddBonus, onRemoveBonus, onResetDraft,
  onOverrideSpread, onClearSpreadOverride,
}: Props) {
  const [tab, setTab]           = useState<Tab>('members');
  const [inviteEmail, setEmail] = useState('');
  const [inviteLink, setLink]   = useState('');
  const [copied, setCopied]     = useState(false);
  const [inviting, setInviting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState('');
  const [scoring, setScoring]   = useState<ScoringSettings>({ ...DEFAULT_SCORING, ...league.scoring });
  const [bonusUserId, setBonusUser]       = useState('');
  const [bonusType, setBonusType]         = useState<BonusType>('win_bowl');
  const [bonusTeamId, setBonusTeamId]     = useState('');
  const [bonusTeamName, setBonusTeamName] = useState('');
  const [bonusPoints, setBonusPoints]     = useState<number>(5);
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

  if (!isCommissioner) {
    return (
      <div className="text-center py-20 text-turf-500">
        <Shield className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p>Commissioner access only</p>
      </div>
    );
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    const result = await onSendInvite(inviteEmail.trim());
    if (result.token) {
      const link = `${window.location.origin}/join/${result.token}`;
      setLink(link);
      setEmail('');
    }
    setInviting(false);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveScoring = () => onUpdateScoring(scoring);

  const handleAddBonus = () => {
    if (!bonusUserId || !bonusTeamId || !bonusTeamName) return;
    onAddBonus({
      user_id:   bonusUserId,
      type:      bonusType,
      team_id:   bonusTeamId,
      team_name: bonusTeamName,
      points:    bonusPoints,
      note:      bonusNote,
    });
    setBonusTeamId('');
    setBonusTeamName('');
    setBonusNote('');
  };

  const handleResetDraft = async () => {
    const confirmed = window.confirm(
      '⚠️ Reset the draft?\n\n' +
      'This will permanently delete ALL draft picks and return the league to pre-draft status.\n\n' +
      'This cannot be undone. Are you sure?'
    );
    if (!confirmed) return;

    const doubleConfirmed = window.confirm(
      'Last chance — are you absolutely sure you want to delete all draft picks?'
    );
    if (!doubleConfirmed) return;

    setResetting(true);
    setResetError('');
    const result = await onResetDraft();
    if (result?.error) setResetError(result.error);
    setResetting(false);
  };

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'members',  label: 'Members & Invites',  icon: UserPlus },
    { id: 'scoring',  label: 'Scoring',             icon: Settings },
    { id: 'bonuses',  label: 'Postseason Bonuses',  icon: Gift },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center gap-3">
        <Shield className="w-6 h-6 text-field-400" />
        <h1 className="section-title text-2xl">Commissioner Panel</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-turf-900 p-1 rounded-xl border border-turf-800">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 flex-1 justify-center py-2 rounded-lg text-sm font-medium transition-all ${
              tab === id
                ? 'bg-field-500 text-turf-950'
                : 'text-turf-400 hover:text-white'
            }`}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* ── MEMBERS TAB ──────────────────────────────────── */}
      {tab === 'members' && (
        <div className="space-y-4">
          {/* Invite form */}
          <div className="card p-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Mail className="w-4 h-4 text-field-400" />
              <h3 className="font-medium text-white">Invite Player</h3>
            </div>
            <form onSubmit={handleInvite} className="flex gap-2">
              <input
                className="input flex-1"
                type="email"
                placeholder="player@email.com"
                value={inviteEmail}
                onChange={e => setEmail(e.target.value)}
                required
              />
              <button type="submit" disabled={inviting} className="btn-primary">
                <UserPlus className="w-4 h-4" />
                {inviting ? 'Sending…' : 'Invite'}
              </button>
            </form>

            {inviteLink && (
              <div className="space-y-2">
                <p className="text-xs text-turf-400">Share this link with the player:</p>
                <div className="flex gap-2 items-center">
                  <code className="flex-1 text-xs bg-turf-800 border border-turf-600 rounded-lg px-3 py-2 text-field-300 break-all">
                    {inviteLink}
                  </code>
                  <button onClick={copyLink} className="btn-secondary btn-sm flex-shrink-0">
                    {copied ? <Check className="w-4 h-4 text-field-400" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Member list */}
          <div className="card divide-y divide-turf-800">
            {members.map(m => (
              <div key={m.user_id} className="flex items-center gap-4 px-5 py-3">
                <div className="w-8 h-8 rounded-full bg-field-900 flex items-center justify-center text-field-400 font-bold text-sm">
                  {m.display_name[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white truncate">{m.display_name}</p>
                  <p className="text-xs text-turf-500">{new Date(m.joined_at).toLocaleDateString()}</p>
                </div>
                {m.role === 'commissioner' && (
                  <span className="badge-green text-xs">Commissioner</span>
                )}
              </div>
            ))}
          </div>

          {/* Current week */}
          <div className="card p-5 flex items-center justify-between">
            <div>
              <p className="font-medium text-white">Current Week</p>
              <p className="text-xs text-turf-500">Used for scoring display</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => onUpdateWeek(Math.max(0, league.current_week - 1))} className="btn-secondary btn-sm px-3">−</button>
              <span className="font-mono text-xl text-white w-8 text-center">{league.current_week}</span>
              <button onClick={() => onUpdateWeek(Math.min(18, league.current_week + 1))} className="btn-secondary btn-sm px-3">+</button>
            </div>
          </div>

          {/* Reset Draft */}
          <div className="card p-5 border-red-900/40">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-white">Reset Draft</p>
                  <p className="text-xs text-turf-500 mt-0.5">
                    Deletes all draft picks and returns the league to pre-draft status.
                    Captain picks and bonuses are not affected.
                    This cannot be undone.
                  </p>
                  {resetError && (
                    <p className="text-xs text-red-400 mt-2">{resetError}</p>
                  )}
                </div>
              </div>
              <button
                onClick={handleResetDraft}
                disabled={resetting}
                className="btn-danger flex-shrink-0"
              >
                <RotateCcw className={`w-4 h-4 ${resetting ? 'animate-spin' : ''}`} />
                {resetting ? 'Resetting…' : 'Reset Draft'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SCORING TAB ──────────────────────────────────── */}
      {tab === 'scoring' && (
        <div className="space-y-4">
          {/* Base scoring */}
          <div className="card p-5 space-y-4">
            <h3 className="font-medium text-white text-sm">Base Scoring</h3>
            <p className="text-xs text-turf-400">Adjust scoring settings for this league. Changes apply to all weeks.</p>
            <div className="grid grid-cols-2 gap-4">
              {(['win', 'win_ranked', 'win_top15', 'win_top5', 'loss', 'loss_g5'] as const).map(key => {
                const labels: Record<string, string> = {
                  win: 'Win', win_ranked: 'Beat Ranked', win_top15: 'Beat Top 15',
                  win_top5: 'Beat Top 5', loss: 'Loss', loss_g5: 'Loss to G5',
                };
                return (
                  <div key={key}>
                    <label className="label">{labels[key]}</label>
                    <input
                      className="input font-mono"
                      type="number"
                      step="0.5"
                      value={scoring[key] as number}
                      onChange={e => setScoring(prev => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Spread betting settings */}
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-white text-sm">Spread Betting</h3>
                <p className="text-xs text-turf-400 mt-0.5">Users pick which teams will cover or beat the spread each week</p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-xs text-turf-400">{scoring.spread_enabled ? 'Enabled' : 'Disabled'}</span>
                <button
                  onClick={() => setScoring(prev => ({ ...prev, spread_enabled: !prev.spread_enabled }))}
                  className={`relative w-10 h-5 rounded-full transition-colors ${scoring.spread_enabled ? 'bg-field-500' : 'bg-turf-700'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${scoring.spread_enabled ? 'left-5' : 'left-0.5'}`} />
                </button>
              </label>
            </div>

            {scoring.spread_enabled && (
              <div className="space-y-4 pt-2 border-t border-turf-800">
                {/* Points mode toggle */}
                <div>
                  <label className="label">Point Mode</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setScoring(prev => ({ ...prev, spread_is_multiplier: false }))}
                      className={`flex-1 py-2 rounded-lg text-sm border transition-all ${!scoring.spread_is_multiplier ? 'bg-field-500 text-turf-950 border-field-500' : 'border-turf-700 text-turf-400 hover:text-white'}`}
                    >
                      Flat Points
                    </button>
                    <button
                      onClick={() => setScoring(prev => ({ ...prev, spread_is_multiplier: true }))}
                      className={`flex-1 py-2 rounded-lg text-sm border transition-all ${scoring.spread_is_multiplier ? 'bg-field-500 text-turf-950 border-field-500' : 'border-turf-700 text-turf-400 hover:text-white'}`}
                    >
                      Multiplier
                    </button>
                  </div>
                  <p className="text-xs text-turf-500 mt-1">
                    {scoring.spread_is_multiplier
                      ? 'Multiplier: earn a multiple of the base game points for covering'
                      : 'Flat: earn a set number of points for covering the spread'}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">
                      {scoring.spread_is_multiplier ? 'Multiplier (×)' : 'Points for Covering'}
                    </label>
                    <input
                      className="input font-mono"
                      type="number"
                      step={scoring.spread_is_multiplier ? '0.1' : '0.5'}
                      min="0"
                      value={scoring.spread_points}
                      onChange={e => setScoring(prev => ({ ...prev, spread_points: parseFloat(e.target.value) || 0 }))}
                    />
                    <p className="text-xs text-turf-600 mt-0.5">
                      Penalty for missing: {scoring.spread_is_multiplier ? `×${scoring.spread_points}` : `-${scoring.spread_points} pts`}
                    </p>
                  </div>

                  <div>
                    <label className="label">Max Picks / Week</label>
                    <input
                      className="input font-mono"
                      type="number"
                      min="1"
                      max="10"
                      value={scoring.spread_max_per_week}
                      onChange={e => setScoring(prev => ({ ...prev, spread_max_per_week: parseInt(e.target.value) || 1 }))}
                    />
                  </div>

                  <div>
                    <label className="label">Max Picks / Team / Season</label>
                    <input
                      className="input font-mono"
                      type="number"
                      min="1"
                      max="20"
                      value={scoring.spread_max_per_team}
                      onChange={e => setScoring(prev => ({ ...prev, spread_max_per_team: parseInt(e.target.value) || 1 }))}
                    />
                  </div>

                  <div className="flex flex-col justify-end">
                    <label className="label">Captain Stacking</label>
                    <label className="flex items-center gap-2 cursor-pointer mt-1">
                      <button
                        onClick={() => setScoring(prev => ({ ...prev, spread_allow_captain_stack: !prev.spread_allow_captain_stack }))}
                        className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${scoring.spread_allow_captain_stack ? 'bg-field-500' : 'bg-turf-700'}`}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${scoring.spread_allow_captain_stack ? 'left-5' : 'left-0.5'}`} />
                      </button>
                      <span className="text-xs text-turf-400">
                        {scoring.spread_allow_captain_stack ? 'Allowed' : 'Not allowed'}
                      </span>
                    </label>
                    <p className="text-xs text-turf-600 mt-0.5">Pick spread on captain's team</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Free agency settings */}
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-white text-sm">Free Agency</h3>
                <p className="text-xs text-turf-400 mt-0.5">Let managers drop a rostered team and add an available one</p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-xs text-turf-400">{scoring.free_agency_enabled ? 'Enabled' : 'Disabled'}</span>
                <button
                  onClick={() => setScoring(prev => ({ ...prev, free_agency_enabled: !prev.free_agency_enabled }))}
                  className={`relative w-10 h-5 rounded-full transition-colors ${scoring.free_agency_enabled ? 'bg-field-500' : 'bg-turf-700'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${scoring.free_agency_enabled ? 'left-5' : 'left-0.5'}`} />
                </button>
              </label>
            </div>

            {scoring.free_agency_enabled && (
              <div className="space-y-4 pt-2 border-t border-turf-800">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Max Adds/Drops / Season</label>
                    <input
                      className="input font-mono"
                      type="number"
                      min="0"
                      value={scoring.fa_max_moves_per_season}
                      onChange={e => setScoring(prev => ({ ...prev, fa_max_moves_per_season: parseInt(e.target.value) || 0 }))}
                    />
                  </div>
                  <div>
                    <label className="label">Max Adds/Drops / Week</label>
                    <input
                      className="input font-mono"
                      type="number"
                      min="0"
                      value={scoring.fa_max_moves_per_week}
                      onChange={e => setScoring(prev => ({ ...prev, fa_max_moves_per_week: parseInt(e.target.value) || 0 }))}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-white">Point Penalty</p>
                    <p className="text-xs text-turf-600 mt-0.5">Subtract points the week a swap is made</p>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <span className="text-xs text-turf-400">{scoring.fa_penalty_enabled ? 'Enabled' : 'Disabled'}</span>
                    <button
                      onClick={() => setScoring(prev => ({ ...prev, fa_penalty_enabled: !prev.fa_penalty_enabled }))}
                      className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${scoring.fa_penalty_enabled ? 'bg-field-500' : 'bg-turf-700'}`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${scoring.fa_penalty_enabled ? 'left-5' : 'left-0.5'}`} />
                    </button>
                  </label>
                </div>

                {scoring.fa_penalty_enabled && (
                  <div>
                    <label className="label">Penalty Points</label>
                    <input
                      className="input font-mono"
                      type="number"
                      min="0"
                      step="0.5"
                      value={scoring.fa_penalty_points}
                      onChange={e => setScoring(prev => ({ ...prev, fa_penalty_points: parseFloat(e.target.value) || 0 }))}
                    />
                    <p className="text-xs text-turf-600 mt-0.5">
                      −{scoring.fa_penalty_points} pts applied the week of each add/drop
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <button onClick={handleSaveScoring} className="btn-primary">
            Save Scoring Settings
          </button>
        </div>
      )}

      {/* ── BONUSES TAB ──────────────────────────────────── */}
      {tab === 'bonuses' && (
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
                    setBonusPoints(BONUS_DEFAULT_POINTS[t]);
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
                    <div className="input text-turf-600 cursor-default">No teams drafted yet</div>
                  )
                ) : (
                  <div className="input text-turf-600 cursor-default">Select a player first</div>
                )}
              </div>

              {/* Points */}
              <div>
                <label className="label">Points</label>
                <input className="input font-mono" type="number" value={bonusPoints}
                  onChange={e => setBonusPoints(parseInt(e.target.value) || 0)} />
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
                    <span className="font-mono font-bold text-gold-400">+{b.points}</span>
                    <button onClick={() => onRemoveBonus(b.id)} className="btn-ghost btn-sm text-red-400 hover:text-red-300">
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
                              ? <span className={pick.result === 'covered' ? 'text-field-400' : 'text-red-400'}>
                                  {pick.result === 'covered' ? '✓ Covered' : '✗ Missed'}
                                  {pick.points !== null ? ` · ${pick.points > 0 ? '+' : ''}${pick.points} pts` : ''}
                                </span>
                              : <span className="text-turf-600">Pending</span>
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
                            className="text-xs border border-red-800 text-red-400 hover:bg-red-900/20 rounded px-2 py-1 transition-colors"
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
      )}
    </div>
  );
}
