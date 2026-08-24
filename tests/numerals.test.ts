/**
 * Tests for numeral normalization utilities (utils/numerals.ts).
 * Covers Eastern/Persian digit mapping, decimal separators, amount parsing,
 * minor-unit conversion — the deterministic math the app relies on.
 */
import { describe, expect, it } from 'vitest';
import {
  formatMinor,
  normalizeNumerals,
  parseAmount,
  toEasternDigits,
  toMinorUnits,
} from '../utils/numerals';

describe('normalizeNumerals', () => {
  it('converts Eastern Arabic digits to Western', () => {
    expect(normalizeNumerals('٣٥')).toBe('35');
  });
  it('converts Persian digits', () => {
    expect(normalizeNumerals('۳۵')).toBe('35');
  });
  it('converts the Arabic decimal separator U+066B', () => {
    expect(normalizeNumerals('٣٫٥٠')).toBe('3.50');
  });
  it('converts the Arabic thousands separator U+066C', () => {
    expect(normalizeNumerals('١٬٢٣٤')).toBe('1,234');
  });
  it('leaves plain ASCII untouched', () => {
    expect(normalizeNumerals('coffee 35')).toBe('coffee 35');
  });
});

describe('parseAmount', () => {
  it('parses western decimals', () => {
    expect(parseAmount('3.50')).toBe(3.5);
  });
  {
    const v = parseAmount('٣٫٥٠');
    it('parses eastern decimals', () => {
      expect(v).toBe(3.5);
    });
  }
  it('parses with currency words around', () => {
    expect(parseAmount('دفعت ٥٠ جنيه')).toBe(50);
  });
  it('returns NaN when no number', () => {
    expect(Number.isNaN(parseAmount('شريت قهوة'))).toBe(true);
  });
});

describe('toMinorUnits / formatMinor', () => {
  it('rounds half-up to piastres', () => {
    expect(toMinorUnits(3.505)).toBe(351);
  });
  it('formats western display', () => {
    expect(formatMinor(3450, 'western', 2)).toBe('34.50');
  });
  it('formats eastern display', () => {
    expect(formatMinor(3450, 'eastern', 2)).toBe('٣٤٫٥٠');
  });
});

describe('toEasternDigits', () => {
  it('maps every digit', () => {
    expect(toEasternDigits('0123456789')).toBe('٠١٢٣٤٥٦٧٨٩');
  });
});
