/**
 * Full JSON backup export/import for the Masary app (technical-plan §5
 * "Backup & portability"). exportBackup() dumps every SQLite table to one
 * schema-versioned JSON file (masary-backup-YYYY-MM-DD.json) in the cache
 * dir and opens the OS share sheet; importBackup() restores with
 * INSERT OR REPLACE (upsert-safe uuids). Used by: settings screen
 * (النسخ الاحتياطي والاستيراد).
 */
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import type { SQLiteDatabase } from 'expo-sqlite';

const BACKUP_SCHEMA_VERSION = 1;

/** Backup envelope contract (schema-versioned). */
const backupSchema = z.object({
  schema_version: z.literal(BACKUP_SCHEMA_VERSION),
  exported_at: z.string().min(1),
  transactions: z.array(z.record(z.unknown())),
  captures: z.array(z.record(z.unknown())),
  chat_messages: z.array(z.record(z.unknown())),
});

export type BackupFile = z.infer<typeof backupSchema>;

/** Row counts per table (export + import results). */
export interface BackupCounts {
  transactions: number;
  captures: number;
  chat_messages: number;
}

/** Column order per table, mirroring lib/db.ts exactly. */
const TX_COLUMNS = [
  'id', 'user_id', 'amount_minor', 'currency', 'fx_rate_to_egp', 'merchant',
  'person', 'category', 'spent_at', 'notes', 'source', 'raw_input', 'status',
  'created_at', 'updated_at', 'synced_at', 'dirty',
] as const;
const CAPTURE_COLUMNS = ['id', 'audio_path', 'status', 'transcript', 'extracted_json', 'retry_count', 'created_at'] as const;
const CHAT_COLUMNS = ['id', 'role', 'content', 'transactions_json', 'created_at'] as const;

/** Defaults for keys a backup row may omit (back/forward compatibility). */
const TX_DEFAULTS: Record<string, string | number> = { status: 'confirmed', dirty: 1 };
const CAPTURE_DEFAULTS: Record<string, string | number> = { retry_count: 0 };

/** Dump all tables to JSON, write the file, share it. */
export async function exportBackup(): Promise<{ uri: string; counts: BackupCounts }> {
  const db = await getDb();
  const [transactions, captures, chat_messages] = await Promise.all([
    db.getAllAsync<Record<string, unknown>>('SELECT * FROM transactions'),
    db.getAllAsync<Record<string, unknown>>('SELECT * FROM captures'),
    db.getAllAsync<Record<string, unknown>>('SELECT * FROM chat_messages'),
  ]);
  const backup: BackupFile = {
    schema_version: BACKUP_SCHEMA_VERSION,
    exported_at: new Date().toISOString(),
    transactions,
    captures,
    chat_messages,
  };
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const uri = `${FileSystem.cacheDirectory}masary-backup-${date}.json`;
  await FileSystem.writeAsStringAsync(uri, JSON.stringify(backup), {
    encoding: FileSystem.EncodingType.UTF8,
  });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/json' });
  }
  return {
    uri,
    counts: { transactions: transactions.length, captures: captures.length, chat_messages: chat_messages.length },
  };
}

/** Restore a backup into SQLite (INSERT OR REPLACE — upsert-safe ids).
 *  Rows land dirty so the outbox re-syncs anything the server is missing. */
export async function importBackup(json: unknown): Promise<BackupCounts> {
  const parsed = backupSchema.parse(json);
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await upsertRows(db, 'transactions', TX_COLUMNS, parsed.transactions, TX_DEFAULTS);
    await upsertRows(db, 'captures', CAPTURE_COLUMNS, parsed.captures, CAPTURE_DEFAULTS);
    await upsertRows(db, 'chat_messages', CHAT_COLUMNS, parsed.chat_messages, {});
  });
  return {
    transactions: parsed.transactions.length,
    captures: parsed.captures.length,
    chat_messages: parsed.chat_messages.length,
  };
}

/** INSERT OR REPLACE a list of JSON rows into one table, column-ordered. */
async function upsertRows(
  db: SQLiteDatabase,
  table: string,
  columns: readonly string[],
  rows: Record<string, unknown>[],
  defaults: Record<string, string | number>,
): Promise<void> {
  const placeholders = columns.map(() => '?').join(', ');
  const sql = `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
  for (const row of rows) {
    const values = columns.map((c) => {
      const v = row[c];
      if (v == null) return defaults[c] ?? null;
      if (typeof v === 'number') return v;
      return String(v);
    });
    await db.runAsync(sql, values);
  }
}
