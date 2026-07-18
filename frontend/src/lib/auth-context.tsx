'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '@/lib/supabase';
import { apiFetch } from '@/lib/api';
import { VerdiCredUser } from '@/lib/types';

interface AuthContextValue {
  supabaseUser: SupabaseUser | null;
  session: Session | null;
  profile: VerdiCredUser | null;
  token: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const [profile, setProfile] = useState<VerdiCredUser | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = getSupabaseBrowserClient();

  const refreshProfile = async () => {
    const {
      data: { session: s },
    } = await supabase.auth.getSession();
    if (!s) {
      setProfile(null);
      return;
    }
    try {
      const prof = await apiFetch<VerdiCredUser>('/auth/me', {
        token: s.access_token,
      });
      setProfile(prof);
    } catch {
      setProfile(null);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSupabaseUser(data.session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setSupabaseUser(sess?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  // When the session changes, resolve the VerdiCred profile.
  useEffect(() => {
    if (!session) {
      setProfile(null);
      return;
    }
    refreshProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  const token = session?.access_token ?? null;

  return (
    <AuthContext.Provider
      value={{
        supabaseUser,
        session,
        profile,
        token,
        loading,
        signIn,
        signUp,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
