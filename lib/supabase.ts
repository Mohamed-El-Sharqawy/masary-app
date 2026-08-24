/**
 * Supabase client + auth helpers for the Masary app.
 * Lazily creates the single supabase-js client from APP_CONFIG public env
 * (EXPO_PUBLIC_SUPABASE_URL + ANON_KEY only — secrets never live in app
 * code). Auth helpers wrap supabase.auth for email/password, Google/Apple
 * OAuth (external browser on native), guest mode (local-only flag in the
 * auth store — zero cloud writes), and session introspection.
 * Used by: lib/auth-store.ts (hydrate), lib/sync.ts (session), settings /
 * onboarding account UI.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { APP_CONFIG } from '@/services/api';
import { useAuth, type AuthUser } from '@/lib/auth-store';

let client: SupabaseClient | null = null;

/** Lazily create the single Supabase client; sessions persist in AsyncStorage. */
export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(APP_CONFIG.supabaseUrl, APP_CONFIG.supabaseAnonKey, {
      auth: {
        storage: AsyncStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

/** Map a supabase auth user to the lightweight identity the app stores. */
function toAuthUser(user: { id: string; email?: string | null }): AuthUser {
  return { id: user.id, email: user.email ?? null };
}

/** Sign in with email + password. Throws on bad credentials. */
export async function signIn(email: string, password: string): Promise<AuthUser> {
  const { data, error } = await getSupabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (!data.user) throw new Error('sign_in_failed');
  const user = toAuthUser(data.user);
  useAuth.getState().setSignedIn(user);
  return user;
}

/** Sign up with email + password; session starts once email is confirmed. */
export async function signUp(email: string, password: string): Promise<AuthUser | null> {
  const { data, error } = await getSupabase().auth.signUp({ email, password });
  if (error) throw error;
  if (!data.user) return null;
  const user = toAuthUser(data.user);
  if (data.session) useAuth.getState().setSignedIn(user);
  return user;
}

/** Continue as guest: pure local-mode flag — zero cloud reads/writes. */
export function continueAsGuest(): void {
  useAuth.getState().setGuest();
}

/** Google OAuth — renders in an external browser on native. */
export async function signInWithGoogle(): Promise<void> {
  const { error } = await getSupabase().auth.signInWithOAuth({ provider: 'google' });
  if (error) throw error;
}

/** Apple OAuth — renders in an external browser on native. */
export async function signInWithApple(): Promise<void> {
  const { error } = await getSupabase().auth.signInWithOAuth({ provider: 'apple' });
  if (error) throw error;
}

/** Sign out: end the Supabase session, then reset the store to local mode. */
export async function signOut(): Promise<void> {
  const auth = useAuth.getState();
  if (auth.mode === 'signed_in') await getSupabase().auth.signOut();
  auth.signOut();
}

/** Current user from the live session (null when signed out). */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const { data, error } = await getSupabase().auth.getUser();
  if (error) return null;
  return data.user ? toAuthUser(data.user) : null;
}
