import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import posthog from 'posthog-js';
import type { useAuth } from '../hooks/useAuth';
import { PasswordInput } from '../components/ui/PasswordInput';

type Mode = 'login' | 'signup' | 'forgot';

interface Props {
  auth: ReturnType<typeof useAuth>;
}

// Rotation pool for the full-page login backdrop — one is chosen at random
// per page load (see the lazy useState below) and held for the component's
// lifetime, so switching between Sign In/Sign Up/Forgot never reshuffles it.
const LOGIN_BACKGROUNDS = [
  '/login-backgrounds/florida-south-carolina-block.webp',
  '/login-backgrounds/texas-bevo.webp',
  '/login-backgrounds/south-carolina-stadium.webp',
  '/login-backgrounds/fsu-flags.webp',
  '/login-backgrounds/florida-marching-band.webp',
  '/login-backgrounds/tennessee-neyland.webp',
];

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

// Same glass-card treatment as the sign-in card — the deck's own background
// is transparent (see gridiron-glory-slideshow.dc.html), so this wrapper's
// blurred/tinted backdrop paints behind it and shows through. Both panels
// share the same grid row with items-start, so their top edges already
// align exactly; the glass border now makes that alignment visible instead
// of the borderless iframe blending invisibly into the photo. scrolling="no"
// suppresses any iframe scrollbar regardless of the framed document's own
// overflow.
function BrandSlidesPanel() {
  return (
    <div className="glass-card p-0 overflow-hidden animate-fade-in" style={{ aspectRatio: '16 / 9' }}>
      <iframe
        src="/brand-animation/gridiron-glory-slideshow.dc.html"
        title="Gridiron Glory brand slide deck — draft, captain, and Saturday scoring, plus a season overview"
        scrolling="no"
        className="w-full h-full block border-0"
        style={{ background: 'transparent' }}
      />
    </div>
  );
}

export function AuthPage({ auth }: Props) {
  const isDesktop = useIsDesktop();
  // Lazy initializer runs once on mount, not on every render, so the photo
  // stays fixed for this visit and only reshuffles on an actual page reload.
  const [backgroundImage] = useState(
    () => LOGIN_BACKGROUNDS[Math.floor(Math.random() * LOGIN_BACKGROUNDS.length)]
  );
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
      {/* Full-page photo backdrop, one of LOGIN_BACKGROUNDS chosen at random
          per visit. The scrim beneath the existing yard-lines/glow layers
          keeps every layer's contrast identical to before this photo was
          added — text and controls read exactly as legibly as on the old
          flat background. */}
      <div
        className="absolute inset-0 bg-cover bg-center pointer-events-none"
        style={{ backgroundImage: `url(${backgroundImage})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-turf-950/85 via-turf-950/60 to-turf-950/90 pointer-events-none" />

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

      {/* Explicit grid (not flex) so the sign-in and slides columns share a
          real row/baseline instead of two independently-sized blocks that
          merely sit near each other. The card column is a fixed 408px (its
          established width from before the slides column existed) so
          widening the container only grows the slides side, not the card.
          lg:mt-16 gives the row a fixed offset from center on desktop
          (rather than pure vertical centering) so it can't drift up into
          the top-left logo lockup on shorter viewports — mobile has no
          such lockup to clear, so it keeps the plain centered layout.
          gap-10 (wider than the usual gap-6) keeps clear separation now
          that the slides panel is narrower. */}
      <div className="relative w-full max-w-[1500px] lg:mt-16 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_408px] lg:items-start justify-items-center lg:justify-items-stretch gap-10">
        {/* Sign-in column — ordered after the video column on desktop so the
            card sits on the right (mobile keeps document order, unaffected
            since lg:order only applies at the lg breakpoint). */}
        <div className="w-full max-w-sm lg:max-w-none flex flex-col gap-6 lg:order-2">
          {/* Card — glass-card, not the app's usual solid .card, so the photo
              backdrop shows through with a frosted-glass treatment. */}
          <div className="glass-card p-6 animate-slide-up">
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
              <h2 className="font-display text-3xl tracking-wider text-white text-center mb-6">
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

        {/* Brand slides column — desktop only. The panel itself is capped
            narrower than the full column and centered, rather than
            stretching edge-to-edge, since the deck's own fixed 1920px
            canvas has a lot of empty margin around its centered content —
            letting the glass background run the full column width just
            made that empty margin more visually prominent, not less. */}
        {isDesktop && (
          <div className="w-full flex flex-col gap-6 lg:order-1">
            <div className="w-full max-w-[1000px] mx-auto">
              <BrandSlidesPanel />
            </div>
            <AppSummary />
          </div>
        )}
      </div>
    </div>
  );
}
