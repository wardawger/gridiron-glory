import { useState, useEffect } from 'react';
import { Loader2, Play, X } from 'lucide-react';
import posthog from 'posthog-js';
import type { useAuth } from '../hooks/useAuth';
import { PasswordInput } from '../components/ui/PasswordInput';

type Mode = 'login' | 'signup' | 'forgot';

interface Props {
  auth: ReturnType<typeof useAuth>;
}

// Matches Tailwind's `lg` breakpoint. The brand animation column is
// desktop-only — on mobile it's skipped entirely (not just hidden) so a
// phone never pays for it.
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)');
    const onChange = () => setIsDesktop(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return isDesktop;
}

function AppSummary() {
  return (
    <div className="text-center animate-fade-in">
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
  );
}

// Poster + click-to-play, rather than autoplay — the video never loads its
// React/Babel/unpkg runtime until someone actually asks to see it, on any
// device. Opens a modal at a size much closer to the animation's native
// 1920x1080 canvas than the card it lives in could ever offer at 2/3 of a
// typical viewport width.
function BrandVideoCard({ onPlay }: { onPlay: () => void }) {
  return (
    <div className="card p-0 overflow-hidden animate-fade-in" style={{ aspectRatio: '16 / 9' }}>
      <button
        type="button"
        onClick={onPlay}
        aria-label="Play the Gridiron Glory brand video"
        className="group relative block w-full h-full"
      >
        <img src="/brand-animation/poster.webp" alt="" className="w-full h-full object-cover" />
        <span className="absolute inset-0 flex items-center justify-center bg-black/35 group-hover:bg-black/45 transition-colors">
          <span className="flex items-center justify-center w-16 h-16 rounded-full bg-white/95 group-hover:bg-white shadow-lg shadow-black/40 transition-colors group-hover:scale-105 duration-200">
            <Play className="w-6 h-6 text-turf-950 ml-1" fill="currentColor" />
          </span>
        </span>
      </button>
    </div>
  );
}

function BrandVideoModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in"
      style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
      onClick={onClose}
    >
      <div className="relative w-full" style={{ maxWidth: 'min(92vw, 1600px)' }} onClick={e => e.stopPropagation()}>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute -top-11 right-0 rounded-lg border border-turf-700 bg-turf-900 p-2 text-turf-300 hover:border-turf-500 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="rounded-xl overflow-hidden shadow-2xl shadow-black/60" style={{ aspectRatio: '16 / 9' }}>
          <iframe
            src="/brand-animation/gridiron-glory-animation.dc.html"
            title="Gridiron Glory brand video — draft, captain, and Saturday scoring, plus a season overview"
            className="w-full h-full border-0 block"
          />
        </div>
      </div>
    </div>
  );
}

export function AuthPage({ auth }: Props) {
  const isDesktop = useIsDesktop();
  const [videoOpen, setVideoOpen] = useState(false);
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
    <div className="min-h-dvh flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 yard-lines pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-field-500/5 rounded-full blur-3xl pointer-events-none" />

      {videoOpen && <BrandVideoModal onClose={() => setVideoOpen(false)} />}

      {/* Explicit grid (not flex) so the sign-in and video columns share a
          real row/baseline instead of two independently-sized blocks that
          merely sit near each other. */}
      <div className="relative w-full max-w-7xl grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start justify-items-center lg:justify-items-stretch gap-6">
        {/* Sign-in column */}
        <div className="w-full max-w-sm lg:max-w-none flex flex-col gap-6">
          {/* Card */}
          <div className="card p-6 animate-slide-up">
            {/* Logo mark */}
            <div className="mb-6 text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-field-500 mb-3 shadow-lg shadow-field-500/20">
                <span className="font-display text-turf-950 text-3xl leading-none">G</span>
              </div>
              <h1 className="font-display text-4xl tracking-wider text-white">GRIDIRON GLORY</h1>
              <p className="text-turf-400 mt-1 text-sm">College Football Fantasy League</p>
            </div>

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

          {/* On mobile there's no video column, so the summary lives right
              here, under the card. On desktop it moves under the video. */}
          {!isDesktop && <AppSummary />}
        </div>

        {/* Brand video column — desktop only */}
        {isDesktop && (
          <div className="w-full flex flex-col gap-6">
            <BrandVideoCard onPlay={() => setVideoOpen(true)} />
            <AppSummary />
          </div>
        )}
      </div>
    </div>
  );
}
