/**
 * API client for the Masary app.
 * All network calls live here: Supabase Edge Function /capture (AI extraction
 * proxy — text + voice) and (M1) supabase-js sync endpoints. Guests call
 * /capture with a device id header (rate-limited, no account); signed-in
 * users attach their session JWT. Used by: services/mutations.ts,
 * lib/sync.ts, lib/voice/process.ts.
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

/** File name + mime for a recorded take by extension (Groq accepts all). */
function audioPart(uri: string): { name: string; type: string } {
  const ext = uri.slice(uri.lastIndexOf('.')).toLowerCase();
  const types: Record<string, string> = {
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.mp4': 'audio/mp4',
    '.webm': 'audio/webm',
  };
  return { name: `recording${ext}`, type: types[ext] ?? 'audio/mp4' };
}

/**
 * Upload a recorded take (16 kHz mono WAV/m4a) to the Edge Function:
 * Groq STT → transcript → extraction. Multipart 'audio' field per the §4
 * /capture contract. Guests use the device-id path (the designed guest AI
 * path — the only cloud call guests make); signed-in users attach their JWT.
 * @param uri local file uri of the recording
 * @param authToken Supabase access token when signed in (null for guests)
 * @returns the /capture JSON envelope (transcript + extraction)
 */
export async function captureAudio(
  uri: string,
  authToken: string | null,
): Promise<unknown> {
  const headers: Record<string, string> = {};
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  else headers['x-device-id'] = await getDeviceId();

  const { name, type } = audioPart(uri);
  const form = new FormData();
  form.append('audio', { uri, name, type } as unknown as Blob);
  const res = await fetch(APP_CONFIG.edgeUrl, { method: 'POST', headers, body: form });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `capture_failed_${res.status}`);
  }
  return res.json();
}

/** Exposed for tests. */
export const __internals = { Constants };
