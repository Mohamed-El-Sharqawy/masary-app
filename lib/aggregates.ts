/**
 * Local SQLite aggregation layer for the Masary dashboard (technical-plan
 * §5 aggregates / §8 M4). All sums are EGP-normalized integer minor units
 * (piastres): monthly summary by category (+ FX snapshot info), daily totals
 * on the Cairo calendar, top merchants/persons. SQL is fully parameterized;
 * year/month (numbers) are bound as ISO month bounds, never interpolated.
 * The optional `db` param lets tests inject a mock getAllAsync (expo-sqlite
 * cannot load in node) — production callers omit it (getDb() default).
 * Used by: services/queries.ts (dashboard hooks), tests/aggregates.test.ts.
 */
import { getDb } from '@/lib/db';
import { minorFactor } from '@/utils/currency';
import type { Category } from '@/types';

/** Minimal read interface the aggregate fns need (SQLiteDatabase satisfies it). */
export interface AggregateDb {
  getAllAsync(sql: string, params?: unknown[]): Promise<unknown[]>;
}

/** One category slice of a monthly summary (pct = rounded share of total). */
export interface CategorySlice {
  category: Category;
  total_minor: number;
  pct: number;
}

/** FX snapshot info for the period's non-EGP transactions. */
export interface NonEgpInfo {
  currencies: string[];
  weighted_rate: number | null;
  total_minor: number;
}

/** monthlySummary() result — everything in EGP minor units. */
export interface MonthlySummary {
  total_minor: number;
  by_category: CategorySlice[];
  currency: 'EGP';
  non_egp: NonEgpInfo | null;
}

/** One day-of-month total (Cairo calendar). */
export interface DailyTotal {
  day: number;
  total_minor: number;
}

/** One top merchant/person aggregate. */
export interface TopMerchant {
  name: string;
  total_minor: number;
  count: number;
}

/** Cairo is UTC+3 year-round (mirrors utils/dates APP_TZ). */
const CAIRO_OFFSET_MS = 3 * 3600_000;

/**
 * SQL expression: EGP minor units of a row. Mirrors utils/currency
 * toEgpMinor (same minor-factor table, same rounding) so SQL and JS agree.
 */
const EGP_MINOR_SQL = `CASE
  WHEN currency = 'EGP' THEN amount_minor
  WHEN fx_rate_to_egp IS NULL THEN 0
  ELSE CAST(ROUND((amount_minor * 1.0 /
    CASE WHEN currency IN ('BHD','IQD','JOD','KWD','LYD','OMR','TND') THEN 1000 ELSE 100 END
  ) * fx_rate_to_egp * 100) AS INTEGER)
END`;

/** Half-open Cairo-calendar month bounds [start, end) as ISO strings. */
function monthBounds(year: number, month: number): [string, string] {
  const start = new Date(Date.UTC(year, month - 1, 1) - CAIRO_OFFSET_MS);
  const end = new Date(Date.UTC(year, month, 1) - CAIRO_OFFSET_MS);
  return [start.toISOString(), end.toISOString()];
}

/** Default to the app database unless a test injects a fake. */
async function resolveDb(db?: AggregateDb): Promise<AggregateDb> {
  return db ?? ((await getDb()) as AggregateDb);
}

function asRows(rows: unknown[]): Record<string, unknown>[] {
  return rows as Record<string, unknown>[];
}

/**
 * Month total + per-category EGP-normalized breakdown, plus the FX snapshot
 * line data (currencies present and the value-weighted fx_rate_to_egp used).
 */
