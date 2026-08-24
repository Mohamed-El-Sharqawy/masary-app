/**
 * Zod schema for the AI extraction contract (technical-plan §4).
 * Parses the Edge Function's /capture response; one repair retry lives in
 * lib/ai/extract.ts. Used by: services/mutations.ts, tests.
 */
import { z } from 'zod';

export const CATEGORY_ENUM = z.enum([
  'food', 'coffee', 'groceries', 'transport', 'utilities', 'rent',
  'health', 'personal', 'entertainment', 'shopping', 'education',
  'travel', 'family', 'charity', 'other',
]);

export const ExtractedExpenseSchema = z.object({
  amount: z.number().nonnegative(),
  currency: z.string().length(3),
  currency_stated: z.boolean(),
  merchant: z.string().nullable(),
  person: z.string().nullable(),
  category: CATEGORY_ENUM,
  spent_at: z.string(),
  date_resolution: z.string(),
  notes: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export const ExtractionResultSchema = z.object({
  expenses: z.array(ExtractedExpenseSchema),
  unparsed_text: z.string().nullable(),
  clarification_needed: z.string().nullable(),
});

export type ZodExtractedExpense = z.infer<typeof ExtractedExpenseSchema>;
export type ZodExtractionResult = z.infer<typeof ExtractionResultSchema>;
