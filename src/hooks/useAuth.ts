import { useState, useEffect, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import posthog from 'posthog-js';
import { supabase } from '../lib/supabase';

const posthogConfigured = Boolean(
  import.meta.env.VITE_POSTHOG_KEY && import.meta.env.VITE_POSTHOG_HOST,
);

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

  const signOut = () => supabase.auth.signOut();

  const resetPasswordForEmail = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
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
    signOut,
    passwordRecovery,
    resetPasswordForEmail,
    updatePassword,
  };
}
