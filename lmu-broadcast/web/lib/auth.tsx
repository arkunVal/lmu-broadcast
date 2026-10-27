"use client";

import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Profile } from "./labels";
import { getSupabase } from "./supabase";

type AuthState = {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthState>({
  configured: false,
  loading: true,
  session: null,
  profile: null,
  refreshProfile: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = getSupabase();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(
    async (userId: string | null) => {
      if (!supabase || !userId) {
        setProfile(null);
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, ingame_name, role")
        .eq("id", userId)
        .maybeSingle();
      setProfile((data as Profile | null) ?? null);
    },
    [supabase],
  );

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadProfile(data.session?.user.id ?? null);
      if (active) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      // nicht direkt im Callback auf Supabase warten (Deadlock-Gefahr), daher verzögert
      setTimeout(() => loadProfile(next?.user.id ?? null), 0);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase, loadProfile]);

  const value: AuthState = {
    configured: !!supabase,
    loading,
    session,
    profile,
    refreshProfile: () => loadProfile(session?.user.id ?? null),
    signOut: async () => {
      await supabase?.auth.signOut();
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
