/**
 * Tests for the M4 aggregation layer (lib/aggregates.ts).
 * expo-sqlite cannot load in a node vitest env, so the expo modules behind
 * lib/db are mocked and each aggregate fn receives a fake in-memory db
 * implementing getAllAsync (the injected-`db` param). The fake interprets
 * the exact query shapes lib/aggregates issues and mirrors their SQL
 * semantics in JS: Cairo month bounds via julianday-style instant compare,
 * strftime('%d', …, '+3 hours') day bucketing, and utils/currency toEgpMinor
 * for the EGP normalization — so the tests pin the JS post-processing
 * (sorting, pct, zero-fill, weighted FX rate, parameterization).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: vi.fn(async () => {
    throw new Error('expo-sqlite is unavailable in node tests');
  }),
}));
vi.mock('expo-crypto', () => ({ randomUUID: () => 'mock-uuid' }));

import { dailyTotals, monthlySummary, topMerchants } from '../lib/aggregates';
import { toEgpMinor } from '../utils/currency';

interface FakeRow {
  amount_minor: number;
  currency: string;
  fx_rate_to_egp: number | null;
  category: string;
  merchant: string | null;
  person: string | null;
  spent_at: string;
}

const CAIRO_OFFSET_MS = 3 * 3600_000;

/** In-memory stand-in for the SQLite read surface the aggregates use. */
class FakeDb {
  rows: FakeRow[] = [];
  calls: { sql: string; params: unknown[] }[] = [];

  async getAllAsync(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
    this.calls.push({ sql, params });
    const inBounds = (p: unknown[]) => {
      const start = new Date(p[0] as string).getTime();
      const end = new Date(p[1] as string).getTime();
      return this.rows.filter((r) => {
        const t = new Date(r.spent_at).getTime();
        return t >= start && t < end;
      });
    };
    const egp = (r: FakeRow) => toEgpMinor(r.amount_minor, r.currency, r.fx_rate_to_egp);
    if (sql.includes("currency <> 'EGP'")) {
      return inBounds(params)
        .filter((r) => r.currency !== 'EGP')
        .map((r) => ({
          currency: r.currency,
          fx_rate_to_egp: r.fx_rate_to_egp,
          amount_minor: r.amount_minor,
          egp_minor: egp(r),
        }));
    }
    if (sql.includes('GROUP BY category')) {
      const map = new Map<string, number>();
      for (const r of inBounds(params)) map.set(r.category, (map.get(r.category) ?? 0) + egp(r));
      return [...map.entries()]
        .map(([category, total_minor]) => ({ category, total_minor }))
        .sort((a, b) => b.total_minor - a.total_minor);
    }
    if (sql.includes("strftime('%d'")) {
      const map = new Map<number, number>();
      for (const r of inBounds(params)) {
        const day = new Date(new Date(r.spent_at).getTime() + CAIRO_OFFSET_MS).getUTCDate();
        map.set(day, (map.get(day) ?? 0) + egp(r));
      }
      return [...map.entries()]
        .map(([day, total_minor]) => ({ day, total_minor }))
        .sort((a, b) => a.day - b.day);
    }
    if (sql.includes('GROUP BY name')) {
      const map = new Map<string, { name: string; total_minor: number; count: number }>();
      for (const r of inBounds(params)) {
        const name =
          r.merchant && r.merchant !== '' ? r.merchant : r.person && r.person !== '' ? r.person : null;
        if (!name) continue;
        const prev = map.get(name);
        if (prev) {
          prev.total_minor += egp(r);
          prev.count += 1;
        } else {
          map.set(name, { name, total_minor: egp(r), count: 1 });
        }
      }
      const n = params[2] as number;
      return [...map.values()].sort((a, b) => b.total_minor - a.total_minor).slice(0, n);
    }
    throw new Error(`FakeDb: unexpected SQL\n${sql}`);
  }
}

/** Row factory with sane August-2026 defaults. */
function row(overrides: Partial<FakeRow> = {}): FakeRow {
  return {
    amount_minor: 0,
    currency: 'EGP',
    fx_rate_to_egp: null,
    category: 'other',
    merchant: null,
    person: null,
    spent_at: '2026-08-10T10:00:00+03:00',
    ...overrides,
  };
}

