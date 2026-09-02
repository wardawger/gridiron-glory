import { useState, useMemo, useId } from 'react';
import { Shield, UserPlus, Copy, Check, Trash2, Mail, RotateCcw, AlertTriangle, Loader2, Archive, CalendarClock, Clock, Users, ChevronDown, Minus, Plus } from 'lucide-react';
import type { League, LeagueMember, LeagueRole, SeasonHistoryEntry, TrophySnapshot, Invite } from '../../types';
import { Avatar } from '../ui/Avatar';
import { Toggle } from '../ui/Toggle';
import { DialogShell } from '../ui/DialogShell';

interface Props {
  league: League;
  currentUserId: string;
  members: LeagueMember[];
  invites: Invite[];
  finalStandings: SeasonHistoryEntry[];
  trophySnapshot: TrophySnapshot;
  onSendInvite: (email: string) => Promise<{ token?: string; emailSent?: boolean; error?: string }>;
  onUpdateWeek: (week: number) => void | Promise<void>;
  onUpdateDraftSchedule: (scheduledAt: string | null) => Promise<{ error?: string }>;
  onUpdateMaxTeams: (maxTeams: number) => Promise<{ error?: string }>;
  onUpdateMemberRole: (userId: string, role: LeagueRole) => Promise<{ error?: string }>;
  onRemoveMember: (userId: string) => Promise<{ error?: string }>;
  onResetDraft: () => Promise<{ error?: string }>;
  onDeleteLeague: () => Promise<{ error?: string }>;
  onEndSeason: (seasonLabel: string, standings: SeasonHistoryEntry[], trophies: TrophySnapshot) => Promise<{ error?: string }>;
}

const MIN_WEEK = 0;
const MAX_WEEK = 18;
const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

