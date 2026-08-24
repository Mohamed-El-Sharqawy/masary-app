/**
 * Tests for currency utilities (utils/currency.ts).
 * Integer minor-unit math, EGP normalization, word map.
 */
import { describe, expect, it } from 'vitest';
import {
  CURRENCY_WORD_MAP,
  amountToMinor,
  formatAmount,
  minorToAmount,
  toEgpMinor,
} from '../utils/currency';

describe('minor units', () => {
  it('EGP: 200 → 20000 piastres', () => {
    expect(amountToMinor(200, 'EGP')).toBe(20000);
  });
  it('EGP: 3.50 → 350', () => {
    expect(amountToMinor(3.5, 'EGP')).toBe(350);
  });
  it('KWD uses 1000 minor units', () => {
    expect(amountToMinor(5, 'KWD')).toBe(5000);
  });
  it('round-trips', () => {
    expect(minorToAmount(amountToMinor(123.45, 'EGP'), 'EGP')).toBeCloseTo(123.45, 2);
  });
});

describe('toEgpMinor', () => {
  it('EGP passes through', () => {
    expect(toEgpMinor(20000, 'EGP', null)).toBe(20000);
  });
  it('USD converts via fx snapshot', () => {
    // 12.40 USD at 48 EGP/USD → 595.20 EGP → 59520 piastres
    expect(toEgpMinor(1240, 'USD', 48)).toBe(59520);
  });
  it('missing fx returns 0 (cannot normalize)', () => {
    expect(toEgpMinor(1240, 'USD', null)).toBe(0);
  });
});

describe('formatAmount', () => {
  it('groups thousands with symbol', () => {
    expect(formatAmount(12480, 'ج.م')).toBe('12,480 ج.م');
  });
  it('keeps two decimals for fractions', () => {
    expect(formatAmount(12.4, 'ج.م')).toBe('12.40 ج.م');
  });
});

describe('CURRENCY_WORD_MAP', () => {
  it('maps جنيه to EGP', () => {
    expect(CURRENCY_WORD_MAP['جنيه']).toBe('EGP');
  });
  it('maps دولار to USD', () => {
    expect(CURRENCY_WORD_MAP['دولار']).toBe('USD');
  });
});
