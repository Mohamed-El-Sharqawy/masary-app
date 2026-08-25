/**
 * Tests for the extraction client wrapper (lib/ai/extract.ts).
 * Mocks the expo modules + global fetch (no network): covers happy path,
 * bare vs envelope-wrapped response shapes, single repair retry, double
 * failure → ExtractionSchemaError, auth headers, and the deterministic
 * normalizer passes (relative dates, Eastern numerals).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-constants', () => ({ default: {} }));
vi.mock('expo-crypto', () => ({ randomUUID: () => 'mock-device-uuid' }));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: async () => null, setItem: async () => undefined },
}));

import { ExtractionSchemaError, extractExpenses, normalizeExtraction } from '../lib/ai/extract';
import type { ZodExtractionResult } from '../lib/ai/schema';
import { APP_CONFIG } from '../services/api';

const FIXED_NOW = new Date('2026-08-24T12:00:00Z');

/** Valid /capture payload with overridable expense fields. */
function okPayload(expenseOverrides: Record<string, unknown> = {}): ZodExtractionResult {
  return {
    expenses: [
      {
        amount: 35,
        currency: 'EGP',
        currency_stated: false,
        merchant: null,
        person: null,
        category: 'coffee',
        spent_at: '2026-08-24T09:00:00+02:00',
        date_resolution: 'day',
        notes: 'قهوة',
        confidence: 0.92,
        ...expenseOverrides,
      },
    ],
    unparsed_text: null,
    clarification_needed: null,
  } as ZodExtractionResult;
}

/** Stub global fetch with a sequence of ok JSON responses. */
function stubFetch(...bodies: unknown[]) {
  const fn = vi.fn();
  for (const body of bodies) {
    fn.mockImplementationOnce(async () => ({ ok: true, json: async () => body }));
  }
  vi.stubGlobal('fetch', fn);
  return fn;
}

/** Body object of the n-th fetch call. */
function sentBody(fetchMock: ReturnType<typeof stubFetch>, call: number) {
  return JSON.parse(fetchMock.mock.calls[call - 1][1].body as string) as { text: string };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('extractExpenses', () => {
  it('returns the parsed result on a valid response (single call)', async () => {
    const fetchMock = stubFetch(okPayload());
    const r = await extractExpenses('كوكي بـ ٣٥', null);
    expect(r.expenses[0].amount).toBe(35);
    expect(r.expenses[0].category).toBe('coffee');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(APP_CONFIG.edgeUrl);
    expect(sentBody(fetchMock, 1).text).toBe('كوكي بـ ٣٥');
  });

  it('unwraps an envelope-wrapped response and succeeds on the first call', async () => {
    const envelope = {
      transcript: null,
      extracted: okPayload({ spent_at: 'امبارح', notes: 'دفعت ٣٥٫٥٠ جنيه' }),
      user_id: null,
    };
    const fetchMock = stubFetch(envelope);
    const r = await extractExpenses('امبارح كوكي بـ ٣٥', null);
    expect(r.expenses[0].amount).toBe(35);
    expect(fetchMock).toHaveBeenCalledTimes(1); // valid on first parse — no repair
    // normalizeExtraction still runs on the unwrapped result:
    expect(r.expenses[0].spent_at).toBe('2026-08-23T12:00:00.000Z'); // FIXED_NOW − 1 day
    expect(r.expenses[0].notes).toBe('دفعت 35.50 جنيه');
  });

  it('repairs once when the first response fails validation', async () => {
    const fetchMock = stubFetch({ foo: 'bar' }, okPayload());
    const r = await extractExpenses('اتنان كوفي بـ ٧٠', 'token-123');
    expect(r.expenses[0].amount).toBe(35);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const repair = sentBody(fetchMock, 2).text;
    expect(repair).toContain('اتنان كوفي بـ ٧٠');
    expect(repair).toContain('Previous response failed schema validation:');
    expect(repair).toContain('Return ONLY corrected JSON.');
  });

  it('throws ExtractionSchemaError when both attempts fail validation', async () => {
    const fetchMock = stubFetch({ foo: 'bar' }, 'still not json-contract');
    await expect(extractExpenses('حاجة غلط', null)).rejects.toBeInstanceOf(ExtractionSchemaError);
    expect(fetchMock).toHaveBeenCalledTimes(2); // exactly one repair, no third call
  });

  it('resolves a relative-date phrase in spent_at against the Cairo clock', async () => {
    const fetchMock = stubFetch(okPayload({ spent_at: 'امبارح' }));
    const r = await extractExpenses('امبارح كوفي', null);
    expect(r.expenses[0].spent_at).toBe('2026-08-23T12:00:00.000Z'); // FIXED_NOW − 1 day
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('leaves an already-resolved ISO spent_at untouched', async () => {
    stubFetch(okPayload({ spent_at: '2026-08-20T18:30:00.000Z' }));
    const r = await extractExpenses('اتنين و عشرين اوجوست', null);
    expect(r.expenses[0].spent_at).toBe('2026-08-20T18:30:00.000Z');
  });

  it('normalizes Eastern numerals in notes to Western (٫ → .)', async () => {
    stubFetch(okPayload({ notes: 'دفعت ٣٥٫٥٠ جنيه' }));
    const r = await extractExpenses('دفعت ٣٥٫٥٠ جنيه', null);
    expect(r.expenses[0].notes).toBe('دفعت 35.50 جنيه');
  });

  it('always sends x-device-id; Authorization additionally when signed in', async () => {
    const fetchMock = stubFetch(okPayload(), okPayload());
    await extractExpenses('كوفي', 'jwt-abc');
    await extractExpenses('كوفي', null);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer jwt-abc');
    expect(fetchMock.mock.calls[0][1].headers['x-device-id']).toBe('mock-device-uuid');
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBeUndefined();
    expect(fetchMock.mock.calls[1][1].headers['x-device-id']).toBe('mock-device-uuid');
  });
});

describe('normalizeExtraction', () => {
  it('keeps null notes null', () => {
    const out = normalizeExtraction(okPayload({ notes: null }));
    expect(out.expenses[0].notes).toBeNull();
  });

  it('leaves unknown relative phrases to the extractor answer', () => {
    const out = normalizeExtraction(okPayload({ spent_at: 'من شهرين' })); // not in table
    expect(out.expenses[0].spent_at).toBe('من شهرين');
  });
});
