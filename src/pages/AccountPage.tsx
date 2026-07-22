import { useMemo, useState } from 'react';
import { Loader2, User, Mail, Calendar, Shield, Trophy, Check, Search, ChevronDown, RotateCcw } from 'lucide-react';
import type { useAuth } from '../hooks/useAuth';
import type { League, LeagueMember, LeagueRole, CfbTeam, AvatarType } from '../types';
import { AVATAR_EMOJI_OPTIONS, AVATAR_MAX_FILE_BYTES, AVATAR_MIN_DIMENSION, AVATAR_MAX_DIMENSION, AVATAR_ALLOWED_MIME_TYPES, P4_CONFERENCES } from '../types';
import { validateAvatarFile, uploadAvatarImage } from '../services/avatarUpload';
import { Avatar } from '../components/ui/Avatar';
import { TeamLogo } from '../components/ui/TeamLogo';

interface Props {
  auth: ReturnType<typeof useAuth>;
  league: League;
  myMembership: LeagueMember | undefined;
  allLeagues: League[];
  allMemberships: Record<string, LeagueRole>;
  teams: CfbTeam[];
  onUpdateDisplayName: (name: string) => Promise<{ error?: string }>;
  onUpdateAvatar: (avatarType: AvatarType, avatarValue: string) => Promise<{ error?: string }>;
}

type AvatarTab = 'logo' | 'emoji' | 'upload';