// Converts a stored ISO timestamp to the local-time string a
// <input type="datetime-local"> expects (YYYY-MM-DDTHH:mm), and back —
// the input has no timezone concept of its own, so this treats whatever
// the browser shows as the commissioner's own local time.
function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export function MembersTab({
  league, currentUserId, members, invites, finalStandings, trophySnapshot,
  onSendInvite, onUpdateWeek, onUpdateDraftSchedule, onUpdateMaxTeams, onUpdateMemberRole, onRemoveMember, onResetDraft, onDeleteLeague, onEndSeason,
}: Props) {
  const uid = useId();
  const [inviteEmail, setEmail] = useState('');
  const [inviteLink, setLink]   = useState('');
  const [invitedTo, setInvitedTo] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [copied, setCopied]     = useState(false);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState('');
  const [showResetModal, setShowResetModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [roleUpdatingId, setRoleUpdatingId] = useState<string | null>(null);
  const [roleError, setRoleError] = useState('');
  const [memberToRemove, setMemberToRemove] = useState<LeagueMember | null>(null);
  const [removingMember, setRemovingMember] = useState(false);
  const [removeMemberError, setRemoveMemberError] = useState('');
  const [weekUpdating, setWeekUpdating] = useState(false);
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

  const [draftSchedule, setDraftSchedule] = useState(() => isoToLocalInput(league.draft_scheduled_at));
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleError, setScheduleError] = useState('');
  const [scheduleSaved, setScheduleSaved] = useState(false);

  const handleSaveSchedule = async () => {
    setSavingSchedule(true);
    setScheduleError('');
    setScheduleSaved(false);
    const iso = draftSchedule ? new Date(draftSchedule).toISOString() : null;
    const result = await onUpdateDraftSchedule(iso);
    if (result.error) setScheduleError(result.error);
    else setScheduleSaved(true);
    setSavingSchedule(false);
  };

  const handleClearSchedule = async () => {
    setSavingSchedule(true);
    setScheduleError('');
    setScheduleSaved(false);
    const result = await onUpdateDraftSchedule(null);
    if (result.error) setScheduleError(result.error);
    else setDraftSchedule('');
    setSavingSchedule(false);
  };

  const [maxTeams, setMaxTeams] = useState(league.max_teams_per_user);
  const [savingMaxTeams, setSavingMaxTeams] = useState(false);
  const [maxTeamsError, setMaxTeamsError] = useState('');
  const [maxTeamsSaved, setMaxTeamsSaved] = useState(false);

  const handleSaveMaxTeams = async () => {
    setSavingMaxTeams(true);
    setMaxTeamsError('');
    setMaxTeamsSaved(false);
    const result = await onUpdateMaxTeams(maxTeams);
    if (result.error) setMaxTeamsError(result.error);
    else setMaxTeamsSaved(true);
    setSavingMaxTeams(false);
  };

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

  const handleConfirmRemoveMember = async () => {
    if (!memberToRemove) return;
    setRemovingMember(true);
    setRemoveMemberError('');
    const result = await onRemoveMember(memberToRemove.user_id);
    if (result?.error) {
      setRemoveMemberError(result.error);
      setRemovingMember(false);
      return;
    }
    setMemberToRemove(null);
    setRemovingMember(false);
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    const sentTo = inviteEmail.trim();
    setInviting(true);
    setInviteError('');
    const result = await onSendInvite(sentTo);
    if (result.token) {
      // Hardcoded rather than window.location.origin — the app answers on
      // more than one domain, but Google-SSO sign-in only ever lands back
      // on the domain allowlisted in Supabase's Auth settings, so a link
      // built from a different domain loses the invite's pending state
      // (localStorage is per-origin) the moment SSO redirects away and back.
      const link = `https://gridironglory.app/join/${result.token}`;
      setLink(link);
      setInvitedTo(sentTo);
      setEmailSent(!!result.emailSent);
      setEmail('');
    } else if (result.error) {
      setInviteError(result.error);
    }
    setInviting(false);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyInviteLink = (invite: Invite) => {
    // Matches the canonical domain invite links are always generated on now
    // (see handleInvite above) — the app is reachable at more than one
    // domain, but only this one is allowlisted for auth redirects.
    navigator.clipboard.writeText(`https://gridironglory.app/join/${invite.token}`);
    setCopiedInviteId(invite.id);
    setTimeout(() => setCopiedInviteId(null), 2000);
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

  const changeWeek = async (next: number) => {
    if (weekUpdating || next < MIN_WEEK || next > MAX_WEEK) return;
    setWeekUpdating(true);
    try { await onUpdateWeek(next); } finally { setWeekUpdating(false); }
  };

  return (
    <div className="space-y-4">
      {/* Invite form — only while the league hasn't started drafting yet;
          once drafting begins there's nothing left for a new player to draft,
          and draft_status only returns to 'pending' via a deliberate reset
          or new season, so this naturally stays hidden all season. */}
      {league.draft_status === 'pending' && (
        <div className="card p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Mail className="w-4 h-4 text-field-400" aria-hidden="true" />
            <h3 className="font-medium text-white">Invite Player</h3>
          </div>
          <form onSubmit={handleInvite} className="flex gap-2">
            <input
              id={`${uid}-invite-email`}
              name="email"
              className="input flex-1"
              type="email"
              inputMode="email"
              autoComplete="off"
              spellCheck={false}
              aria-label="Player email address"
              placeholder="name@example.com…"
              value={inviteEmail}
              onChange={e => setEmail(e.target.value)}
              required
            />
            <button type="submit" disabled={inviting} className="btn-primary">
              {inviting ? <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <UserPlus className="w-4 h-4" aria-hidden="true" />}
              {inviting ? 'Sending…' : 'Invite'}
            </button>
          </form>

          <div aria-live="polite" className="space-y-2">
            {inviteError && <p role="alert" className="text-xs text-red-300">{inviteError}</p>}
            {inviteLink && (
              <>
                <p className="text-xs text-turf-400">
                  {emailSent
                    ? `Invite email sent to ${invitedTo}. You can also share this link directly:`
                    : 'Couldn’t send the email automatically — share this link with the player:'}
                </p>
                <div className="flex gap-2 items-center">
                  <code className="flex-1 text-xs bg-turf-800 border border-turf-600 rounded-lg px-3 py-2 text-field-300 break-all" translate="no">
                    {inviteLink}
                  </code>
                  <button type="button" onClick={copyLink} className="btn-secondary btn-sm flex-shrink-0">
                    {copied ? <Check className="w-4 h-4 text-field-400" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
                    {copied ? 'Copied' : 'Copy Link'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Sent Invites */}
      {invites.length > 0 && (
        <div className="card divide-y divide-turf-800">
          <div className="flex items-center gap-2 px-5 py-3">
            <Clock className="w-4 h-4 text-turf-400" aria-hidden="true" />
            <h3 className="font-medium text-white text-sm">Sent Invites</h3>
          </div>
          {invites.map(invite => (
            <div key={invite.id} className="flex items-center gap-3 px-5 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{invite.invited_email}</p>
                <p className="text-xs text-turf-500">
                  Sent {dateFmt.format(new Date(invite.created_at))}
                </p>
              </div>
              {invite.accepted ? (
                <span className="badge-green text-xs flex-shrink-0">Accepted</span>
              ) : (
                <>
                  <span className="badge-gray text-xs flex-shrink-0">Pending</span>
                  <button
                    type="button"
                    onClick={() => copyInviteLink(invite)}
                    className="btn-secondary btn-sm flex-shrink-0"
                    aria-label={copiedInviteId === invite.id ? `Invite link for ${invite.invited_email} copied` : `Copy invite link for ${invite.invited_email}`}
                    title="Copy invite link"
                  >
                    {copiedInviteId === invite.id ? (
                      <Check className="w-3.5 h-3.5 text-field-400" aria-hidden="true" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Member list */}
      <div className="card divide-y divide-turf-800">
        {members.map(m => {
          const isLastCommissioner = m.role === 'commissioner' && commissionerCount <= 1;
          const updating = roleUpdatingId === m.user_id;
          const toggleId = `${uid}-role-${m.user_id}`;
          return (
            <div key={m.user_id} className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-5 py-3">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <Avatar displayName={m.display_name} avatarType={m.avatar_type} avatarValue={m.avatar_value} size={32} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white truncate">{m.display_name}</p>
                  <p className="text-xs text-turf-500">Joined {dateFmt.format(new Date(m.joined_at))}</p>
                </div>
              </div>
              <div className="flex flex-col items-start sm:items-end gap-1 pl-12 sm:pl-0 flex-shrink-0">
                <div className="flex items-center gap-2">
                  {m.role === 'commissioner' && (
                    <Shield className="w-4 h-4 text-field-400 flex-shrink-0" role="img" aria-label="Commissioner" />
                  )}
                  <label htmlFor={toggleId} className="text-xs text-turf-500 cursor-pointer">Co-Commissioner</label>
                  {updating ? (
                    <span role="status" className="inline-flex">
                      <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none text-turf-500" aria-hidden="true" />
                      <span className="sr-only">Updating role…</span>
                    </span>
                  ) : (
                    <Toggle
                      id={toggleId}
                      checked={m.role === 'commissioner'}
                      onChange={() => handleToggleRole(m)}
                      disabled={isLastCommissioner}
                      label={`${m.display_name} is co-commissioner`}
                    />
                  )}
                  {league.draft_status !== 'active' && m.role !== 'commissioner' && m.user_id !== currentUserId && (
                    <button
                      type="button"
                      onClick={() => { setRemoveMemberError(''); setMemberToRemove(m); }}
                      className="btn-secondary btn-sm text-red-300 hover:text-red-200 hover:border-red-800"
                      aria-label={`Remove ${m.display_name} from the league`}
                      title={`Remove ${m.display_name} from the league`}
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
                {isLastCommissioner && (
                  <p className="text-xs text-turf-600">A league needs at least one commissioner</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {roleError && (
        <p role="alert" className="text-xs text-red-300 px-1">{roleError}</p>
      )}

      {/* Draft schedule — only meaningful before the draft actually starts;
          draft_status only returns to 'pending' via a deliberate reset or
          new season, matching the Invite Player card's visibility above. */}
      {league.draft_status === 'pending' && (
        <div className="card p-5 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <CalendarClock className="w-4 h-4 text-field-400" aria-hidden="true" />
            <h3 className="font-medium text-white">Draft Schedule</h3>
          </div>
          <p className="text-xs text-turf-400">
            Set a planned date and time for the draft — everyone sees a countdown in the Draft Room.
            This doesn’t start the draft automatically; you still start it yourself when ready.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              id={`${uid}-draft-at`}
              name="draft_scheduled_at"
              className="input flex-1"
              type="datetime-local"
              aria-label="Draft date and time"
              value={draftSchedule}
              onChange={e => { setDraftSchedule(e.target.value); setScheduleSaved(false); }}
            />
            <div className="flex gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={handleSaveSchedule}
                disabled={savingSchedule || !draftSchedule}
                className="btn-primary btn-sm flex-1 sm:flex-none"
              >
                {savingSchedule && <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                {savingSchedule ? 'Saving…' : 'Save Schedule'}
              </button>
              {league.draft_scheduled_at && (
                <button
                  type="button"
                  onClick={handleClearSchedule}
                  disabled={savingSchedule}
                  className="btn-secondary btn-sm flex-1 sm:flex-none"
                >
                  Clear Schedule
                </button>
              )}
            </div>
          </div>
          <div aria-live="polite">
            {scheduleError && <p role="alert" className="text-xs text-red-300">{scheduleError}</p>}
            {scheduleSaved && !scheduleError && <p className="text-xs text-field-400">Draft schedule saved.</p>}
          </div>
        </div>
      )}

      {/* Roster size — only changeable before the draft starts, same
          visibility rule as Draft Schedule above: pick numbers, round math,
          and existing rosters all assume a fixed size once picks exist. */}
      {league.draft_status === 'pending' && (
        <div className="card p-5 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-field-400" aria-hidden="true" />
            <h3 className="font-medium text-white">Roster Size</h3>
          </div>
          <p className="text-xs text-turf-400">
            Teams each player drafts. If Bench is enabled in Scoring, its Starters + Bench counts must be
            updated to match whatever you set here before saving.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <select
                id={`${uid}-max-teams`}
                name="max_teams_per_user"
                className="input appearance-none pr-9 [&>option]:bg-turf-800 [&>option]:text-white"
                aria-label="Teams per player"
                value={maxTeams}
                onChange={e => { setMaxTeams(Number(e.target.value)); setMaxTeamsSaved(false); }}
              >
                {[5,6,7,8,9,10,12,15].map(n => (
                  <option key={n} value={n}>{n} teams</option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-turf-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
            </div>
            <button
              type="button"
              onClick={handleSaveMaxTeams}
              disabled={savingMaxTeams || maxTeams === league.max_teams_per_user}
              className="btn-primary btn-sm flex-shrink-0"
            >
              {savingMaxTeams && <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              {savingMaxTeams ? 'Saving…' : 'Save Roster Size'}
            </button>
          </div>
          <div aria-live="polite">
            {maxTeamsError && <p role="alert" className="text-xs text-red-300">{maxTeamsError}</p>}
            {maxTeamsSaved && !maxTeamsError && <p className="text-xs text-field-400">Roster size updated.</p>}
          </div>
        </div>
      )}

      {/* Current week */}
      <div className="card p-5 flex items-center justify-between">
        <div>
          <p className="font-medium text-white" id={`${uid}-week-label`}>Current Week</p>
          <p className="text-xs text-turf-500">Drives scoring display and lock-ins league-wide</p>
        </div>
        <div className="flex items-center gap-2" role="group" aria-labelledby={`${uid}-week-label`}>
          <button
            type="button"
            onClick={() => changeWeek(league.current_week - 1)}
            disabled={weekUpdating || league.current_week <= MIN_WEEK}
            aria-label="Previous week"
            className="btn-secondary btn-sm px-3 min-h-8"
          >
            <Minus className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <span className="font-mono text-xl text-white w-8 text-center tabular-nums" aria-live="polite">
            {league.current_week}
          </span>
          <button
            type="button"
            onClick={() => changeWeek(league.current_week + 1)}
            disabled={weekUpdating || league.current_week >= MAX_WEEK}
            aria-label="Next week"
            className="btn-secondary btn-sm px-3 min-h-8"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* End Season */}
      <div className="card p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
          <div className="flex items-start gap-3">
            <Archive className="w-5 h-5 text-gold-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-medium text-white">End Season</p>
              <p className="text-xs text-turf-500 mt-0.5">
                Once the national championship game is final, archive this season’s standings
                to Trophy Case and reset the league — draft, portal, captain picks,
                bonuses, and spread picks — so it’s ready for a new draft. This cannot be undone.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { setEndSeasonError(''); setSeasonLabel(defaultSeasonLabel); setShowEndSeasonModal(true); }}
            disabled={finalStandings.length === 0}
            className="btn-gold w-full sm:w-auto flex-shrink-0"
          >
            <Archive className="w-4 h-4" aria-hidden="true" /> End Season
          </button>
        </div>
      </div>

      {/* Reset Draft */}
      <div className="card p-5 border-red-900/40">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-300 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-medium text-white">Reset Draft</p>
              <p className="text-xs text-turf-500 mt-0.5">
                Deletes all draft picks and portal swaps, and returns the league to
                pre-draft status. Captain picks and bonuses are not affected.
                This cannot be undone.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { setResetError(''); setShowResetModal(true); }}
            className="btn-danger w-full sm:w-auto flex-shrink-0"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" /> Reset Draft
          </button>
        </div>
      </div>

      {/* Delete League */}
      <div className="card p-5 border-red-900/40">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-300 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-medium text-white">Delete League</p>
              <p className="text-xs text-turf-500 mt-0.5">
                Permanently deletes this league and everything in it — members, draft picks,
                scores, and settings. This cannot be undone.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { setDeleteError(''); setShowDeleteModal(true); }}
            className="btn-danger w-full sm:w-auto flex-shrink-0"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" /> Delete League
          </button>
        </div>
      </div>

      {/* End Season confirmation modal */}
      {showEndSeasonModal && (
        <DialogShell onClose={() => setShowEndSeasonModal(false)} locked={endingSeason} labelledBy={`${uid}-end-title`} panelClassName="border-gold-600/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gold-600/20 flex items-center justify-center flex-shrink-0">
              <Archive className="w-5 h-5 text-gold-400" aria-hidden="true" />
            </div>
            <h3 id={`${uid}-end-title`} className="font-display text-xl text-white tracking-wide">End Season?</h3>
          </div>

          <div>
            <label htmlFor={`${uid}-season-label`} className="label">Season Label</label>
            <input
              id={`${uid}-season-label`}
              name="season_label"
              className="input"
              autoComplete="off"
              value={seasonLabel}
              onChange={e => setSeasonLabel(e.target.value)}
              placeholder="2026…"
            />
          </div>

          {finalStandings.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-turf-500 uppercase tracking-wide font-medium">Final Standings Preview</p>
              {finalStandings.slice(0, 3).map(e => (
                <div key={e.user_id} className="flex items-center justify-between text-sm">
                  <span className="text-turf-300">{e.rank}. {e.display_name}</span>
                  <span className="font-mono text-white tabular-nums">{e.total_points}</span>
                </div>
              ))}
            </div>
          )}

          <p className="text-sm text-turf-300">
            This archives the standings above to <span className="text-white font-medium">Trophy Case</span> and
            resets <span className="text-white font-medium">{league.name}</span> — draft picks, portal, captain
            picks, bonuses, and spread picks — for a new season.{' '}
            <span className="text-red-300 font-medium">There is no way to recover the current data afterward.</span>
          </p>
          {endSeasonError && (
            <p role="alert" className="text-xs text-red-300">{endSeasonError}</p>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowEndSeasonModal(false)} disabled={endingSeason} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="button" onClick={handleEndSeason} disabled={endingSeason || !seasonLabel.trim()} className="btn-gold flex-1">
              {endingSeason && <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              {endingSeason ? 'Archiving…' : 'Yes, End Season'}
            </button>
          </div>
        </DialogShell>
      )}

      {/* Reset Draft confirmation modal */}
      {showResetModal && (
        <DialogShell onClose={() => setShowResetModal(false)} locked={resetting} labelledBy={`${uid}-reset-title`} panelClassName="border-red-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-900/40 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-300" aria-hidden="true" />
            </div>
            <h3 id={`${uid}-reset-title`} className="font-display text-xl text-white tracking-wide">Reset Draft?</h3>
          </div>
          <p className="text-sm text-turf-300">
            This permanently deletes every draft pick and portal swap in <span className="text-white font-medium">{league.name}</span> and
            returns the league to pre-draft status. Captain picks and bonuses are not affected.{' '}
            <span className="text-red-300 font-medium">There is no way to recover them.</span>
          </p>
          {resetError && (
            <p role="alert" className="text-xs text-red-300">{resetError}</p>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowResetModal(false)} disabled={resetting} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="button" onClick={handleConfirmReset} disabled={resetting} className="btn-danger flex-1">
              {resetting && <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              {resetting ? 'Resetting…' : 'Yes, Reset Draft'}
            </button>
          </div>
        </DialogShell>
      )}

      {/* Remove Member confirmation modal */}
      {memberToRemove && (
        <DialogShell onClose={() => setMemberToRemove(null)} locked={removingMember} labelledBy={`${uid}-remove-title`} panelClassName="border-red-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-900/40 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-300" aria-hidden="true" />
            </div>
            <h3 id={`${uid}-remove-title`} className="font-display text-xl text-white tracking-wide">Remove Member?</h3>
          </div>
          <p className="text-sm text-turf-300">
            This permanently removes <span className="text-white font-medium">{memberToRemove.display_name}</span> from{' '}
            <span className="text-white font-medium">{league.name}</span>.{' '}
            {league.draft_status === 'pending'
              ? 'They haven’t drafted yet, so this has no impact on the league.'
              : 'Their drafted teams return to the available pool and their results are excluded from standings and trophies.'}{' '}
            <span className="text-red-300 font-medium">There is no way to recover this.</span>
          </p>
          {removeMemberError && (
            <p role="alert" className="text-xs text-red-300">{removeMemberError}</p>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => setMemberToRemove(null)} disabled={removingMember} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="button" onClick={handleConfirmRemoveMember} disabled={removingMember} className="btn-danger flex-1">
              {removingMember && <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              {removingMember ? 'Removing…' : 'Yes, Remove Member'}
            </button>
          </div>
        </DialogShell>
      )}

      {/* Delete League confirmation modal */}
      {showDeleteModal && (
        <DialogShell onClose={() => setShowDeleteModal(false)} locked={deleting} labelledBy={`${uid}-delete-title`} panelClassName="border-red-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-900/40 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-300" aria-hidden="true" />
            </div>
            <h3 id={`${uid}-delete-title`} className="font-display text-xl text-white tracking-wide">Delete League?</h3>
          </div>
          <p className="text-sm text-turf-300">
            This permanently deletes <span className="text-white font-medium">{league.name}</span> —
            every member, draft pick, score, and setting.{' '}
            <span className="text-red-300 font-medium">There is no way to recover it.</span>
          </p>
          {deleteError && (
            <p role="alert" className="text-xs text-red-300">{deleteError}</p>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowDeleteModal(false)} disabled={deleting} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="button" onClick={handleConfirmDelete} disabled={deleting} className="btn-danger flex-1">
              {deleting && <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              {deleting ? 'Deleting…' : 'Yes, Delete League'}
            </button>
          </div>
        </DialogShell>
      )}
    </div>
  );
}