export async function monthlySummary(
  year: number,
  month: number,
  db?: AggregateDb,
): Promise<MonthlySummary> {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('month must be an integer 1-12');
  }
  const d = await resolveDb(db);
  const [start, end] = monthBounds(year, month);
  const rows = asRows(
    await d.getAllAsync(
      `SELECT category, SUM(${EGP_MINOR_SQL}) AS total_minor
       FROM transactions
       WHERE julianday(spent_at) >= julianday(?) AND julianday(spent_at) < julianday(?)
       GROUP BY category
       ORDER BY total_minor DESC`,
      [start, end],
    ),
  );
  const sums = rows
    .map((r) => ({
      category: String(r.category) as Category,
      total_minor: Number(r.total_minor ?? 0),
    }))
    .filter((c) => c.total_minor !== 0);
  const total_minor = sums.reduce((acc, c) => acc + c.total_minor, 0);
  const by_category: CategorySlice[] = sums.map((c) => ({
    ...c,
    pct: total_minor > 0 ? Math.round((c.total_minor / total_minor) * 100) : 0,
  }));

  const fxRows = asRows(
    await d.getAllAsync(
      `SELECT currency, fx_rate_to_egp, amount_minor, ${EGP_MINOR_SQL} AS egp_minor
       FROM transactions
       WHERE julianday(spent_at) >= julianday(?) AND julianday(spent_at) < julianday(?)
         AND currency <> 'EGP'`,
      [start, end],
    ),
  );
  let non_egp: NonEgpInfo | null = null;
  if (fxRows.length > 0) {
    const currencies = [...new Set(fxRows.map((r) => String(r.currency)))].sort();
    const totalEgp = fxRows.reduce((acc, r) => acc + Number(r.egp_minor ?? 0), 0);
    let sourceMajor = 0;
    let rateWeightedMajor = 0;
    for (const r of fxRows) {
      const rate = r.fx_rate_to_egp == null ? null : Number(r.fx_rate_to_egp);
      const major = Number(r.amount_minor ?? 0) / minorFactor(String(r.currency));
      if (rate != null) {
        sourceMajor += major;
        rateWeightedMajor += major * rate;
      }
    }
    const weighted_rate =
      sourceMajor > 0 && rateWeightedMajor > 0
        ? Math.round((rateWeightedMajor / sourceMajor) * 10000) / 10000
        : null;
    non_egp = { currencies, weighted_rate, total_minor: totalEgp };
  }

  return { total_minor, by_category, currency: 'EGP', non_egp };
}

/**
 * Per-day EGP-normalized totals for the month, one entry per calendar day
 * (Cairo clock) — zero-filled so charts render 28-31 bars.
 */
export async function dailyTotals(
  year: number,
  month: number,
  db?: AggregateDb,
): Promise<DailyTotal[]> {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('month must be an integer 1-12');
  }
  const d = await resolveDb(db);
  const [start, end] = monthBounds(year, month);
  const rows = asRows(
    await d.getAllAsync(
      `SELECT CAST(strftime('%d', spent_at, '+3 hours') AS INTEGER) AS day,
              SUM(${EGP_MINOR_SQL}) AS total_minor
       FROM transactions
       WHERE julianday(spent_at) >= julianday(?) AND julianday(spent_at) < julianday(?)
       GROUP BY day
       ORDER BY day ASC`,
      [start, end],
    ),
  );
  const map = new Map<number, number>(
    rows.map((r) => [Number(r.day), Number(r.total_minor ?? 0)]),
  );
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from({ length: daysInMonth }, (_, i) => ({
    day: i + 1,
    total_minor: map.get(i + 1) ?? 0,
  }));
}

/**
 * Top n merchants (falling back to person names) by EGP-normalized total
 * for the month.
 */
export async function topMerchants(
  year: number,
  month: number,
  n = 5,
  db?: AggregateDb,
): Promise<TopMerchant[]> {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('month must be an integer 1-12');
  }
  const d = await resolveDb(db);
  const [start, end] = monthBounds(year, month);
  const rows = asRows(
    await d.getAllAsync(
      `SELECT COALESCE(NULLIF(merchant, ''), NULLIF(person, '')) AS name,
              SUM(${EGP_MINOR_SQL}) AS total_minor,
              COUNT(*) AS count
       FROM transactions
       WHERE julianday(spent_at) >= julianday(?) AND julianday(spent_at) < julianday(?)
         AND COALESCE(NULLIF(merchant, ''), NULLIF(person, '')) IS NOT NULL
       GROUP BY name
       ORDER BY total_minor DESC
       LIMIT ?`,
      [start, end, n],
    ),
  );
  return rows.map((r) => ({
    name: String(r.name),
    total_minor: Number(r.total_minor ?? 0),
    count: Number(r.count ?? 0),
  }));
}
