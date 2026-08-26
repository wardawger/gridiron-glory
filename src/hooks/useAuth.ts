import { useState, useEffect, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import posthog from 'posthog-js';
import { supabase } from '../lib/supabase';

const posthogConfigured = Boolean(
  import.meta.env.VITE_POSTHOG_KEY && import.meta.env.VITE_POSTHOG_HOST,
);

// The app is reachable at more than one domain (the original Netlify
// subdomain, plus this custom domain), but Supabase's OAuth/email redirects
// only land on whichever URL is in its project's Redirect URLs allowlist —
// requesting window.location.origin silently falls back to that allowlisted
// Site URL when the current domain isn't on it, landing the user on a
// completely different origin (and losing anything stored in localStorage
// under the domain they started on, like a pending invite token). Hardcoding
// the canonical domain here keeps every auth redirect landing somewhere
// that's actually allowlisted, regardless of which domain the user started on.
const CANONICAL_ORIGIN = 'https://gridironglory.app';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const identifiedUserId = useRef<string | null>(null);

  useEffect(() => {
    const identifyUser = (authenticatedUser: User) => {
      if (!posthogConfigured || identifiedUserId.current === authenticatedUser.id) return;

      if (identifiedUserId.current) posthog.reset();

      posthog.identify(authenticatedUser.id, {
        email: authenticatedUser.email,
        display_name: authenticatedUser.user_metadata?.display_name as string | undefined,
      });
      identifiedUserId.current = authenticatedUser.id;
    };

    // OAuth providers (Google) populate user_metadata with their own name
    // fields (full_name/name), not this app's display_name. Backfill it
    // once, from whichever the provider gave us, so every other read site
    // (leagues, invites, headers) can keep reading user_metadata.display_name
    // without needing to know about OAuth as a special case.
    const backfillDisplayName = async (authenticatedUser: User) => {
      if (authenticatedUser.user_metadata?.display_name) return;
      const fallback =
        authenticatedUser.user_metadata?.full_name ??
        authenticatedUser.user_metadata?.name ??
        authenticatedUser.email;
      if (!fallback) return;
      await supabase.auth.updateUser({ data: { display_name: fallback } });
    };

    supabase.auth.getSession().then(({ data }) => {
      const authenticatedUser = data.session?.user ?? null;
      setUser(authenticatedUser);
      if (authenticatedUser) identifyUser(authenticatedUser);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const authenticatedUser = session?.user ?? null;
      setUser(authenticatedUser);
      if (authenticatedUser) identifyUser(authenticatedUser);
      if (event === 'SIGNED_IN' && authenticatedUser) backfillDisplayName(authenticatedUser);
      if (event === 'SIGNED_OUT' && posthogConfigured) {
        posthog.reset();
        identifiedUserId.current = null;
      }
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, displayName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });
    return error;
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error;
  };

  // Covers both sign-up and sign-in — Supabase creates the account on first
  // OAuth login and just authenticates on subsequent ones, so there's no
  // separate "new user" branch to handle here.
  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: CANONICAL_ORIGIN },
    });
    return error;
  };

  const signOut = () => supabase.auth.signOut();

  const resetPasswordForEmail = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${CANONICAL_ORIGIN}/reset-password`,
    });
    return error;
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (!error) setPasswordRecovery(false);
    return error;
  };

  const displayName = user?.user_metadata?.display_name as string | undefined;

  return {
    user,
    loading,
    displayName,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    passwordRecovery,
    resetPasswordForEmail,
    updatePassword,
  };
}
