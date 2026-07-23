import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { useAuth } from '../hooks/useAuth';
import { PasswordInput } from '../components/ui/PasswordInput';

interface Props {
  auth: ReturnType<typeof useAuth>;
}

export function ResetPasswordPage({ auth }: Props) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setMsg({ type: 'error', text: "Passwords don't match" });
      return;
    }
    setSubmitting(true);
    setMsg(null);
    const err = await auth.updatePassword(password);
    if (err) setMsg({ type: 'error', text: err.message });
    else setMsg({ type: 'success', text: 'Password updated! Redirecting…' });
    setSubmitting(false);
  };

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 yard-lines pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-field-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="mb-8 text-center animate-fade-in">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-field-500 mb-4 shadow-lg shadow-field-500/20">
          <span className="font-display text-turf-950 text-4xl leading-none">G</span>
        </div>
        <h1 className="font-display text-5xl tracking-wider text-white">GRIDIRON GLORY</h1>
        <p className="text-turf-400 mt-1 text-sm">Set a new password</p>
      </div>

      <div className="w-full max-w-sm card p-6 animate-slide-up">
        <form onSubmit={handle} className="space-y-4">
          <div>
            <label className="label">New Password</label>
            <PasswordInput
              className="input"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              autoFocus
            />
          </div>
          <div>
            <label className="label">Confirm Password</label>
            <PasswordInput
              className="input"
              placeholder="••••••••"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              minLength={6}
            />
          </div>

          {msg && (
            <div className={`text-sm rounded-lg px-3 py-2 ${
              msg.type === 'error'
                ? 'bg-red-900/40 text-red-300 border border-red-800'
                : 'bg-field-900/40 text-field-300 border border-field-800'
            }`}>
              {msg.text}
            </div>
          )}

          <button type="submit" disabled={submitting} className="btn-primary w-full btn-lg">
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Update Password
          </button>
        </form>
      </div>
    </div>
  );
}
