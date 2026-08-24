/**
 * Voice queue drain + extraction→Transaction mapping (technical-plan §8 M3).
 * processQueue(): while online, drain pending captures from
 * lib/voice/queue.ts — upload via services/api.ts captureAudio (Groq STT +
 * extraction on the rate-limited guest-allowed /capture endpoint), validate
 * against the Zod contract (one repair retry → needs_review, mirroring
 * hooks/useChat.ts), map expenses to Transaction rows with the same rules
 * (amountToMinor, EGP default, source 'chat_voice', raw_input = transcript)
 * and append the chat messages (user 🎤 transcript bubble + assistant
 * summary; clarification_needed becomes the assistant's question).
 * ensureVoiceDrain() wires NetInfo (online) + AppState (active) triggers.
 * At-least-once semantics: a crash between insert and markDone may re-insert
 * on the next drain (documented trade-off; idempotency keys are M5).
 * Used by: hooks/useVoice.ts, app/capture.tsx.
 */
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import type { NetInfoState } from '@react-native-community/netinfo';
import { captureAudio, captureText } from '@/services/api';
import { appendChatMessage, insertTransaction } from '@/services/mutations';
import { ExtractionResultSchema } from '@/lib/ai/schema';
import { normalizeExtraction } from '@/lib/ai/extract';
import type { ZodExtractionResult } from '@/lib/ai/schema';
import { markDone, markFailed, takeBatch } from '@/lib/voice/queue';
import type { VoiceCapture } from '@/lib/voice/queue';
import { getSupabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-store';
import { usePrefs } from '@/lib/i18n';
import { amountToMinor } from '@/utils/currency';
import { formatMinor } from '@/utils/numerals';
import { APP, CATEGORY_AR, CURRENCY_AR } from '@/constants';
import type { ExtractedExpense, Transaction } from '@/types';

/** Cap on the raw invalid payload echoed back into the repair request (useChat parity). */
const REPAIR_ECHO_LIMIT = 500;

/** Items processed per storage round-trip inside one drain. */
const BATCH_SIZE = 4;

/** Options for a drain run. */
export interface DrainOptions {
  /** React-side cache invalidation (queries can't be reached outside React). */
  invalidate?: () => void;
}

/** True when the device has usable connectivity. */
function online(state: NetInfoState | null): boolean {
  return !!state && state.isConnected !== false && state.isInternetReachable !== false;
}

/** Supabase access token when signed in; guests stay null (device-id path). */
async function authToken(): Promise<string | null> {
  try {
    if (useAuth.getState().mode !== 'signed_in') return null;
    const { data } = await getSupabase().auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * The /capture envelope is { transcript, extracted, user_id }; accept a bare
 * extraction result too so both response shapes validate.
 */
function unwrapExtraction(raw: unknown): unknown {
  if (raw && typeof raw === 'object' && 'extracted' in raw) {
    const env = raw as { extracted?: unknown };
    if (env.extracted != null) return env.extracted;
  }
  return raw;
}

/**
 * One /capture text round-trip with contract parsing — the repair path used
 * when an audio take's extraction comes back invalid. Same repair prompt as
 * hooks/useChat.ts: a repaired pass yields needs_review, a second failure
 * throws so the queue can count the strike.
 */
async function captureTextAndParse(
  text: string,
  token: string | null,
): Promise<{ parsed: ZodExtractionResult; repaired: boolean }> {
  const first = await captureText(text, token);
  const firstParse = ExtractionResultSchema.safeParse(unwrapExtraction(first));
  if (firstParse.success) return { parsed: firstParse.data, repaired: false };

  const repairText =
    `${text}\n\n[ردّك السابق لم يكن JSON صالحًا وفق المخطط. ` +
    `الردّ السابق: ${JSON.stringify(first).slice(0, REPAIR_ECHO_LIMIT)} ` +
    `الخطأ: ${firstParse.error.message.slice(0, 300)}. ` +
    `أعد الإرسال بصيغة JSON صحيحة فقط.]`;
  const second = await captureText(repairText, token);
  const secondParse = ExtractionResultSchema.safeParse(unwrapExtraction(second));
  if (secondParse.success) return { parsed: secondParse.data, repaired: true };
  throw new Error('extraction_schema_failed');
}

/** Build the local Transaction payload for one extracted expense (useChat parity). */
function toTransactionInput(
  expense: ExtractedExpense,
  transcript: string,
  status: Transaction['status'],
): Omit<Transaction, 'id' | 'created_at' | 'updated_at' | 'synced_at'> {
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
    source: 'chat_voice' as const,
    raw_input: transcript,
    status,
  };
}

/** One-line Arabic summary for the assistant bubble above the cards (useChat parity). */
function summaryLine(tx: Transaction, numerals: 'western' | 'eastern'): string {
  const digits = tx.amount_minor % 100 === 0 ? 0 : 2;
  return `${CATEGORY_AR[tx.category]} — ${formatMinor(tx.amount_minor, numerals, digits)} ${
    CURRENCY_AR[tx.currency] ?? tx.currency
  }`;
}

/** Fallback assistant line when a take succeeds but yields nothing to store. */
const NO_EXPENSE_FOUND = 'لم أتعرف على مصروف في هذا التسجيل.';

/**
 * Process one queued capture end-to-end: upload → validate (repair ×1) →
 * insert transactions → append the user + assistant chat messages.
 */
async function processOne(item: VoiceCapture, token: string | null): Promise<void> {
  const raw = await captureAudio(item.uri, token);
  const envelope = (raw && typeof raw === 'object' ? raw : {}) as { transcript?: unknown };
  const transcript =
    typeof envelope.transcript === 'string' && envelope.transcript.trim()
      ? envelope.transcript
      : (item.text ?? '');
  if (!transcript.trim()) throw new Error('empty_transcript');

  const firstParse = ExtractionResultSchema.safeParse(unwrapExtraction(raw));
  let extraction: ZodExtractionResult;
  let repaired = false;
  if (firstParse.success) {
    extraction = normalizeExtraction(firstParse.data);
  } else {
    repaired = true;
    ({ parsed: extraction } = await captureTextAndParse(transcript, token));
    extraction = normalizeExtraction(extraction);
  }
  const status: Transaction['status'] = repaired ? 'needs_review' : 'confirmed';

  const numerals = usePrefs.getState().numerals;
  const now = new Date().toISOString();
  const saved: Transaction[] = [];
  for (const expense of extraction.expenses) {
    const input = toTransactionInput(expense, transcript, status);
    const id = await insertTransaction(input);
    saved.push({ ...input, id, created_at: now, updated_at: now, synced_at: null });
  }

  // Voice user bubble: 🎤 + transcript (technical-plan §7).
  await appendChatMessage({ role: 'user', content: `🎤 ${transcript}` });

  let content: string;
  if (saved.length > 0) {
    content = saved.map((tx) => summaryLine(tx, numerals)).join('\n');
    if (extraction.clarification_needed) content += `\n${extraction.clarification_needed}`;
  } else if (extraction.clarification_needed) {
    content = extraction.clarification_needed;
  } else if (extraction.unparsed_text) {
    content = extraction.unparsed_text;
  } else {
    content = NO_EXPENSE_FOUND;
  }
  await appendChatMessage({
    role: 'assistant',
    content,
    transactions_json: saved.length > 0 ? JSON.stringify(saved) : null,
  });
}

/** Drain loop: batches until empty; strikes park items after MAX_RETRIES. */
async function runDrain(opts: DrainOptions): Promise<void> {
  const net = await NetInfo.fetch().catch(() => null);
  if (!online(net)) return;

  const token = await authToken();
  let wrote = false;
  for (;;) {
    const batch = await takeBatch(BATCH_SIZE);
    if (batch.length === 0) break;
    for (const item of batch) {
      try {
        await processOne(item, token);
        await markDone(item.id);
        wrote = true;
      } catch (err) {
        await markFailed(item.id, err instanceof Error ? err.message : String(err));
      }
    }
  }
  if (wrote) opts.invalidate?.();
}

let draining: Promise<void> | null = null;

/**
 * Drain the voice queue now (no-op offline; joins an in-flight drain when
 * called concurrently). Safe to call from listeners and UI alike.
 */
export function processQueue(opts: DrainOptions = {}): Promise<void> {
  if (draining) return draining;
  draining = runDrain(opts).finally(() => {
    draining = null;
  });
  return draining;
}

let listenersAttached = false;

/**
 * Attach the queue's automatic drain triggers exactly once — NetInfo
 * (connectivity returns) and AppState (app foregrounded) — and try an
 * immediate drain. Called after the first capture is pushed.
 */
export function ensureVoiceDrain(): void {
  if (listenersAttached) return;
  listenersAttached = true;
  NetInfo.addEventListener((state) => {
    if (online(state)) void processQueue();
  });
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void processQueue();
  });
  void processQueue();
}
