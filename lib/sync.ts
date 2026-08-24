/**
 * Outbox sync engine for the Masary app (technical-plan §5).
 * SQLite is the source of truth: local writes mark rows dirty=1; syncNow()
 * pushes dirty rows to Supabase as idempotent upserts (onConflict 'id') in
 * batches of 50, then pulls server changes since last_pull with
 * last-write-wins by updated_at (local dirty edits are kept unless the
 * server copy is newer). Guests are a strict no-op — zero cloud writes.
 * startAutoSync() wires one launch sync + an AppState (foreground) listener.
 * Used by: app root wiring on launch, settings screen, backup import flow.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getDb } from '@/lib/db';
import { getSupabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-store';

const LAST_PULL_KEY = 'masary-last-pull';
const PUSH_BATCH = 50;
const PULL_PAGE = 200;

/** Result of one syncNow() run. */
export interface SyncResult {
  pushed: number;
  pulled: number;
}

/** Postgres transactions row (mirrors lib/db.ts minus the dirty column). */
interface RemoteTransaction {
  id: string;
  user_id: string | null;
  amount_minor: number;
  currency: string;
  fx_rate_to_egp: number | null;
  merchant: string | null;
  person: string | null;
  category: string;
  spent_at: string;
  notes: string | null;
  source: string;
  raw_input: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  synced_at: string | null;
}

let syncing = false;
let autoSyncStarted = false;

/** Push dirty rows, then pull server changes. Strict no-op for guests. */
export async function syncNow(): Promise<SyncResult> {
  if (useAuth.getState().mode !== 'signed_in') return { pushed: 0, pulled: 0 };
  const {
    data: { session },
  } = await getSupabase().auth.getSession();
  const uid = session?.user.id;
  if (!uid) return { pushed: 0, pulled: 0 };
  if (syncing) return { pushed: 0, pulled: 0 };

  syncing = true;
  try {
    const db = await getDb();
    const pushed = await pushDirty(db, uid);
    const pulled = await pullSince(db, uid);
    return { pushed, pulled };
  } finally {
    syncing = false;
  }
}

/** Push every dirty row in batches of 50, marking synced_at + dirty=0 per batch. */
async function pushDirty(db: SQLiteDatabase, uid: string): Promise<number> {
  const rows = await db.getAllAsync<Record<string, unknown>>('SELECT * FROM transactions WHERE dirty = 1');
  let pushed = 0;
  for (let i = 0; i < rows.length; i += PUSH_BATCH) {
    const batch = rows.slice(i, i + PUSH_BATCH);
    const syncedAt = new Date().toISOString();
    const payload: RemoteTransaction[] = batch.map((r) => ({
      id: String(r.id),
      user_id: uid,
      amount_minor: Number(r.amount_minor),
      currency: String(r.currency),
      fx_rate_to_egp: r.fx_rate_to_egp == null ? null : Number(r.fx_rate_to_egp),
      merchant: (r.merchant as string | null) ?? null,
      person: (r.person as string | null) ?? null,
      category: String(r.category),
      spent_at: String(r.spent_at),
      notes: (r.notes as string | null) ?? null,
      source: String(r.source),
      raw_input: (r.raw_input as string | null) ?? null,
      status: String(r.status),
      created_at: String(r.created_at),
      updated_at: String(r.updated_at),
      synced_at: syncedAt,
    }));
    const { error } = await getSupabase().from('transactions').upsert(payload, { onConflict: 'id' });
    if (error) throw new Error(error.message);
    const ids = batch.map((r) => String(r.id));
    const placeholders = ids.map(() => '?').join(', ');
    await db.runAsync(
      `UPDATE transactions SET user_id = ?, synced_at = ?, dirty = 0 WHERE id IN (${placeholders})`,
      [uid, syncedAt, ...ids],
    );
    pushed += ids.length;
  }
  return pushed;
}

/** Pull server rows updated since last_pull (everything on first sync). */
async function pullSince(db: SQLiteDatabase, uid: string): Promise<number> {
  const lastPull = await AsyncStorage.getItem(LAST_PULL_KEY);
  const pullStartedAt = new Date().toISOString();
  let pulled = 0;
  for (;;) {
    let query = getSupabase()
      .from('transactions')
      .select('*')
      .eq('user_id', uid)
      .order('updated_at', { ascending: true })
      .range(pulled, pulled + PULL_PAGE - 1);
    if (lastPull) query = query.gt('updated_at', lastPull);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as RemoteTransaction[];
    for (const row of rows) await applyServerRow(db, row);
    pulled += rows.length;
    if (rows.length < PULL_PAGE) break;
  }
  await AsyncStorage.setItem(LAST_PULL_KEY, pullStartedAt);
  return pulled;
}

/** Upsert one server row locally: INSERT OR REPLACE, but a local dirty=1
 *  edit wins unless the server updated_at is strictly newer. */
async function applyServerRow(db: SQLiteDatabase, srv: RemoteTransaction): Promise<void> {
  const local = await db.getFirstAsync<{ updated_at: string; dirty: number }>(
    'SELECT updated_at, dirty FROM transactions WHERE id = ?',
    [srv.id],
  );
  if (local && local.dirty === 1 && new Date(srv.updated_at).getTime() <= new Date(local.updated_at).getTime()) {
    return;
  }
  await db.runAsync(
    `INSERT OR REPLACE INTO transactions
       (id, user_id, amount_minor, currency, fx_rate_to_egp, merchant, person, category,
        spent_at, notes, source, raw_input, status, created_at, updated_at, synced_at, dirty)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      srv.id, srv.user_id, srv.amount_minor, srv.currency, srv.fx_rate_to_egp,
      srv.merchant, srv.person, srv.category, srv.spent_at, srv.notes, srv.source,
      srv.raw_input, srv.status, srv.created_at, srv.updated_at, srv.synced_at,
    ],
  );
}

/** Wire auto-sync: run once on launch and whenever the app returns to the
 *  foreground. Returns a teardown function; safe to call twice. */
export function startAutoSync(): () => void {
  if (autoSyncStarted) return () => undefined;
  autoSyncStarted = true;
  void syncNow().catch(() => undefined);
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') void syncNow().catch(() => undefined);
  });
  return () => {
    autoSyncStarted = false;
    subscription.remove();
  };
}
