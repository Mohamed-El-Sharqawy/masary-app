/**
 * Tests for the extraction Zod schema (lib/ai/schema.ts).
 * Valid contract passes; hallucination-prone shapes are rejected.
 */
import { describe, expect, it } from 'vitest';
import { ExtractionResultSchema } from '../lib/ai/schema';

const validExpense = {
  amount: 35,
  currency: 'EGP',
  currency_stated: false,
  merchant: null,
  person: null,
  category: 'coffee',
  spent_at: '2026-08-24T09:00:00+02:00',
  date_resolution: 'day',
  notes: 'شريت قهوة وميترو',
  confidence: 0.92,
};

describe('ExtractionResultSchema', () => {
  it('accepts a valid extraction', () => {
    const r = ExtractionResultSchema.parse({
      expenses: [validExpense],
      unparsed_text: null,
      clarification_needed: null,
    });
    expect(r.expenses[0].amount).toBe(35);
  });

  it('accepts clarification-only responses', () => {
    const r = ExtractionResultSchema.parse({
      expenses: [],
      unparsed_text: null,
      clarification_needed: 'بكم القهوة وبكم المواصلات؟',
    });
    expect(r.clarification_needed).toContain('القهوة');
  });

  it('rejects an invented category', () => {
    expect(() =>
      ExtractionResultSchema.parse({
        expenses: [{ ...validExpense, category: 'shisha' }],
        unparsed_text: null,
        clarification_needed: null,
      }),
    ).toThrow();
  });

  it('rejects negative amounts', () => {
    expect(() =>
      ExtractionResultSchema.parse({
        expenses: [{ ...validExpense, amount: -5 }],
        unparsed_text: null,
        clarification_needed: null,
      }),
    ).toThrow();
  });

  it('rejects confidence out of range', () => {
    expect(() =>
      ExtractionResultSchema.parse({
        expenses: [{ ...validExpense, confidence: 1.5 }],
        unparsed_text: null,
        clarification_needed: null,
      }),
    ).toThrow();
  });

  it('rejects garbage shapes outright', () => {
    expect(() => ExtractionResultSchema.parse({ foo: 'bar' })).toThrow();
  });
});
