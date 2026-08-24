/**
 * Chat orchestration hook (M2 text pipeline, track A).
 * Flow: optimistic user message → Edge /capture (captureText) → Zod parse
 * (ExtractionResultSchema, 1 repair retry → needs_review) → local Transaction
 * inserts + assistant summary message with transactions_json confirm cards.
 * Errors keep the user message and surface a retry. Used by: app/(tabs)/index.tsx.
 */
import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { captureText } from '@/services/api';
import { useAppendChatMessage, useInsertTransaction } from '@/services/mutations';
import { useChatMessages } from '@/services/queries';
import { ExtractionResultSchema } from '@/lib/ai/schema';
import type { ZodExtractionResult } from '@/lib/ai/schema';
import { getDb } from '@/lib/db';
import { amountToMinor } from '@/utils/currency';
import { formatMinor } from '@/utils/numerals';
import { CATEGORY_AR, CURRENCY_AR, APP } from '@/constants';
import { t, usePrefs } from '@/lib/i18n';
import type { ExtractedExpense, Transaction } from '@/types';

/** Cap on the raw invalid payload echoed back into the repair request. */
const REPAIR_ECHO_LIMIT = 500;

/**
 * Run one /capture round-trip and parse it against the extraction contract.
 * On schema failure, retries once with the invalid JSON + error appended;
 * a repaired pass yields needs_review status, a second failure throws.
 */
async function captureAndParse(text: string): Promise<{
  parsed: ZodExtractionResult;
  repaired: boolean;
}> {
  const first = await captureText(text, null);
  const firstParse = ExtractionResultSchema.safeParse(first);
  if (firstParse.success) return { parsed: firstParse.data, repaired: false };

  const repairText =
    `${text}\n\n[ردّك السابق لم يكن JSON صالحًا وفق المخطط. ` +
    `الردّ السابق: ${JSON.stringify(first).slice(0, REPAIR_ECHO_LIMIT)} ` +
    `الخطأ: ${firstParse.error.message.slice(0, 300)}. ` +
    `أعد الإرسال بصيغة JSON صحيحة فقط.]`;
  const second = await captureText(repairText, null);
  const secondParse = ExtractionResultSchema.safeParse(second);
  if (secondParse.success) return { parsed: secondParse.data, repaired: true };
  throw new Error('extraction_schema_failed');
}

/** Build the local Transaction payload for one extracted expense. */
function toTransactionInput(expense: ExtractedExpense, rawInput: string, status: Transaction['status']) {
  const currency = expense.currency.toUpperCase() || APP.defaultCurrency;
  return {
    user_id: null,
    amount_minor: amountToMinor(expense.amount, currency),
    currency,
    fx_rate_to_egp: null, // no FX source yet — snapshotted when one lands
    merchant: expense.merchant,
    person: expense.person,
    category: expense.category,
    spent_at: expense.spent_at,
    notes: expense.notes,
    source: 'chat_text' as const,
    raw_input: rawInput,
    status,
  };
}

/** One-line Arabic summary for the assistant bubble above the cards. */
function summaryLine(tx: Transaction, numerals: 'western' | 'eastern'): string {
  const digits = tx.amount_minor % 100 === 0 ? 0 : 2;
  return `${CATEGORY_AR[tx.category]} — ${formatMinor(tx.amount_minor, numerals, digits)} ${
    CURRENCY_AR[tx.currency] ?? tx.currency
  }`;
}

/** Live chat state + actions for the chat screen. */
export function useChat() {
  const qc = useQueryClient();
  const messagesQuery = useChatMessages();
  const appendMessage = useAppendChatMessage();
  const insertTransaction = useInsertTransaction();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastTextRef = useRef<string | null>(null);

  /** Extract, insert transactions, append the assistant message. */
  async function runPipeline(text: string) {
    setError(null);
    setSaving(true);
    try {
      const { parsed, repaired } = await captureAndParse(text);
      const status: Transaction['status'] = repaired ? 'needs_review' : 'confirmed';
      const numerals = usePrefs.getState().numerals;
      const now = new Date().toISOString();
      const saved: Transaction[] = [];

      for (const expense of parsed.expenses) {
        const id = await insertTransaction.mutateAsync(
          toTransactionInput(expense, text, status),
        );
        saved.push({
          ...toTransactionInput(expense, text, status),
          id,
          created_at: now,
          updated_at: now,
          synced_at: null,
        });
      }

      let content: string;
      if (saved.length > 0) {
        content = saved.map((tx) => summaryLine(tx, numerals)).join('\n');
        if (parsed.clarification_needed) content += `\n${parsed.clarification_needed}`;
      } else if (parsed.clarification_needed) {
        content = parsed.clarification_needed;
      } else if (parsed.unparsed_text) {
        content = parsed.unparsed_text;
      } else {
        throw new Error('empty_extraction');
      }

      await appendMessage.mutateAsync({
        role: 'assistant',
        content,
        transactions_json: saved.length > 0 ? JSON.stringify(saved) : null,
      });
    } catch {
      setError(t('error_generic', usePrefs.getState().language));
    } finally {
      setSaving(false);
    }
  }

  /** Send a user message (or retry the last failed one without re-adding it). */
  async function send(text: string, isRetry = false) {
    const trimmed = text.trim();
    if (!trimmed || saving) return;
    lastTextRef.current = trimmed;
    if (!isRetry) {
      try {
        await appendMessage.mutateAsync({ role: 'user', content: trimmed });
      } catch {
        setError(t('error_generic', usePrefs.getState().language));
        return;
      }
    }
    await runPipeline(trimmed);
  }

  /** Re-run extraction for the last failed message (message stays in the log). */
  async function retry() {
    const text = lastTextRef.current;
    if (text) await send(text, true);
  }

  /** ConfirmCard hook: flip a needs_review row to confirmed (no-op otherwise). */
  async function confirmTransaction(tx: Transaction) {
    if (tx.status === 'confirmed') return;
    const db = await getDb();
    await db.runAsync(
      `UPDATE transactions SET status='confirmed', dirty=1, updated_at=? WHERE id=?`,
      [new Date().toISOString(), tx.id],
    );
    await qc.invalidateQueries({ queryKey: ['transactions'] });
  }

  return {
    messages: messagesQuery.data ?? [],
    isLoading: messagesQuery.isLoading,
    send,
    saving,
    error,
    retry,
    confirmTransaction,
  };
}
