import { useState, useEffect } from 'react';
import { Loader2, Play, X } from 'lucide-react';
import posthog from 'posthog-js';
import type { useAuth } from '../hooks/useAuth';
import { PasswordInput } from '../components/ui/PasswordInput';

type Mode = 'login' | 'signup' | 'forgot';

interface Props {
  auth: ReturnType<typeof useAuth>;
}

// Google's official four-color "G" mark — kept as its own inline SVG (not a
// lucide icon) since brand marks like this need their exact fixed colors,
// not a currentColor icon that would inherit the button's theme color.
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
      <path fill="#FF3D00" d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
    </svg>
  );
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
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  const handleGoogle = async () => {
    setGoogleSubmitting(true);
    setMsg(null);
    const err = await auth.signInWithGoogle();
    // On success the page navigates away to Google immediately, so there's
    // nothing left to reset here — only an immediate rejection (e.g.
    // network failure before the redirect fires) lands in this branch.
    if (err) { setMsg({ type: 'error', text: err.message }); setGoogleSubmitting(false); }
  };

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

      {/* Desktop-only brand lockup, page corner rather than inside the card —
          mirrors a reference login layout with the wordmark up top-left.
          Mobile keeps the logo inside the card (no room for a corner lockup
          on a narrow viewport), so this only renders once isDesktop is true. */}
      {isDesktop && (
        <div className="absolute top-8 left-8 z-10 flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-field-500 shadow-lg shadow-field-500/20 flex-shrink-0">
            <span className="font-display text-turf-950 text-xl leading-none">G</span>
          </div>
          {/* text-[40px] intentionally matches the square's 40px (w-10/h-10)
              height exactly, rather than a Tailwind step near it — leading-none
              keeps the line-box from adding vertical slack around the glyphs. */}
          <span className="font-display text-[40px] leading-none tracking-wider text-white">GRIDIRON GLORY</span>
        </div>
      )}

      {videoOpen && <BrandVideoModal onClose={() => setVideoOpen(false)} />}

      {/* Explicit grid (not flex) so the sign-in and video columns share a
          real row/baseline instead of two independently-sized blocks that
          merely sit near each other. */}
      <div className="relative w-full max-w-7xl grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start justify-items-center lg:justify-items-stretch gap-6">
        {/* Sign-in column */}
        <div className="w-full max-w-sm lg:max-w-none flex flex-col gap-6">
          {/* Card */}
          <div className="card p-6 animate-slide-up">
            {/* Logo mark — mobile only; desktop shows the brand lockup in
                the page corner instead (see above), outside the card. */}
            {!isDesktop && (
              <div className="mb-6 text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-field-500 mb-3 shadow-lg shadow-field-500/20">
                  <span className="font-display text-turf-950 text-3xl leading-none">G</span>
                </div>
                <h1 className="font-display text-4xl tracking-wider text-white">GRIDIRON GLORY</h1>
                <p className="text-turf-400 mt-1 text-sm">College Football Fantasy League</p>
              </div>
            )}

            {mode !== 'forgot' && (
              <h2 className="text-lg font-semibold text-white text-center mb-6">
                {mode === 'login' ? 'Sign In' : 'Sign Up'}
              </h2>
            )}

            {mode !== 'forgot' && (
              <div className="mb-6 space-y-4">
                <button
                  type="button"
                  onClick={handleGoogle}
                  disabled={googleSubmitting}
                  className="btn-secondary w-full btn-lg"
                >
                  {googleSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <GoogleIcon className="w-4 h-4" />
                  )}
                  Continue with Google
                </button>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-turf-800" />
                  <span className="text-xs text-turf-500 uppercase tracking-wide">or</span>
                  <div className="flex-1 h-px bg-turf-800" />
                </div>
                <p className="text-xs text-turf-500 text-center">
                  {mode === 'login' ? 'Sign in' : 'Sign up'} using email address
                </p>
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
                  className="text-sm text-turf-400 hover:text-field-400 transition-colors -mt-2 self-end"
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

            {mode !== 'forgot' && (
              <p className="text-sm text-turf-400 text-center mt-6">
                {mode === 'login' ? (
                  <>
                    Need to create an account?{' '}
                    <button
                      type="button"
                      onClick={() => { setMode('signup'); setMsg(null); }}
                      className="text-field-400 hover:text-field-300 font-medium transition-colors"
                    >
                      Sign Up
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={() => { setMode('login'); setMsg(null); }}
                      className="text-field-400 hover:text-field-300 font-medium transition-colors"
                    >
                      Sign In
                    </button>
                  </>
                )}
              </p>
            )}
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
