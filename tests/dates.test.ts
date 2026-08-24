/**
 * Tests for date utilities (utils/dates.ts).
 * Egyptian relative-date phrase resolution + Cairo-calendar period boundaries.
 */
import { describe, expect, it } from 'vitest';
import {
  RELATIVE_DATE_PHRASES,
  resolveRelativePhrase,
  startOfMonth,
  startOfToday,
} from '../utils/dates';

const NOW = new Date('2026-08-24T10:00:00Z'); // Monday 13:00 Cairo

describe('RELATIVE_DATE_PHRASES', () => {
  it('contains the locked phrase table', () => {
    expect(RELATIVE_DATE_PHRASES['امبارح']).toBe(1);
    expect(RELATIVE_DATE_PHRASES['من يومين']).toBe(2);
    expect(RELATIVE_DATE_PHRASES['من تلت ايام']).toBe(3);
    expect(RELATIVE_DATE_PHRASES['النهارده']).toBe(0);
  });
});

describe('resolveRelativePhrase', () => {
  it('امبارح → yesterday', () => {
    expect(resolveRelativePhrase('امبارح', NOW)).toBe('2026-08-23T10:00:00.000Z');
  });
  it('من يومين → 2 days ago', () => {
    expect(resolveRelativePhrase('من يومين', NOW)).toBe('2026-08-22T10:00:00.000Z');
  });
  it('النهارده → now', () => {
    expect(resolveRelativePhrase('النهارده', NOW)).toBe(NOW.toISOString());
  });
  it('unknown phrase → null (keep extractor answer)', () => {
    expect(resolveRelativePhrase('في يوم ما', NOW)).toBeNull();
  });
  it('الجمعة اللي فاتت → previous Friday', () => {
    // Monday 2026-08-24 Cairo → previous Friday is 2026-08-21 12:00 Cairo = 09:00Z
    expect(resolveRelativePhrase('الجمعة اللي فاتت', NOW)).toBe('2026-08-21T09:00:00.000Z');
  });
});

describe('period boundaries (Cairo calendar)', () => {
  it('startOfToday truncates to Cairo midnight', () => {
    const s = startOfToday(new Date('2026-08-24T15:30:00Z')); // 18:30 Cairo
    expect(s).toBe('2026-08-23T21:00:00.000Z'); // Aug 24 00:00 Cairo = Aug 23 21:00Z
  });
  it('startOfMonth gives the 1st at Cairo midnight', () => {
    const s = startOfMonth(new Date('2026-08-24T15:30:00Z'));
    expect(s).toBe('2026-07-31T21:00:00.000Z'); // Aug 1 00:00 Cairo = Jul 31 21:00Z
  });
});
