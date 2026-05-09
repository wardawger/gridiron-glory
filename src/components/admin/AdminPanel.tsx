import { useState } from 'react';
import { Shield, UserPlus, Copy, Check, Trash2, Plus, Mail, Settings, Gift } from 'lucide-react';
import type {
  League, LeagueMember, ManualBonus,
  BonusType, ScoringSettings,
} from '../../types';
import { BONUS_LABELS, BONUS_DEFAULT_POINTS } from '../../types';

interface Props {
  league: League;
  members: LeagueMember[];
  manualBonuses: ManualBonus[];
  isCommissioner: boolean;
  onSendInvite: (email: string) => Promise<{ token?: string; error?: string }>;
  onUpdateWeek: (week: number) => void;
  onUpdateScoring: (s: ScoringSettings) => void;
  onAddBonus: (bonus: Omit<ManualBonus, 'id' | 'awarded_at' | 'awarded_by' | 'league_id'>) => void;
  onRemoveBonus: (id: string) => void;
  onRemoveFromRoster: (userId: string, teamId: string) => void;
}

type Tab = 'members' | 'scoring' | 'bonuses';

export function AdminPanel({
  league, members, manualBonuses, isCommissioner,
  onSendInvite, onUpdateWeek, onUpdateScoring, onAddBonus, onRemoveBonus,
}: Props) {
  const [tab, setTab]           = useState<Tab>('members');
  const [inviteEmail, setEmail] = useState('');
  const [inviteLink, setLink]   = useState('');
  const [copied, setCopied]     = useState(false);
  const [inviting, setInviting] = useState(false);
  const [scoring, setScoring]   = useState<ScoringSettings>(league.scoring);
  const [bonusUserId, setBonusUser]  = useState('');
  const [bonusType, setBonusType]    = useState<BonusType>('win_bowl');
  const [bonusTeamId, setBonusTeamId]   = useState('');
  const [bonusTeamName, setBonusTeamName] = useState('');
  const [bonusPoints, setBonusPoints] = useState<number>(5);
  const [bonusNote, setBonusNote]     = useState('');

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
      user_id: bonusUserId,
      type: bonusType,
      team_id: bonusTeamId,
      team_name: bonusTeamName,
      points: bonusPoints,
      note: bonusNote,
    });
    setBonusTeamId('');
    setBonusTeamName('');
    setBonusNote('');
  };

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'members',  label: 'Members & Invites', icon: UserPlus },
    { id: 'scoring',  label: 'Scoring',           icon: Settings },
    { id: 'bonuses',  label: 'Postseason Bonuses',icon: Gift },
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
        </div>
      )}

      {/* ── SCORING TAB ──────────────────────────────────── */}
      {tab === 'scoring' && (
        <div className="card p-5 space-y-4">
          <p className="text-sm text-turf-400">Adjust scoring settings for this league. Changes apply to all weeks.</p>
          <div className="grid grid-cols-2 gap-4">
            {(Object.entries(scoring) as [keyof ScoringSettings, number][]).map(([key, val]) => {
              const labels: Record<keyof ScoringSettings, string> = {
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
                    value={val}
                    onChange={e => setScoring(prev => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
              );
            })}
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
              <div>
                <label className="label">Player</label>
                <select className="input" value={bonusUserId} onChange={e => setBonusUser(e.target.value)}>
                  <option value="">Select player…</option>
                  {members.map(m => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}
                </select>
              </div>
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
              <div>
                <label className="label">Team Name</label>
                <input className="input" placeholder="e.g. Georgia" value={bonusTeamName}
                  onChange={e => setBonusTeamName(e.target.value)} />
              </div>
              <div>
                <label className="label">Points</label>
                <input className="input font-mono" type="number" value={bonusPoints}
                  onChange={e => setBonusPoints(parseInt(e.target.value) || 0)} />
              </div>
              <div className="col-span-2">
                <label className="label">Note (optional)</label>
                <input className="input" placeholder="e.g. SEC Championship win" value={bonusNote}
                  onChange={e => setBonusNote(e.target.value)} />
              </div>
            </div>
            <button
              onClick={handleAddBonus}
              disabled={!bonusUserId || !bonusTeamName}
              className="btn-gold"
            >
              <Plus className="w-4 h-4" /> Award Bonus
            </button>
          </div>

          {/* Existing bonuses */}
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
        </div>
      )}
    </div>
  );
}
