/**
 * Extraction client wrapper (technical-plan §4).
 * Calls the Edge Function via services/api.ts, validates the JSON against
 * the Zod contract, retries ONCE with a repair prompt on validation failure,
 * then runs the deterministic normalizer (relative dates, Eastern numerals)
 * as defense in depth. Also exports unwrapExtraction, the shared /capture
 * envelope unwrap used by the text paths here and in lib/voice/process.ts.
 * Used by: services/mutations.ts (chat pipeline), hooks/useChat.ts, tests.
 */
import { ExtractionResultSchema } from '@/lib/ai/schema';
import type { ZodExtractionResult } from '@/lib/ai/schema';
import { captureText } from '@/services/api';
import { RELATIVE_DATE_PHRASES, resolveRelativePhrase } from '@/utils/dates';
import { normalizeNumerals } from '@/utils/numerals';

/** Thrown when the Edge Function response fails schema validation twice. */
export class ExtractionSchemaError extends Error {
  /** Zod error message from the final (post-repair) validation attempt. */
  readonly zodMessage: string;

  constructor(zodMessage: string) {
    super(`extraction_schema_validation_failed: ${zodMessage}`);
    this.name = 'ExtractionSchemaError';
    this.zodMessage = zodMessage;
  }
}

/**
 * Deterministic post-pass on a validated extraction:
 * - spent_at holding a known relative phrase (امبارح…) → resolved ISO time
 * - notes Eastern numerals ٠-٩ → Western 0-9 (٫→. ٬→,)
 * Never fails: unknown values pass through untouched.
 */
export function normalizeExtraction(result: ZodExtractionResult): ZodExtractionResult {
  return {
    ...result,
    expenses: result.expenses.map((e) => {
      const phrase = e.spent_at.trim();
      const spent_at = Object.prototype.hasOwnProperty.call(RELATIVE_DATE_PHRASES, phrase)
        ? (resolveRelativePhrase(phrase) ?? e.spent_at)
        : e.spent_at;
      return {
        ...e,
        spent_at,
        notes: e.notes == null ? null : normalizeNumerals(e.notes),
      };
    }),
  };
}

/**
 * The /capture envelope is { transcript, extracted, user_id }; accept a bare
 * extraction result too so both response shapes validate.
 */
export function unwrapExtraction(raw: unknown): unknown {
  if (raw && typeof raw === 'object' && 'extracted' in raw) {
    const env = raw as { extracted?: unknown };
    if (env.extracted != null) return env.extracted;
  }
  return raw;
}

/**
 * Send user text to /capture and get a validated, normalized extraction.
 * One repair retry on schema failure; a second failure throws
 * ExtractionSchemaError so the caller can mark the capture needs_review.
 */
export async function extractExpenses(
  text: string,
  authToken: string | null,
): Promise<ZodExtractionResult> {
  let parsed = ExtractionResultSchema.safeParse(
    unwrapExtraction(await captureText(text, authToken)),
  );

  if (!parsed.success) {
    const repairText =
      `${text} Previous response failed schema validation: ` +
      `${parsed.error.message}. Return ONLY corrected JSON.`;
    parsed = ExtractionResultSchema.safeParse(
      unwrapExtraction(await captureText(repairText, authToken)),
    );
  }

  if (!parsed.success) throw new ExtractionSchemaError(parsed.error.message);
  return normalizeExtraction(parsed.data);
}