describe('monthlySummary', () => {
  it('sums EGP-only months by category, sorted desc, with rounded pct', async () => {
    const db = new FakeDb();
    db.rows = [
      row({ amount_minor: 10000, category: 'food', spent_at: '2026-08-03T12:00:00+03:00' }),
      row({ amount_minor: 5000, category: 'transport', spent_at: '2026-08-12T09:30:00+03:00' }),
      row({ amount_minor: 2000, category: 'coffee', spent_at: '2026-08-20T18:00:00+03:00' }),
      row({ amount_minor: 99000, category: 'food', spent_at: '2026-09-01T10:00:00+03:00' }),
    ];
    const s = await monthlySummary(2026, 8, db);
    expect(s.total_minor).toBe(17000);
    expect(s.currency).toBe('EGP');
    expect(s.by_category.map((c) => c.category)).toEqual(['food', 'transport', 'coffee']);
    expect(s.by_category.map((c) => c.total_minor)).toEqual([10000, 5000, 2000]);
    expect(s.by_category.map((c) => c.pct)).toEqual([59, 29, 12]);
    expect(s.non_egp).toBeNull();
  });

  it('month bounds are half-open on the Cairo calendar', async () => {
    const db = new FakeDb();
    db.rows = [
      row({ amount_minor: 1000, spent_at: '2026-08-01T00:00:00+03:00' }),
      row({ amount_minor: 2000, spent_at: '2026-07-31T21:00:00Z' }),
      row({ amount_minor: 4000, spent_at: '2026-09-01T00:00:00+03:00' }),
    ];
    const s = await monthlySummary(2026, 8, db);
    expect(s.total_minor).toBe(3000);
  });

  it('normalizes non-EGP through the fx snapshot at capture', async () => {
    const db = new FakeDb();
    db.rows = [
      row({ amount_minor: 1240, currency: 'USD', fx_rate_to_egp: 48 }),
      row({ amount_minor: 10000, category: 'food' }),
    ];
    const s = await monthlySummary(2026, 8, db);
    expect(s.total_minor).toBe(69520);
    expect(s.non_egp).not.toBeNull();
    expect(s.non_egp?.currencies).toEqual(['USD']);
    expect(s.non_egp?.total_minor).toBe(59520);
    expect(s.non_egp?.weighted_rate).toBe(48);
  });

  it('weighted_rate is the value-weighted mean across snapshots', async () => {
    const db = new FakeDb();
    db.rows = [
      row({ amount_minor: 10000, currency: 'USD', fx_rate_to_egp: 47 }),
      row({ amount_minor: 10000, currency: 'USD', fx_rate_to_egp: 49 }),
    ];
    const s = await monthlySummary(2026, 8, db);
    expect(s.total_minor).toBe(960000);
    expect(s.non_egp?.weighted_rate).toBe(48);
  });

  it('KWD amounts use the 1000 minor factor; missing fx contributes zero', async () => {
    const db = new FakeDb();
    db.rows = [
      row({ amount_minor: 5000, currency: 'KWD', fx_rate_to_egp: 1570, category: 'travel' }),
      row({ amount_minor: 2500, currency: 'USD', fx_rate_to_egp: null }),
      row({ amount_minor: 3000, category: 'food' }),
    ];
    const s = await monthlySummary(2026, 8, db);
    expect(s.total_minor).toBe(5 * 1570 * 100 + 3000);
    expect(s.non_egp?.currencies).toEqual(['KWD', 'USD']);
    expect(s.non_egp?.total_minor).toBe(5 * 1570 * 100);
    expect(s.non_egp?.weighted_rate).toBe(1570);
  });

  it('all rates missing → non_egp present but weighted_rate null', async () => {
    const db = new FakeDb();
    db.rows = [row({ amount_minor: 2500, currency: 'USD', fx_rate_to_egp: null })];
    const s = await monthlySummary(2026, 8, db);
    expect(s.total_minor).toBe(0);
    expect(s.by_category).toEqual([]);
    expect(s.non_egp).toEqual({ currencies: ['USD'], weighted_rate: null, total_minor: 0 });
  });

  it('empty month → zeros and no non_egp', async () => {
    const db = new FakeDb();
    db.rows = [row({ amount_minor: 1000, spent_at: '2026-07-04T10:00:00+03:00' })];
    const s = await monthlySummary(2026, 8, db);
    expect(s.total_minor).toBe(0);
    expect(s.by_category).toEqual([]);
    expect(s.non_egp).toBeNull();
  });

  it('rejects an invalid month', async () => {
    const db = new FakeDb();
    await expect(monthlySummary(2026, 13, db)).rejects.toThrow('month');
    await expect(dailyTotals(2026, 0, db)).rejects.toThrow('month');
  });
});

