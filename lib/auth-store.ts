/**
 * Auth state store for the Masary app (Zustand + AsyncStorage persistence).
 * Exactly two modes: 'guest' (pure local — SQLite only, zero cloud writes)
 * or 'signed_in' (Supabase session active). Persists mode + user identity
 * for instant restore on launch; hydrate() then verifies the real Supabase
 * session and keeps the store aligned via onAuthStateChange.
 * Used by: lib/supabase.ts (auth helpers), lib/sync.ts (guest gate),
 * settings + onboarding account UI.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { getSupabase } from '@/lib/supabase';

/** Lightweight user identity — id + email only. */
export interface AuthUser {
  id: string;
  email: string | null;
}

/** Only two modes: local-only guest, or signed-in with cloud sync. */
export type AuthMode = 'guest' | 'signed_in';

interface AuthState {
  mode: AuthMode;
  user: AuthUser | null;
  initializing: boolean;
  /** Restore the Supabase session on launch and subscribe to auth changes. */
  hydrate: () => Promise<void>;
  setGuest: () => void;
  setSignedIn: (user: AuthUser) => void;
  signOut: () => void;
}

let authListenerAttached = false;

/** Auth store; mode + user persisted under 'masary-auth' in AsyncStorage. */
export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      mode: 'guest',
      user: null,
      initializing: true,
      hydrate: async () => {
        const supabase = getSupabase();
        const { data } = await supabase.auth.getSession();
        const sessionUser = data.session?.user;
        set(
          sessionUser
            ? { mode: 'signed_in', user: { id: sessionUser.id, email: sessionUser.email ?? null }, initializing: false }
            : { mode: 'guest', user: null, initializing: false },
        );
        if (!authListenerAttached) {
          authListenerAttached = true;
          supabase.auth.onAuthStateChange((_event, session) => {
            const u = session?.user;
            set(
              u
                ? { mode: 'signed_in', user: { id: u.id, email: u.email ?? null } }
                : { mode: 'guest', user: null },
            );
          });
        }
      },
      setGuest: () => set({ mode: 'guest', user: null }),
      setSignedIn: (user) => set({ mode: 'signed_in', user }),
      signOut: () => set({ mode: 'guest', user: null }),
    }),
    {
      name: 'masary-auth',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ mode: state.mode, user: state.user }),
    },
  ),
);
