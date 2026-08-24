/**
 * TanStack Query mutations: writes for the Masary app.
 * Insert/update/delete transactions and chat messages in local SQLite (the
 * source of truth), mark dirty for the outbox sync. Used by: chat pipeline,
 * edit sheet, settings backup.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { getDb, uuid } from '@/lib/db';
import type { Transaction } from '@/types';

/** Invalidate everything transaction/chat related after a write. */
function invalidateAll(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['transactions'] });
  qc.invalidateQueries({ queryKey: ['chat_messages'] });
}

/** Create a transaction row from extracted-expense fields. */
export function useInsertTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tx: Omit<Transaction, 'id' | 'created_at' | 'updated_at' | 'synced_at'>) => {
      const db = await getDb();
      const id = uuid();
      const now = new Date().toISOString();
      await db.runAsync(
        `INSERT INTO transactions (id, user_id, amount_minor, currency, fx_rate_to_egp, merchant, person, category, spent_at, notes, source, raw_input, status, created_at, updated_at, dirty)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          id, tx.user_id, tx.amount_minor, tx.currency, tx.fx_rate_to_egp,
          tx.merchant, tx.person, tx.category, tx.spent_at, tx.notes,
          tx.source, tx.raw_input, tx.status, now, now,
        ],
      );
      return id;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

/** Update editable fields on a transaction (edit sheet). */
export function useUpdateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tx: Pick<Transaction, 'id' | 'amount_minor' | 'currency' | 'category' | 'spent_at' | 'merchant' | 'person' | 'notes'>) => {
      const db = await getDb();
      const now = new Date().toISOString();
      await db.runAsync(
        `UPDATE transactions SET amount_minor=?, currency=?, category=?, spent_at=?, merchant=?, person=?, notes=?, updated_at=?, dirty=1 WHERE id=?`,
        [tx.amount_minor, tx.currency, tx.category, tx.spent_at, tx.merchant, tx.person, tx.notes, now, tx.id],
      );
    },
    onSuccess: () => invalidateAll(qc),
  });
}

/** Delete a transaction (destructive — always labeled in UI). */
export function useDeleteTransaction() {
  const qc = useQueryClient();
  return useMutation({
    async mutationFn(id: string) {
      const db = await getDb();
      await db.runAsync('DELETE FROM transactions WHERE id=?', [id]);
    },
    onSuccess: () => invalidateAll(qc),
  });
}

/** Append a chat message (user or assistant). */
export function useAppendChatMessage() {
  const qc = useQueryClient();
  return useMutation({
    async mutationFn(m: { role: 'user' | 'assistant'; content: string; transactions_json?: string | null }) {
      const db = await getDb();
      const id = uuid();
      const now = new Date().toISOString();
      await db.runAsync(
        `INSERT INTO chat_messages (id, role, content, transactions_json, created_at) VALUES (?, ?, ?, ?, ?)`,
        [id, m.role, m.content, m.transactions_json ?? null, now],
      );
      return id;
    },
    onSuccess: () => invalidateAll(qc),
  });
}
