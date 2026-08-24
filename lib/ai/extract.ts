/**
 * Extraction client wrapper (technical-plan §4).
 * Calls the Edge Function via services/api.ts, validates the JSON against
 * the Zod contract, retries ONCE with a repair prompt on validation failure,
 * then runs the deterministic normalizer (relative dates, Eastern numerals)
 * as defense in depth. Used by: services/mutations.ts (chat pipeline), tests.
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
 * Send user text to /capture and get a validated, normalized extraction.
 * One repair retry on schema failure; a second failure throws
 * ExtractionSchemaError so the caller can mark the capture needs_review.
 */
export async function extractExpenses(
  text: string,
  authToken: string | null,
): Promise<ZodExtractionResult> {
  let parsed = ExtractionResultSchema.safeParse(await captureText(text, authToken));

  if (!parsed.success) {
    const repairText =
      `${text} Previous response failed schema validation: ` +
      `${parsed.error.message}. Return ONLY corrected JSON.`;
    parsed = ExtractionResultSchema.safeParse(await captureText(repairText, authToken));
  }

  if (!parsed.success) throw new ExtractionSchemaError(parsed.error.message);
  return normalizeExtraction(parsed.data);
}
