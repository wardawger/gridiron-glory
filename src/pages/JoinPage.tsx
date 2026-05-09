import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
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

  useEffect(() => {
    if (!token) { setStatus('error'); setMsg('Invalid invite link.'); return; }

    const join = async () => {
      const { data: invite, error: invErr } = await supabase
        .from('invites')
        .select('*, leagues(name)')
        .eq('token', token)
        .maybeSingle();

      if (invErr || !invite) {
        setStatus('error');
        setMsg('This invite link is invalid or has expired.');
        return;
      }
      if (invite.accepted) {
        setStatus('error');
        setMsg('This invite has already been used.');
        return;
      }

      const name = (invite.leagues as any)?.name ?? 'the league';
      setLeagueName(name);

      if (!user) {
        sessionStorage.setItem('pending_invite', token);
        setStatus('needsAuth');
        setMsg(`You've been invited to join "${name}". Sign up or sign in to continue.`);
        return;
      }

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

      await supabase.from('invites').update({ accepted: true }).eq('id', invite.id);

      setStatus('success');
      setMsg(`Welcome to "${name}"! Taking you there now…`);
      onJoined?.(invite.league_id);
      setTimeout(() => navigate('/'), 1500);
    };

    join();
  }, [token, user]);

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
            <XCircle className="w-10 h-10 text-red-400 mx-auto" />
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
