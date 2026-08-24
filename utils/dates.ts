/**
 * Date utilities (pure).
 * Africa/Cairo clock context + Egyptian relative-date resolution
 * (امبارح، من يومين، من تلت ايام، الجمعة اللي فاتت، الشهر اللي فات…) per
 * technical-plan §4. Used by: extraction normalizer, edit sheet quick dates,
 * dashboard period boundaries, tests.
 */

/** Timezone the app resolves relative dates against (locked: Africa/Cairo). */
export const APP_TZ = 'Africa/Cairo';

/** Cairo standard offset (UTC+3, no DST since 2023) in hours. */
const CAIRO_OFFSET_MS = 3 * 3600_000;

/** Current ISO timestamp with Cairo offset baked in. */
export function nowIso(): string {
  return new Date(Date.now() + CAIRO_OFFSET_MS).toISOString().replace('Z', '+03:00');
}

/** ISO string for a date N days before the reference moment. */
export function isoDaysAgo(days: number, ref = new Date()): string {
  return new Date(ref.getTime() - days * 86400_000).toISOString();
}

/** Cairo-calendar start-of-day (midnight) for the reference moment, as UTC ISO. */
export function startOfToday(ref = new Date()): string {
  return startOfDayCairo(ref);
}

/** Start-of-day N days back (week period etc.), Cairo calendar. */
export function startOfDaysAgo(days: number, ref = new Date()): string {
  return startOfDayCairo(new Date(ref.getTime() - days * 86400_000));
}

/** Cairo-calendar first day of the current month at midnight, as UTC ISO. */
export function startOfMonth(ref = new Date()): string {
  // Shift to Cairo wall clock, take the 1st at 00:00, shift back to UTC.
  const shifted = new Date(ref.getTime() + CAIRO_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth();
  return new Date(Date.UTC(y, m, 1) - CAIRO_OFFSET_MS).toISOString();
}

/** Cairo-calendar first day of the previous month at midnight. */
export function startOfPrevMonth(ref = new Date()): string {
  const shifted = new Date(ref.getTime() + CAIRO_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth();
  return new Date(Date.UTC(y, m - 1, 1) - CAIRO_OFFSET_MS).toISOString();
}

/** Cairo-calendar start-of-day helper (UTC math, no local-time calls). */
function startOfDayCairo(ref: Date): string {
  const shifted = new Date(ref.getTime() + CAIRO_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth();
  const d = shifted.getUTCDate();
  return new Date(Date.UTC(y, m, d) - CAIRO_OFFSET_MS).toISOString();
}

/** Day-of-month integer (1-31) on the Cairo calendar. */
export function dayOfMonth(iso: string): number {
  return new Date(iso).getUTCDate();
}

/** YYYY-MM key on the Cairo calendar, for SQL grouping. */
export function monthKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 7);
}

/**
 * Egyptian Arabic relative-date phrase table.
 * The extractor LLM is *instructed* with these; this deterministic resolver
 * is the post-pass of last resort for anything it leaves unresolved.
 */
export const RELATIVE_DATE_PHRASES: Record<string, number> = {
  'امبارح': 1, 'أمبارح': 1, 'الامبارح': 1, 'الأمبارح': 1, 'امبارح بالليل': 1,
  'من يومين': 2, 'قبل يومين': 2,
  'من تلت ايام': 3, 'من ثلاثة ايام': 3, 'قبل تلت ايام': 3,
  'من اربع ايام': 4, 'من خمس ايام': 5, 'من اسبوع': 7, 'من أسبوع': 7,
  'الجمعة اللي فاتت': -0, // resolved to previous Friday by weekday lookup
  'الشهر اللي فات': -30, 'الشهر الماضي': -30,
  'النهارده': 0, 'النهرده': 0, 'اليوم': 0, 'دلوقتي': 0,
};

/**
 * Resolve an Egyptian relative-date phrase to an ISO timestamp.
 * Returns null when the phrase is unknown — caller keeps the extractor's answer.
 */
export function resolveRelativePhrase(phrase: string, now = new Date()): string | null {
  const days = RELATIVE_DATE_PHRASES[phrase.trim()];
  if (days === undefined) return null;
  if (days === 0 && phrase.includes('الجمعة')) {
    // previous Friday on the Cairo calendar (12:00 Cairo time)
    const shifted = new Date(now.getTime() + CAIRO_OFFSET_MS);
    const diff = (shifted.getUTCDay() - 5 + 7) % 7 || 7;
    const d = new Date(shifted.getTime() - diff * 86400_000);
    d.setUTCHours(12, 0, 0, 0);
    return new Date(d.getTime() - CAIRO_OFFSET_MS).toISOString();
  }
  if (days === 0) return now.toISOString();
  if (days < 0) return isoDaysAgo(-days, now);
  return isoDaysAgo(days, now);
}
