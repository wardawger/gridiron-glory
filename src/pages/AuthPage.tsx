import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import posthog from 'posthog-js';
import type { useAuth } from '../hooks/useAuth';
import { PasswordInput } from '../components/ui/PasswordInput';

type Mode = 'login' | 'signup' | 'forgot';

interface Props {
  auth: ReturnType<typeof useAuth>;
}

export function AuthPage({ auth }: Props) {
  const [mode, setMode]       = useState<Mode>('login');
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [name, setName]       = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg]         = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMsg(null);
    if (mode === 'login') {
      const err = await auth.signIn(email, password);
      if (err) setMsg({ type: 'error', text: err.message });
    } else if (mode === 'signup') {
      if (!name.trim()) { setMsg({ type: 'error', text: 'Display name required' }); setSubmitting(false); return; }
      const err = await auth.signUp(email, password, name.trim());
      if (err) setMsg({ type: 'error', text: err.message });
      else {
        posthog.capture('account_signed_up');
        setMsg({ type: 'success', text: 'Check your email to confirm your account, then sign in.' });
      }
    } else {
      const err = await auth.resetPasswordForEmail(email);
      if (err) setMsg({ type: 'error', text: err.message });
      else setMsg({ type: 'success', text: 'Check your email for a password reset link.' });
    }
    setSubmitting(false);
  };

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 yard-lines pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-field-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Card */}
      <div className="w-full max-w-sm card p-6 animate-slide-up">
        {mode !== 'forgot' && (
          <div className="flex gap-1 mb-6 bg-turf-800 p-1 rounded-lg">
            {(['login', 'signup'] as Mode[]).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setMsg(null); }}
                className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-all ${
                  mode === m
                    ? 'bg-field-500 text-turf-950'
                    : 'text-turf-400 hover:text-white'
                }`}
              >
                {m === 'login' ? 'Sign In' : 'Sign Up'}
              </button>
            ))}
          </div>
        )}

        {mode === 'forgot' && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-white">Reset your password</h2>
            <p className="text-turf-400 text-sm mt-1">
              Enter your email and we'll send you a link to reset your password.
            </p>
          </div>
        )}

        <form onSubmit={handle} className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label className="label">Display Name</label>
              <input
                className="input"
                type="text"
                placeholder="Your name (visible to league)"
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
            </div>
          )}
          <div>
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>
          {mode !== 'forgot' && (
            <div>
              <label className="label">Password</label>
              <PasswordInput
                className="input"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
          )}

          {mode === 'login' && (
            <button
              type="button"
              onClick={() => { setMode('forgot'); setMsg(null); }}
              className="text-sm text-turf-400 hover:text-field-400 transition-colors -mt-2"
            >
              Forgot password?
            </button>
          )}

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
            {mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Send Reset Link'}
          </button>

          {mode === 'forgot' && (
            <button
              type="button"
              onClick={() => { setMode('login'); setMsg(null); }}
              className="text-sm text-turf-400 hover:text-field-400 transition-colors w-full text-center"
            >
              Back to sign in
            </button>
          )}
        </form>
      </div>

      {/* Brand animation — opens and closes on the same logomark/wordmark
          lockup, so it also works as the page's brand moment on its own. */}
      <div className="w-full max-w-2xl mt-8 rounded-2xl overflow-hidden animate-fade-in" style={{ aspectRatio: '16 / 9' }}>
        <iframe
          src="/brand-animation/gridiron-glory-animation.dc.html"
          title="Gridiron Glory"
          className="w-full h-full border-0 block"
          loading="lazy"
        />
      </div>

      {/* New-user summary — condensed version of the full guide, with a link
          to it, so someone can learn what the app is before creating an
          account or joining a league. */}
      <div className="w-full max-w-sm mt-6 text-center animate-fade-in">
        <p className="text-turf-400 text-sm leading-relaxed">
          Draft real college football teams with your friends, then score points every week based on how those
          teams actually perform — wins, ranked upsets, captain picks, and more, all the way through the National
          Championship.
        </p>
        <a
          href="/gridiron-glory-guide.html"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-2 text-sm text-field-400 hover:text-field-300 transition-colors font-medium"
        >
          Read the full guide →
        </a>
      </div>
    </div>
  );
}
