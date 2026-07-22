import { useState } from 'react';
import { Loader2, User, Mail, Calendar, Shield, Trophy, Check } from 'lucide-react';
import type { useAuth } from '../hooks/useAuth';
import type { League, LeagueMember, LeagueRole } from '../types';

interface Props {
  auth: ReturnType<typeof useAuth>;
  league: League;
  myMembership: LeagueMember | undefined;
  allLeagues: League[];
  allMemberships: Record<string, LeagueRole>;
  onUpdateDisplayName: (name: string) => Promise<{ error?: string }>;
}

function formatJoinDate(iso: string | undefined): string {
  if (!iso) return 'Unknown';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function AccountPage({ auth, league, myMembership, allLeagues, allMemberships, onUpdateDisplayName }: Props) {
  const [name, setName]           = useState(myMembership?.display_name ?? '');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameMsg, setNameMsg]     = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [pwSaving, setPwSaving]   = useState(false);
  const [pwMsg, setPwMsg]         = useState<{ type: 'error' | 'success'; text: string } | null>(null);

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
