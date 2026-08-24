/**
 * API client for the Masary app.
 * All network calls live here: Supabase Edge Function /capture (AI extraction
 * proxy) and (M1) supabase-js sync endpoints. Guests call /capture with a
 * device id header (rate-limited, no account); signed-in users attach their
 * session JWT. Used by: services/mutations.ts, lib/sync.ts.
 */
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Runtime app config from app.json / EAS extra (public-safe values only). */
export const APP_CONFIG = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  edgeUrl: `${process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''}/functions/v1/capture`,
};

/** Stable per-install device id (guest rate-limit key). */
export async function getDeviceId(): Promise<string> {
  const KEY = 'masary-device-id';
  const existing = await AsyncStorage.getItem(KEY);
  if (existing) return existing;
  const id = Crypto.randomUUID();
  await AsyncStorage.setItem(KEY, id);
  return id;
}

/**
 * Send text (or transcript) to the Edge Function for AI extraction.
 * @param text user message in any language mix
 * @param authToken Supabase access token when signed in (null for guests)
 * @returns extraction JSON per the §4 contract
 */
export async function captureText(
  text: string,
  authToken: string | null,
): Promise<unknown> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  else headers['x-device-id'] = await getDeviceId();

  const res = await fetch(APP_CONFIG.edgeUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `capture_failed_${res.status}`);
  }
  return res.json();
}

/** Exposed for tests. */
export const __internals = { Constants };
