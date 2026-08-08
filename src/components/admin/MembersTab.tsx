import { useState, useMemo } from 'react';
import { Shield, UserPlus, Copy, Check, Trash2, Mail, RotateCcw, AlertTriangle, Loader2, Archive } from 'lucide-react';
import type { League, LeagueMember, LeagueRole, SeasonHistoryEntry, TrophySnapshot } from '../../types';
import { Avatar } from '../ui/Avatar';
import { Toggle } from '../ui/Toggle';

interface Props {
  league: League;
  members: LeagueMember[];
  finalStandings: SeasonHistoryEntry[];
  trophySnapshot: TrophySnapshot;
  onSendInvite: (email: string) => Promise<{ token?: string; error?: string }>;
  onUpdateWeek: (week: number) => void;
  onUpdateMemberRole: (userId: string, role: LeagueRole) => Promise<{ error?: string }>;
  onResetDraft: () => Promise<{ error?: string }>;
  onDeleteLeague: () => Promise<{ error?: string }>;
  onEndSeason: (seasonLabel: string, standings: SeasonHistoryEntry[], trophies: TrophySnapshot) => Promise<{ error?: string }>;
}

export function MembersTab({
  league, members, finalStandings, trophySnapshot,
  onSendInvite, onUpdateWeek, onUpdateMemberRole, onResetDraft, onDeleteLeague, onEndSeason,
}: Props) {
  const [inviteEmail, setEmail] = useState('');
  const [inviteLink, setLink]   = useState('');
  const [copied, setCopied]     = useState(false);
  const [inviting, setInviting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState('');
  const [showResetModal, setShowResetModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [roleUpdatingId, setRoleUpdatingId] = useState<string | null>(null);
  const [roleError, setRoleError] = useState('');
  const commissionerCount = members.filter(m => m.role === 'commissioner').length;

  // Default season label: the year the season started (games run Aug of one
  // calendar year through the natty in January of the next).
  const defaultSeasonLabel = useMemo(() => {
    const now = new Date();
    return String(now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear());
  }, []);
  const [showEndSeasonModal, setShowEndSeasonModal] = useState(false);
  const [seasonLabel, setSeasonLabel] = useState(defaultSeasonLabel);
  const [endingSeason, setEndingSeason] = useState(false);
  const [endSeasonError, setEndSeasonError] = useState('');

  const handleEndSeason = async () => {
    setEndingSeason(true);
    setEndSeasonError('');
    const result = await onEndSeason(seasonLabel, finalStandings, trophySnapshot);
    setEndingSeason(false);
    if (result.error) { setEndSeasonError(result.error); return; }
    setShowEndSeasonModal(false);
  };

  const handleToggleRole = async (member: LeagueMember) => {
    const nextRole: LeagueRole = member.role === 'commissioner' ? 'member' : 'commissioner';
    setRoleUpdatingId(member.user_id);
    setRoleError('');
    const result = await onUpdateMemberRole(member.user_id, nextRole);
    if (result.error) setRoleError(result.error);
    setRoleUpdatingId(null);
  };

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

  const handleConfirmReset = async () => {
    setResetting(true);
    setResetError('');
    const result = await onResetDraft();
    if (result?.error) {
      setResetError(result.error);
      setResetting(false);
      return;
    }
    setShowResetModal(false);
    setResetting(false);
  };

  const handleConfirmDelete = async () => {
    setDeleting(true);
    setDeleteError('');
    const result = await onDeleteLeague();
    if (result?.error) {
      setDeleteError(result.error);
      setDeleting(false);
      return;
    }
    setShowDeleteModal(false);
    setDeleting(false);
  };

  return (
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
        {members.map(m => {
          const isLastCommissioner = m.role === 'commissioner' && commissionerCount <= 1;
          const updating = roleUpdatingId === m.user_id;
          return (
            <div key={m.user_id} className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-5 py-3">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <Avatar displayName={m.display_name} avatarType={m.avatar_type} avatarValue={m.avatar_value} size={32} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white truncate">{m.display_name}</p>
                  <p className="text-xs text-turf-500">{new Date(m.joined_at).toLocaleDateString()}</p>
                </div>
              </div>
              <div
                className="flex items-center gap-2 pl-12 sm:pl-0 flex-shrink-0"
                title={isLastCommissioner ? 'A league needs at least one commissioner' : undefined}
              >
                {m.role === 'commissioner' && (
                  <Shield
                    className="w-4 h-4 text-field-400 flex-shrink-0"
                    role="img"
                    aria-label="Commissioner"
                  >
                    <title>Commissioner</title>
                  </Shield>
                )}
                <span className="text-xs text-turf-500">Co-Commissioner</span>
                {updating ? (
                  <Loader2 className="w-4 h-4 animate-spin text-turf-500" />
                ) : (
                  <Toggle
                    checked={m.role === 'commissioner'}
                    onChange={() => handleToggleRole(m)}
                    disabled={isLastCommissioner}
                    label={`${m.role === 'commissioner' ? 'Remove' : 'Make'} ${m.display_name} co-commissioner`}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
      {roleError && (
        <p className="text-xs text-red-300 px-1">{roleError}</p>
      )}

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

      {/* End Season */}
      <div className="card p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
          <div className="flex items-start gap-3">
            <Archive className="w-5 h-5 text-gold-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-white">End Season</p>
              <p className="text-xs text-turf-500 mt-0.5">
                Once the national championship game is final, archive this season's standings
                to Trophy Case and reset the league — draft, free agency, captain picks,
                bonuses, and spread picks — so it's ready for a new draft. This cannot be undone.
              </p>
            </div>
          </div>
          <button
            onClick={() => { setEndSeasonError(''); setSeasonLabel(defaultSeasonLabel); setShowEndSeasonModal(true); }}
            disabled={finalStandings.length === 0}
            className="btn-gold w-full sm:w-auto flex-shrink-0"
          >
            <Archive className="w-4 h-4" /> End Season
          </button>
        </div>
      </div>

      {/* Reset Draft */}
      <div className="card p-5 border-red-900/40">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-300 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-white">Reset Draft</p>
              <p className="text-xs text-turf-500 mt-0.5">
                Deletes all draft picks and free agency swaps, and returns the league to
                pre-draft status. Captain picks and bonuses are not affected.
                This cannot be undone.
              </p>
            </div>
          </div>
          <button
            onClick={() => { setResetError(''); setShowResetModal(true); }}
            className="btn-danger w-full sm:w-auto flex-shrink-0"
          >
            <RotateCcw className="w-4 h-4" /> Reset Draft
          </button>
        </div>
      </div>

      {/* Delete League */}
      <div className="card p-5 border-red-900/40">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-300 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-white">Delete League</p>
              <p className="text-xs text-turf-500 mt-0.5">
                Permanently deletes this league and everything in it — members, draft picks,
                scores, and settings. This cannot be undone.
              </p>
            </div>
          </div>
          <button
            onClick={() => { setDeleteError(''); setShowDeleteModal(true); }}
            className="btn-danger w-full sm:w-auto flex-shrink-0"
          >
            <Trash2 className="w-4 h-4" /> Delete League
          </button>
        </div>
      </div>

      {/* End Season confirmation modal */}
      {showEndSeasonModal && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
          onClick={() => !endingSeason && setShowEndSeasonModal(false)}
        >
          <div
            className="relative w-full max-w-sm rounded-2xl border border-gold-600/40 bg-turf-950 shadow-2xl p-6 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gold-600/20 flex items-center justify-center flex-shrink-0">
                <Archive className="w-5 h-5 text-gold-400" />
              </div>
              <h3 className="font-display text-xl text-white tracking-wide">End Season?</h3>
            </div>

            <div>
              <label className="label">Season Label</label>
              <input
                className="input"
                value={seasonLabel}
                onChange={e => setSeasonLabel(e.target.value)}
                placeholder="e.g. 2026"
              />
            </div>

            {finalStandings.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-turf-500 uppercase tracking-wide font-medium">Final Standings Preview</p>
                {finalStandings.slice(0, 3).map(e => (
                  <div key={e.user_id} className="flex items-center justify-between text-sm">
                    <span className="text-turf-300">{e.rank}. {e.display_name}</span>
                    <span className="font-mono text-white">{e.total_points}</span>
                  </div>
                ))}
              </div>
            )}

            <p className="text-sm text-turf-300">
              This archives the standings above to <span className="text-white font-medium">Trophy Case</span> and
              resets <span className="text-white font-medium">{league.name}</span> — draft picks, free agency, captain
              picks, bonuses, and spread picks — for a new season.{' '}
              <span className="text-red-300 font-medium">There is no way to recover the current data afterward.</span>
            </p>
            {endSeasonError && (
              <p className="text-xs text-red-300">{endSeasonError}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setShowEndSeasonModal(false)}
                disabled={endingSeason}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={handleEndSeason}
                disabled={endingSeason || !seasonLabel.trim()}
                className="btn-gold flex-1"
              >
                {endingSeason && <Loader2 className="w-4 h-4 animate-spin" />}
                {endingSeason ? 'Archiving…' : 'Yes, End Season'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Draft confirmation modal */}
      {showResetModal && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
          onClick={() => !resetting && setShowResetModal(false)}
        >
          <div
            className="relative w-full max-w-sm rounded-2xl border border-red-900/50 bg-turf-950 shadow-2xl p-6 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-900/40 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-300" />
              </div>
              <h3 className="font-display text-xl text-white tracking-wide">Reset Draft?</h3>
            </div>
            <p className="text-sm text-turf-300">
              This permanently deletes every draft pick and free agency swap in <span className="text-white font-medium">{league.name}</span> and
              returns the league to pre-draft status. Captain picks and bonuses are not affected.{' '}
              <span className="text-red-300 font-medium">There is no way to recover them.</span>
            </p>
            {resetError && (
              <p className="text-xs text-red-300">{resetError}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setShowResetModal(false)}
                disabled={resetting}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReset}
                disabled={resetting}
                className="btn-danger flex-1"
              >
                {resetting && <Loader2 className="w-4 h-4 animate-spin" />}
                {resetting ? 'Resetting…' : 'Yes, Reset Draft'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete League confirmation modal */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
          onClick={() => !deleting && setShowDeleteModal(false)}
        >
          <div
            className="relative w-full max-w-sm rounded-2xl border border-red-900/50 bg-turf-950 shadow-2xl p-6 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-900/40 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-300" />
              </div>
              <h3 className="font-display text-xl text-white tracking-wide">Delete League?</h3>
            </div>
            <p className="text-sm text-turf-300">
              This permanently deletes <span className="text-white font-medium">{league.name}</span> —
              every member, draft pick, score, and setting.{' '}
              <span className="text-red-300 font-medium">There is no way to recover it.</span>
            </p>
            {deleteError && (
              <p className="text-xs text-red-300">{deleteError}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="btn-danger flex-1"
              >
                {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
                {deleting ? 'Deleting…' : 'Yes, Delete League'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
