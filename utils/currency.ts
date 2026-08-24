/**
 * Currency utilities (pure).
 * Integer minor-unit math per technical-plan §2 (never floats for storage);
 * ISO-4217 codes; FX snapshot at capture, never restated.
 * Used by: chat confirm cards, dashboard totals, edit sheet, sync, tests.
 */

/** Currencies with non-100 minor units — EGP/USD/EUR etc. are all 100. */
const NON_DECIMAL: Record<string, number> = {
  BHD: 1000, IQD: 1000, JOD: 1000, KWD: 1000, LYD: 1000, OMR: 1000, TND: 1000,
};

/** Minor-unit factor for an ISO-4217 code (default 100). */
export function minorFactor(currency: string): number {
  return NON_DECIMAL[currency.toUpperCase()] ?? 100;
}

/** Convert a decimal amount into integer minor units for a currency. */
export function amountToMinor(amount: number, currency: string): number {
  const f = minorFactor(currency);
  return Math.round(amount * f);
}

/** Convert integer minor units back to a decimal display amount. */
export function minorToAmount(minor: number, currency: string): number {
  return minor / minorFactor(currency);
}

/**
 * EGP-normalized value of a transaction: minor units of its own currency
 * converted through the fx_rate_to_egp snapshot captured at entry.
 * Returns value in EGP minor units (piastres).
 */
export function toEgpMinor(minor: number, currency: string, fxRateToEgp: number | null): number {
  if (currency === 'EGP') return minor;
  if (fxRateToEgp == null) return 0; // unknown rate — cannot normalize
  const amount = minorToAmount(minor, currency);
  return Math.round(amount * fxRateToEgp * 100);
}

/**
 * Format an amount for display: "12,480 ج.م" style grouping, both numeral
 * systems. Pure — presentation components pass their own numeral formatter.
 */
export function formatAmount(amount: number, currencySymbol: string): string {
  const fixed = amount.toFixed(amount % 1 === 0 ? 0 : 2);
  const [int, frac] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac ? `${grouped}.${frac} ${currencySymbol}` : `${grouped} ${currencySymbol}`;
}

/** Arabic currency word map from technical-plan §4 (جنيه→EGP …). */
export const CURRENCY_WORD_MAP: Record<string, string> = {
  'جنيه': 'EGP', 'جنيهات': 'EGP', 'ج.': 'EGP', 'غم': 'EGP',
  'دولار': 'USD', 'دولارات': 'USD',
  'ريال': 'SAR', 'ريالات': 'SAR',
  'درهم': 'AED', 'دراهم': 'AED',
  'يورو': 'EUR',
  'جنيه إسترليني': 'GBP', 'إسترليني': 'GBP',
  'دينار': 'KWD',
};
