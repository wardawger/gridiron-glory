import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import posthog from 'posthog-js';
import { supabase } from '../lib/supabase';

interface Props {
  user: User | null;
  onJoined?: (leagueId: string) => void;
}

export function JoinPage({ user, onJoined }: Props) {
  const { token }    = useParams<{ token: string }>();
  const navigate     = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'needsAuth'>('loading');
  const [msg, setMsg] = useState('');
  const [leagueName, setLeagueName] = useState('');
  // Supabase's auth listener fires setUser() from more than one source during
  // session hydration, each with a new User object reference for the same
  // logged-in user — guard against running the join sequence more than once
  // per token so a re-fire can't race itself into seeing "already accepted".
  const joinedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!token) { setStatus('error'); setMsg('Invalid invite link.'); return; }
    if (user && joinedTokenRef.current === token) return;

    const join = async () => {
      // Reads through a token-scoped RPC rather than selecting from
      // `invites` directly: that table's old policy let anyone (signed in
      // or not) read every row, which exposed every pending invite token
      // and invited email address. The table is now commissioner-only and
      // this function returns just the one invite the token names.
      const { data: rows, error: invErr } = await supabase
        .rpc('get_invite_by_token', { p_token: token });
      const invite = rows?.[0];

      if (invErr || !invite) {
        setStatus('error');
        setMsg('This invite link is invalid or has expired.');
        return;
      }

      const name = invite.league_name ?? 'the league';
      setLeagueName(name);

      if (invite.accepted) {
        // Could genuinely be a stale/reused link, but it could also be this
        // same user re-processing the invite after a background refresh
        // remounted this page post-join — check before showing an error.
        if (user) {
          const { data: alreadyIn } = await supabase
            .from('league_members')
            .select('id')
            .eq('league_id', invite.league_id)
            .eq('user_id', user.id)
            .maybeSingle();
          if (alreadyIn) {
            setStatus('success');
            setMsg(`You're already in "${name}"!`);
            onJoined?.(invite.league_id);
            setTimeout(() => navigate('/'), 1000);
            return;
          }
        }
        setStatus('error');
        setMsg('This invite has already been used.');
        return;
      }

      if (!user) {
        // localStorage (not sessionStorage) so this survives the email-confirmation
        // link opening in a different tab than the one that started sign-up.
        localStorage.setItem('pending_invite', token);
        setStatus('needsAuth');
        setMsg(`You've been invited to join "${name}". Sign up or sign in to continue.`);
        return;
      }

      joinedTokenRef.current = token;
      // Cleared here (not just by App.tsx's hard-reload recovery path) so a
      // completed join never leaves a stale token behind — otherwise a later
      // legitimate visit to /create-league could get redirected right back
      // here.
      localStorage.removeItem('pending_invite');

      // Check already a member
      const { data: existing } = await supabase
        .from('league_members')
        .select('id')
        .eq('league_id', invite.league_id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) {
        setStatus('success');
        setMsg(`You're already in "${name}"!`);
        onJoined?.(invite.league_id);
        setTimeout(() => navigate('/'), 1500);
        return;
      }

      // Join the league
      const { error: joinErr } = await supabase.from('league_members').insert({
        league_id:    invite.league_id,
        user_id:      user.id,
        display_name: user.user_metadata?.display_name ?? user.email ?? 'Player',
        role: 'member',
      });

      if (joinErr) {
        setStatus('error');
        setMsg(joinErr.message);
        return;
      }

      await supabase.rpc('accept_invite', { p_token: token });
      posthog.capture('league_joined');

      setStatus('success');
      setMsg(`Welcome to "${name}"! Taking you there now…`);
      onJoined?.(invite.league_id);
      setTimeout(() => navigate('/'), 1500);
    };

    join();
  }, [token, user?.id]);

  return (
    <div className="min-h-dvh flex items-center justify-center p-4">
      <div className="max-w-sm w-full card p-8 text-center space-y-5 animate-fade-in">
        {status === 'loading' && (
          <>
            <Loader2 className="w-10 h-10 text-field-400 mx-auto animate-spin" />
            <p className="text-turf-300">Processing your invite…</p>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle2 className="w-10 h-10 text-field-400 mx-auto" />
            <p className="text-white font-medium">{msg}</p>
          </>
        )}
        {status === 'error' && (
          <>
            <XCircle className="w-10 h-10 text-red-300 mx-auto" />
            <p className="text-red-300">{msg}</p>
            <button onClick={() => navigate('/')} className="btn-secondary w-full">
              Go Home
            </button>
          </>
        )}
        {status === 'needsAuth' && (
          <>
            <div className="w-12 h-12 rounded-xl bg-field-500 flex items-center justify-center mx-auto">
              <span className="font-display text-turf-950 text-2xl">G</span>
            </div>
            <p className="text-white font-medium">{msg}</p>
            <button onClick={() => navigate('/')} className="btn-primary w-full">
              Sign Up / Sign In
            </button>
          </>
        )}
      </div>
    </div>
  );
}
