/**
 * Numeral normalization utilities (pure).
 * Deterministic Eastern→Western digit + decimal-separator mapping, per
 * technical-plan §4: ٠١٢٣٤٥٦٧٨٩→0-9, U+066B (٫)→".", U+066C (٬)→","
 * also handles Persian variants and Arabic comma (،) as text separator.
 * Used by: lib/ai normalizer (post-extraction), amount input fields, tests.
 */

const EASTERN_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/**
 * Normalize any Arabic/Persian numerals in a string to Western ASCII.
 * Deterministic character mapping only — no guessing.
 */
export function normalizeNumerals(input: string): string {
  let out = '';
  for (const ch of input) {
    const eastern = EASTERN_DIGITS.indexOf(ch);
    if (eastern >= 0) {
      out += String(eastern);
      continue;
    }
    const persian = PERSIAN_DIGITS.indexOf(ch);
    if (persian >= 0) {
      out += String(persian);
      continue;
    }
    if (ch === '\u066B') {
      out += '.'; // arabic decimal separator
      continue;
    }
    if (ch === '\u066C') {
      out += ','; // arabic thousands separator
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * Parse an amount string in any numeral system into a float.
 * Accepts "3.50", "٣٫٥٠", "3,50", "1,234.50", "١٢٣٤".
 * Returns NaN when unparseable.
 */
export function parseAmount(input: string): number {
  const s = normalizeNumerals(input).replace(/[\u066B\u066C]/g, (c) => (c === '\u066B' ? '.' : ',')).trim();
  // strip thousands separators (comma followed by exactly 3 digits)
  const cleaned = s.replace(/,(\d{3})\b/g, '$1');
  const m = cleaned.match(/-?\d+(?:\.\d+)?/);
  if (!m) return NaN;
  return parseFloat(m[0]);
}

/**
 * Convert a decimal amount to integer minor units (piastres/cents).
 * Rounding: half-up on the string to avoid float drift (0.1+0.2 problem).
 */
export function toMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}

/** Convert integer minor units back to a display decimal number. */
export function fromMinorUnits(minor: number): number {
  return minor / 100;
}

/**
 * Convert Western digits in a string to Eastern Arabic display form.
 * Used when the user picks ٠-٩ numerals in Settings.
 */
export function toEasternDigits(input: string): string {
  return input.replace(/[0-9]/g, (d) => EASTERN_DIGITS[Number(d)]);
}

/**
 * Format an integer minor-unit amount for display with the user's numeral
 * system preference. Returns e.g. "20" / "٣٥٠٫٥٠".
 */
export function formatMinor(
  minor: number,
  system: 'western' | 'eastern',
  fractionDigits = 0,
): string {
  const value = (minor / 100).toFixed(fractionDigits);
  return system === 'eastern' ? toEasternDigits(value.replace('.', '\u066B')) : value;
}
