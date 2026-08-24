/**
 * Local SQLite database layer for the Masary app.
 * Source of truth (technical-plan §2/§5): transactions, captures,
 * chat_messages tables mirroring the Supabase Postgres schema, plus the
 * outbox columns used by the idempotent push/pull sync.
 * Used by: services/queries.ts, services/mutations.ts, lib/sync.ts, app screens.
 */
import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';

let db: SQLite.SQLiteDatabase | null = null;

/** Open (and lazily migrate) the single app database. */
export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  db = await SQLite.openDatabaseAsync('masary.db');
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      amount_minor INTEGER NOT NULL,
      currency TEXT NOT NULL,
      fx_rate_to_egp REAL,
      merchant TEXT,
      person TEXT,
      category TEXT NOT NULL,
      spent_at TEXT NOT NULL,
      notes TEXT,
      source TEXT NOT NULL,
      raw_input TEXT,
      status TEXT NOT NULL DEFAULT 'confirmed',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      synced_at TEXT,
      dirty INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS captures (
      id TEXT PRIMARY KEY,
      audio_path TEXT,
      status TEXT NOT NULL,
      transcript TEXT,
      extracted_json TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      transactions_json TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS tx_user_spent_idx ON transactions (user_id, spent_at);
    CREATE INDEX IF NOT EXISTS tx_category_idx ON transactions (user_id, category);
    CREATE INDEX IF NOT EXISTS chat_created_idx ON chat_messages (created_at);
  `);
  return db;
}

/** Generate a UUID on device (expo-crypto) — upsert-safe primary keys. */
export function uuid(): string {
  return Crypto.randomUUID();
}
