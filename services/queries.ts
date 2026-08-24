/**
 * TanStack Query hooks: reads for the Masary app.
 * Each query reads local SQLite first (source of truth) and optionally
 * refreshes from Supabase when signed in. Used by: chat, dashboard screens.
 */
import { useQuery } from '@tanstack/react-query';
import { getDb } from '@/lib/db';
import type { ChatMessage, Transaction } from '@/types';

/** Row → typed Transaction. */
function rowToTransaction(r: Record<string, unknown>): Transaction {
  return {
    id: String(r.id),
    user_id: (r.user_id as string | null) ?? null,
    amount_minor: Number(r.amount_minor),
    currency: String(r.currency),
    fx_rate_to_egp: r.fx_rate_to_egp == null ? null : Number(r.fx_rate_to_egp),
    merchant: (r.merchant as string | null) ?? null,
    person: (r.person as string | null) ?? null,
    category: r.category as Transaction['category'],
    spent_at: String(r.spent_at),
    notes: (r.notes as string | null) ?? null,
    source: r.source as Transaction['source'],
    raw_input: (r.raw_input as string | null) ?? '',
    status: r.status as Transaction['status'],
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
    synced_at: (r.synced_at as string | null) ?? null,
  };
}

/** Recent transactions (dashboard list). */
export function useTransactions(limit = 100) {
  return useQuery({
    queryKey: ['transactions', limit],
    queryFn: async (): Promise<Transaction[]> => {
      const db = await getDb();
      const rows = await db.getAllAsync(
        'SELECT * FROM transactions ORDER BY spent_at DESC LIMIT ?',
        [limit],
      );
      return rows.map(rowToTransaction);
    },
  });
}

/** Chat log (message list). */
export function useChatMessages(limit = 200) {
  return useQuery({
    queryKey: ['chat_messages', limit],
    queryFn: async (): Promise<ChatMessage[]> => {
      const db = await getDb();
      const rows = await db.getAllAsync(
        'SELECT * FROM chat_messages ORDER BY created_at ASC LIMIT ?',
        [limit],
      );
      return rows.map((r) => ({
        id: String(r.id),
        role: r.role as 'user' | 'assistant',
        content: String(r.content),
        transactions_json: (r.transactions_json as string | null) ?? null,
        created_at: String(r.created_at),
      }));
    },
  });
}