describe('dailyTotals', () => {
  it('zero-fills every calendar day (31 for August, 28 for Feb 2026)', async () => {
    const db = new FakeDb();
    db.rows = [row({ amount_minor: 1500, spent_at: '2026-08-05T10:00:00+03:00' })];
    const aug = await dailyTotals(2026, 8, db);
    expect(aug).toHaveLength(31);
    expect(aug[4]).toEqual({ day: 5, total_minor: 1500 });
    expect(aug.filter((d) => d.total_minor === 0)).toHaveLength(30);
    const feb = await dailyTotals(2026, 2, db);
    expect(feb).toHaveLength(28);
  });

  it('buckets by Cairo calendar day (UTC+3 rollover)', async () => {
    const db = new FakeDb();
    db.rows = [
      row({ amount_minor: 1000, spent_at: '2026-08-15T23:30:00Z' }),
      row({ amount_minor: 2000, spent_at: '2026-07-31T21:30:00Z' }),
    ];
    const d = await dailyTotals(2026, 8, db);
    expect(d.find((x) => x.day === 16)?.total_minor).toBe(1000);
    expect(d.find((x) => x.day === 1)?.total_minor).toBe(2000);
  });

  it('sums same-day rows in EGP minor units', async () => {
    const db = new FakeDb();
    db.rows = [
      row({ amount_minor: 1000, category: 'food', spent_at: '2026-08-02T08:00:00+03:00' }),
      row({ amount_minor: 620, currency: 'USD', fx_rate_to_egp: 50, spent_at: '2026-08-02T20:00:00+03:00' }),
    ];
    const d = await dailyTotals(2026, 8, db);
    expect(d.find((x) => x.day === 2)?.total_minor).toBe(1000 + 31000);
  });
});

describe('topMerchants', () => {
  it('groups by merchant, falls back to person, skips unnamed, limits n', async () => {
    const db = new FakeDb();
    db.rows = [
      row({ amount_minor: 3000, merchant: 'ستاربكس' }),
      row({ amount_minor: 2000, merchant: 'ستاربكس', spent_at: '2026-08-11T10:00:00+03:00' }),
      row({ amount_minor: 6000, person: 'أحمد' }),
      row({ amount_minor: 9999 }),
      row({ amount_minor: 10000, merchant: 'كارفور' }),
    ];
    const top3 = await topMerchants(2026, 8, 3, db);
    expect(top3).toEqual([
      { name: 'كارفور', total_minor: 10000, count: 1 },
      { name: 'أحمد', total_minor: 6000, count: 1 },
      { name: 'ستاربكس', total_minor: 5000, count: 2 },
    ]);
    const top2 = await topMerchants(2026, 8, 2, db);
    expect(top2.map((m) => m.name)).toEqual(['كارفور', 'أحمد']);
  });

  it('empty month → empty list', async () => {
    const db = new FakeDb();
    expect(await topMerchants(2026, 8, 5, db)).toEqual([]);
  });
});

describe('parameterization', () => {
  it('binds every input as a SQL parameter — no literal values in SQL', async () => {
    const db = new FakeDb();
    db.rows = [row({ amount_minor: 1000, merchant: 'كارفور' })];
    await monthlySummary(2026, 8, db);
    await dailyTotals(2026, 8, db);
    await topMerchants(2026, 8, 5, db);
    expect(db.calls.length).toBeGreaterThan(0);
    for (const { sql, params } of db.calls) {
      expect(sql).not.toContain('2026');
      expect(sql).not.toContain('كارفور');
      const placeholders = sql.match(/\?/g)?.length ?? 0;
      expect(placeholders).toBe(params.length);
      expect(placeholders).toBeGreaterThan(0);
    }
  });

  it('passes ISO month bounds derived from year/month', async () => {
    const db = new FakeDb();
    db.rows = [];
    await monthlySummary(2026, 8, db);
    const first = db.calls[0]?.params as string[];
    expect(first).toHaveLength(2);
    const start = new Date(first[0]);
    const end = new Date(first[1]);
    expect(start.toISOString()).toBe('2026-07-31T21:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-31T21:00:00.000Z');
  });
});
