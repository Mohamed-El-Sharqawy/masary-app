/**
 * Tests for the /capture API client (services/api.ts).
 * Mocks the expo modules + global fetch (no network): verifies the auth
 * header policy — x-device-id on EVERY call (guest + signed-in), with
 * Authorization additionally when a token exists — for captureText and
 * captureAudio (POST + FormData body). Used by: `npm test` / CI.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-constants', () => ({ default: {} }));
vi.mock('expo-crypto', () => ({ randomUUID: () => 'mock-device-uuid' }));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: async () => null, setItem: async () => undefined },
}));

import { APP_CONFIG, captureAudio, captureText } from '../services/api';

/** Stub global fetch with a single ok JSON response; returns the mock. */
function stubFetch() {
  const fn = vi.fn().mockImplementation(async () => ({ ok: true, json: async () => ({}) }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('captureText', () => {
  it('sends both Authorization and x-device-id when signed in', async () => {
    const fetchMock = stubFetch();
    await captureText('كوفي بـ ٣٥', 'jwt-abc');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(APP_CONFIG.edgeUrl);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer jwt-abc');
    expect(init.headers['x-device-id']).toBe('mock-device-uuid');
    expect(JSON.parse(init.body as string).text).toBe('كوفي بـ ٣٥');
  });

  it('sends x-device-id only (no Authorization) for guests', async () => {
    const fetchMock = stubFetch();
    await captureText('كوفي بـ ٣٥', null);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
    expect(init.headers['x-device-id']).toBe('mock-device-uuid');
  });
});

describe('captureAudio', () => {
  it('sends both Authorization and x-device-id when signed in (POST + FormData)', async () => {
    const fetchMock = stubFetch();
    await captureAudio('file:///cache/recording.wav', 'jwt-abc');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(APP_CONFIG.edgeUrl);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer jwt-abc');
    expect(init.headers['x-device-id']).toBe('mock-device-uuid');
    expect(init.body).toBeInstanceOf(FormData);
  });

  it('sends x-device-id only (no Authorization) for guests (POST + FormData)', async () => {
    const fetchMock = stubFetch();
    await captureAudio('file:///cache/recording.m4a', null);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
    expect(init.headers['x-device-id']).toBe('mock-device-uuid');
    expect(init.body).toBeInstanceOf(FormData);
  });
});
