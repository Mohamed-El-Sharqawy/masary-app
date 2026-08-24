/**
 * Shared TypeScript types for the Masary app.
 * Mirrors technical-plan §5 data model; used by: lib/db, services, components.
 */

/** Flat category enum (technical-plan §4) — Egyptian-life-aware. */
export const CATEGORIES = [
  'food',
  'coffee',
  'groceries',
  'transport',
  'utilities',
  'rent',
  'health',
  'personal',
  'entertainment',
  'shopping',
  'education',
  'travel',
  'family',
  'charity',
  'other',
] as const;

export type Category = (typeof CATEGORIES)[number];

/** How the expense entered the system. */
export type TransactionSource = 'chat_text' | 'chat_voice' | 'edit';

/** Lifecycle of a transaction row. */
export type TransactionStatus = 'pending' | 'confirmed' | 'needs_review';

/** One stored expense (SQLite `transactions` table / Postgres mirror). */
export interface Transaction {
  id: string; // uuid, generated on device — upsert-safe
  user_id: string | null; // null for guest
  amount_minor: number; // integer minor units (piastres/cents); never floats
  currency: string; // ISO-4217, EGP default
  fx_rate_to_egp: number | null; // snapshot at capture; never restated
  merchant: string | null; // null when unknown — never hallucinated
  person: string | null; // name mentioned (e.g. أحمد) — always captured
  category: Category;
  spent_at: string; // ISO-8601 with timezone
  notes: string | null;
  source: TransactionSource;
  raw_input: string; // original transcript/text for audit
  status: TransactionStatus;
  created_at: string;
  updated_at: string;
  synced_at: string | null;
}

/** Offline queue row for voice captures (SQLite `captures` table). */
export interface Capture {
  id: string;
  audio_path: string | null;
  status: 'recording' | 'transcribing' | 'extracted' | 'synced' | 'failed' | 'needs_review';
  transcript: string | null;
  extracted_json: string | null;
  retry_count: number;
  created_at: string;
}

/** Chat log row (SQLite `chat_messages` table). */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  transactions_json: string | null; // confirm cards rendered from these
  created_at: string;
}

/** One extracted expense from the AI extraction contract (technical-plan §4). */
export interface ExtractedExpense {
  amount: number; // major units, decimals fine (3.50)
  currency: string; // ISO-4217
  currency_stated: boolean; // false = inferred (EGP default)
  merchant: string | null;
  person: string | null;
  category: Category;
  spent_at: string; // ISO-8601 with tz, relative dates resolved
  date_resolution: string;
  notes: string | null;
  confidence: number;
}

/** Full extraction response envelope (technical-plan §4). */
export interface ExtractionResult {
  expenses: ExtractedExpense[];
  unparsed_text: string | null;
  clarification_needed: string | null;
}

/** App language (UI copy is MSA Arabic by default, English toggle). */
export type AppLanguage = 'ar' | 'en';

/** Numeral display preference (Western default, Eastern toggle). */
export type NumeralSystem = 'western' | 'eastern';

/** Theme preference (follow system default + in-app toggle). */
export type ThemePref = 'system' | 'light' | 'dark';