function formatJoinDate(iso: string | undefined): string {
  if (!iso) return 'Unknown';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function AccountPage({
  auth, league, myMembership, allLeagues, allMemberships, teams,
  onUpdateDisplayName, onUpdateAvatar,
}: Props) {
  const [name, setName]           = useState(myMembership?.display_name ?? '');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameMsg, setNameMsg]     = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [pwSaving, setPwSaving]   = useState(false);
  const [pwMsg, setPwMsg]         = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const [avatarTab, setAvatarTab] = useState<AvatarTab>('logo');
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [logoSearch, setLogoSearch] = useState('');
  const [logoConf, setLogoConf]   = useState('ALL');
  const [uploadError, setUploadError] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const currentAvatarType  = myMembership?.avatar_type ?? 'initial';
  const currentAvatarValue = myMembership?.avatar_value ?? '';

  const filteredTeams = useMemo(() => {
    return teams.filter(t => {
      if (logoSearch && !t.name.toLowerCase().includes(logoSearch.toLowerCase())) return false;
      if (logoConf === 'P4' && !(P4_CONFERENCES as readonly string[]).includes(t.conference)) return false;
      if (logoConf === 'G5' && (P4_CONFERENCES as readonly string[]).includes(t.conference)) return false;
      if (logoConf !== 'ALL' && logoConf !== 'P4' && logoConf !== 'G5' && t.conference !== logoConf) return false;
      return true;
    });
  }, [teams, logoSearch, logoConf]);

  const conferences = useMemo(() => {
    const set = new Set(teams.map(t => t.conference));
    return ['ALL', 'P4', 'G5', ...Array.from(set).sort()];
  }, [teams]);

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    setNameSaving(true);
    setNameMsg(null);
    const result = await onUpdateDisplayName(name);
    if (result.error) setNameMsg({ type: 'error', text: result.error });
    else setNameMsg({ type: 'success', text: 'Display name updated.' });
    setNameSaving(false);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setPwMsg({ type: 'error', text: "Passwords don't match" });
      return;
    }
    setPwSaving(true);
    setPwMsg(null);
    const err = await auth.updatePassword(password);
    if (err) setPwMsg({ type: 'error', text: err.message });
    else {
      setPwMsg({ type: 'success', text: 'Password updated.' });
      setPassword('');
      setConfirm('');
    }
    setPwSaving(false);
  };

  const applyAvatar = async (type: AvatarType, value: string, successText: string) => {
    setAvatarSaving(true);
    setAvatarMsg(null);
    const result = await onUpdateAvatar(type, value);
    if (result.error) setAvatarMsg({ type: 'error', text: result.error });
    else setAvatarMsg({ type: 'success', text: successText });
    setAvatarSaving(false);
  };

  const handleSelectLogo = (team: CfbTeam) => applyAvatar('logo', team.logo, `Avatar set to ${team.name}.`);
  const handleSelectEmoji = (emoji: string) => applyAvatar('emoji', emoji, 'Avatar updated.');
  const handleReset = () => applyAvatar('initial', '', 'Avatar reset to initial.');

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadError('');
    setAvatarMsg(null);
    const err = await validateAvatarFile(file);
    if (err) {
      setUploadError(err);
      setSelectedFile(null);
      setPreviewUrl(null);
      return;
    }
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleConfirmUpload = async () => {
    if (!selectedFile || !auth.user) return;
    setUploading(true);
    setAvatarMsg(null);
    const uploadResult = await uploadAvatarImage(auth.user.id, league.id, selectedFile);
    if (uploadResult.error) {
      setAvatarMsg({ type: 'error', text: uploadResult.error });
      setUploading(false);
      return;
    }
    const result = await onUpdateAvatar('upload', uploadResult.url!);
    if (result.error) setAvatarMsg({ type: 'error', text: result.error });
    else setAvatarMsg({ type: 'success', text: 'Photo uploaded.' });
    setSelectedFile(null);
    setPreviewUrl(null);
    setUploading(false);
  };

  return (
    <div className="space-y-5 animate-fade-in max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-field-500 flex items-center justify-center flex-shrink-0">
          <User className="w-5 h-5 text-turf-950" />
        </div>
        <div>
          <h1 className="font-display text-2xl tracking-wide text-white">My Account</h1>
          <p className="text-turf-500 text-sm">Manage your profile and password</p>
        </div>
      </div>

      {/* Account info */}
      <div className="card p-5 space-y-3">
        <h3 className="font-medium text-white text-sm">Account Info</h3>
        <div className="flex items-center gap-3 text-sm">
          <Mail className="w-4 h-4 text-turf-500 flex-shrink-0" />
          <span className="text-turf-400">Email</span>
          <span className="text-white ml-auto">{auth.user?.email}</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Calendar className="w-4 h-4 text-turf-500 flex-shrink-0" />
          <span className="text-turf-400">Registered</span>
          <span className="text-white ml-auto">{formatJoinDate(auth.user?.created_at)}</span>
        </div>
      </div>

      {/* Display name for current league */}
      <div className="card p-5 space-y-4">
        <div>
          <h3 className="font-medium text-white text-sm">Display Name</h3>
          <p className="text-xs text-turf-400 mt-0.5">
            Shown to other members of <span className="text-turf-300">{league.name}</span>. Each league has its own name.
          </p>
        </div>
        <form onSubmit={handleSaveName} className="flex gap-2">
          <input
            className="input flex-1"
            value={name}
            onChange={e => setName(e.target.value)}
            required
          />
          <button type="submit" disabled={nameSaving} className="btn-primary flex-shrink-0">
            {nameSaving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save
          </button>
        </form>
        {nameMsg && (
          <div className={`text-sm rounded-lg px-3 py-2 ${
            nameMsg.type === 'error'
              ? 'bg-red-900/40 text-red-300 border border-red-800'
              : 'bg-field-900/40 text-field-300 border border-field-800'
          }`}>
            {nameMsg.text}
          </div>
        )}
      </div>

      {/* Roster avatar for current league */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-4">
          <Avatar displayName={name || '?'} avatarType={currentAvatarType} avatarValue={currentAvatarValue} size={56} />
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-white text-sm">Roster Avatar</h3>
            <p className="text-xs text-turf-400 mt-0.5">
              Shown next to your name in <span className="text-turf-300">{league.name}</span>.
            </p>
          </div>
          {currentAvatarType !== 'initial' && (
            <button
              onClick={handleReset}
              disabled={avatarSaving}
              className="btn-ghost btn-sm flex-shrink-0"
              title="Reset to initial"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </button>
          )}
        </div>

        {/* Tab selector */}
        <div className="flex gap-1 bg-turf-900 p-1 rounded-xl border border-turf-800">
          {(['logo', 'emoji', 'upload'] as const).map(t => (
            <button
              key={t}
              onClick={() => setAvatarTab(t)}
              className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-all ${
                avatarTab === t ? 'bg-field-500 text-turf-950' : 'text-turf-400 hover:text-white'
              }`}
            >
              {t === 'logo' ? 'Team Logo' : t === 'emoji' ? 'Emoji' : 'Upload Photo'}
            </button>
          ))}
        </div>

        {avatarTab === 'logo' && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-turf-500" />
                <input
                  className="input pl-9"
                  placeholder="Search teams…"
                  value={logoSearch}
                  onChange={e => setLogoSearch(e.target.value)}
                />
              </div>
              <div className="relative">
                <select
                  className="input appearance-none pr-8"
                  value={logoConf}
                  onChange={e => setLogoConf(e.target.value)}
                >
                  {conferences.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-turf-500 pointer-events-none" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
              {filteredTeams.length === 0 && (
                <div className="col-span-2 py-8 text-center text-turf-500 text-sm">No teams match your filter</div>
              )}
              {filteredTeams.map(team => (
                <button
                  key={team.id}
                  onClick={() => handleSelectLogo(team)}
                  disabled={avatarSaving}
                  className="card-inner flex items-center gap-2.5 px-3 py-2 text-left hover:border-field-500/50 transition-colors"
                >
                  <TeamLogo src={team.logo} alt={team.name} fallbackName={team.name} size={28} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{team.name}</p>
                    <p className="text-xs text-turf-500">{team.conference}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {avatarTab === 'emoji' && (
          <div className="grid grid-cols-6 sm:grid-cols-8 gap-2">
            {AVATAR_EMOJI_OPTIONS.map(emoji => (
              <button
                key={emoji}
                onClick={() => handleSelectEmoji(emoji)}
                disabled={avatarSaving}
                className={`card-inner text-2xl py-2.5 flex items-center justify-center transition-colors hover:border-field-500/50 ${
                  currentAvatarType === 'emoji' && currentAvatarValue === emoji ? 'border-field-500 bg-field-900/20' : ''
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {avatarTab === 'upload' && (
          <div className="space-y-3">
            <p className="text-xs text-turf-400">
              PNG, JPG, WEBP, or GIF. Max {AVATAR_MAX_FILE_BYTES / (1024 * 1024)}MB.
              Between {AVATAR_MIN_DIMENSION}×{AVATAR_MIN_DIMENSION} and {AVATAR_MAX_DIMENSION}×{AVATAR_MAX_DIMENSION} pixels —
              square images look best.
            </p>
            <input
              type="file"
              accept={AVATAR_ALLOWED_MIME_TYPES.join(',')}
              onChange={handleFileSelect}
              className="block w-full text-sm text-turf-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-turf-700 file:text-white file:text-sm hover:file:bg-turf-600 file:cursor-pointer cursor-pointer"
            />
            {uploadError && (
              <div className="text-sm rounded-lg px-3 py-2 bg-red-900/40 text-red-300 border border-red-800">
                {uploadError}
              </div>
            )}
            {previewUrl && (
              <div className="flex items-center gap-3">
                <img src={previewUrl} alt="Preview" className="w-16 h-16 rounded-full object-cover flex-shrink-0" />
                <button onClick={handleConfirmUpload} disabled={uploading} className="btn-primary btn-sm">
                  {uploading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {uploading ? 'Uploading…' : 'Use This Photo'}
                </button>
              </div>
            )}
          </div>
        )}

        {avatarMsg && (
          <div className={`text-sm rounded-lg px-3 py-2 ${
            avatarMsg.type === 'error'
              ? 'bg-red-900/40 text-red-300 border border-red-800'
              : 'bg-field-900/40 text-field-300 border border-field-800'
          }`}>
            {avatarMsg.text}
          </div>
        )}
      </div>

      {/* Change password */}
      <div className="card p-5 space-y-4">
        <h3 className="font-medium text-white text-sm">Change Password</h3>
        <form onSubmit={handleChangePassword} className="space-y-3">
          <div>
            <label className="label">New Password</label>
            <input
              className="input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          <div>
            <label className="label">Confirm Password</label>
            <input
              className="input"
              type="password"
              placeholder="••••••••"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              minLength={6}
            />
          </div>
          {pwMsg && (
            <div className={`text-sm rounded-lg px-3 py-2 ${
              pwMsg.type === 'error'
                ? 'bg-red-900/40 text-red-300 border border-red-800'
                : 'bg-field-900/40 text-field-300 border border-field-800'
            }`}>
              {pwMsg.text}
            </div>
          )}
          <button type="submit" disabled={pwSaving} className="btn-primary">
            {pwSaving && <Loader2 className="w-4 h-4 animate-spin" />}
            Update Password
          </button>
        </form>
      </div>

      {/* My leagues */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-turf-800 flex items-center gap-2">
          <Trophy className="w-4 h-4 text-field-400" />
          <h3 className="font-medium text-white text-sm">My Leagues</h3>
        </div>
        <div className="divide-y divide-turf-800">
          {allLeagues.map(l => {
            const role = allMemberships[l.id];
            const isActive = l.id === league.id;
            return (
              <div key={l.id} className="flex items-center gap-3 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white truncate">{l.name}</span>
                    {isActive && (
                      <span className="flex items-center gap-1 text-xs text-field-500">
                        <Check className="w-3 h-3" /> Viewing
                      </span>
                    )}
                  </div>
                </div>
                {role === 'commissioner' ? (
                  <span className="badge-green text-xs flex-shrink-0">
                    <Shield className="w-3 h-3" /> Admin
                  </span>
                ) : (
                  <span className="badge-gray text-xs flex-shrink-0">Member</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
