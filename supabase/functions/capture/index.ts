/**
 * Edge Function: capture — Groq AI proxy for the Masary app.
 * Optional JWT auth (signed-in users via supabase-js getUser); guests are
 * rate-limited by x-device-id (30/UTC day). Audio input → Groq STT
 * (whisper-large-v3-turbo, fallback whisper-large-v3), then strict
 * json_schema extraction (gpt-oss-120b, fallback gpt-oss-20b) with an
 * Africa/Cairo clock injected per call. A normalizeExtraction post-pass
 * repairs model drift (date→spent_at, field defaults, strict re-validation)
 * so payloads always match lib/ai/schema.ts. GROQ_API_KEY lives only in
 * Supabase secrets — never logged, never returned. Used by: services/api.ts.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const GROQ_URL = 'https://api.groq.com/openai/v1';
const STT_MODELS = ['whisper-large-v3-turbo', 'whisper-large-v3'];
const EXTRACT_MODELS = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'];
const GUEST_DAILY_LIMIT = 30;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-id, content-type, x-device-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Shared enums for the extraction contract — single source for the JSON schema and the post-pass. */
const CURRENCIES = ['EGP', 'USD', 'EUR', 'SAR', 'AED', 'KWD', 'GBP'];
const CATEGORIES = [
  'food', 'coffee', 'groceries', 'transport', 'utilities', 'rent',
  'health', 'personal', 'entertainment', 'shopping', 'education',
  'travel', 'family', 'charity', 'other',
];

const EXPENSE_SCHEMA = {
  type: 'object',
  properties: {
    expenses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          amount: { type: 'number' },
          currency: { type: 'string', enum: CURRENCIES },
          currency_stated: { type: 'boolean' },
          merchant: { type: ['string', 'null'] },
          person: { type: ['string', 'null'] },
          category: {
            type: 'string',
            enum: CATEGORIES,
          },
          spent_at: { type: 'string' },
          date_resolution: { type: 'string' },
          notes: { type: ['string', 'null'] },
          confidence: { type: 'number' },
        },
        required: [
          'amount', 'currency', 'currency_stated', 'merchant', 'person',
          'category', 'spent_at', 'date_resolution', 'notes', 'confidence',
        ],
        additionalProperties: false,
      },
    },
    unparsed_text: { type: ['string', 'null'] },
    clarification_needed: { type: ['string', 'null'] },
  },
  required: ['expenses', 'unparsed_text', 'clarification_needed'],
  additionalProperties: false,
};

/** System prompt with the per-call clock injected (technical-plan §4). */
function buildSystemPrompt(nowIso: string, tz: string): string {
  return [
    'You are the expense extraction engine for Masary, an Egyptian expense tracker.',
    'Convert the user text (Egyptian Arabic dialect, MSA, English, or mixed) into strict JSON.',
    `Today is ${nowIso} (timezone ${tz}). Resolve all relative dates against this clock.`,
    'RULES:',
    '1. Never invent amounts, merchants, or dates. Set merchant to null when unknown.',
    '2. Person names are ALWAYS captured in the person field, never dropped.',
    '3. Multi-item utterances with only a total: do NOT guess the split. Set expenses to [],',
    '   and set clarification_needed to a question asking for each item\'s amount.',
    '4. Resolve Egyptian relative dates: امبارح = yesterday, من يومين = 2 days ago,',
    '   من تلت ايام = 3 days ago, الجمعة اللي فاتت = last Friday, الشهر اللي فات = one month ago.',
    '5. When no currency is stated, use EGP and set currency_stated to false.',
    '6. Arabic currency words: جنيه = EGP, دولار = USD, ريال = SAR, درهم = AED,',
    '   يورو = EUR, إسترليني = GBP, دينار = KWD.',
    '7. Non-expense text (questions, chatter): return expenses [], set unparsed_text to the text.',
    '8. Each expense object MUST contain exactly the fields: amount, currency, currency_stated,',
    '   merchant, person, category, spent_at, date_resolution, notes, confidence.',
    '   Use spent_at (ISO 8601 with timezone) — never the key date.',
    '9. Output ONLY the JSON object matching the schema. No prose.',
  ].join('\n');
}

/** Deterministic numeral normalization: Eastern Arabic + Persian digits and decimal marks to ASCII. */
function normalizeNumerals(input: string): string {
  const eastern = '٠١٢٣٤٥٦٧٨٩';
  const persian = '۰۱۲۳۴۵۶۷۸۹';
  return Array.from(input)
    .map((ch) => {
      const e = eastern.indexOf(ch);
      if (e >= 0) return String(e);
      const p = persian.indexOf(ch);
      if (p >= 0) return String(p);
      if (ch === '\u066B') return '.';
      if (ch === '\u066C') return ',';
      return ch;
    })
    .join('');
}

/** Guest rate limit: in-memory Map keyed by device id, 30 per UTC day. */
function guestOverLimit(deviceId: string): boolean {
  const store = globalThis as { __masaryRate?: Map<string, { count: number; day: string }> };
  store.__masaryRate ??= new Map();
  const kv = store.__masaryRate;
  const today = new Date().toISOString().slice(0, 10);
  const cur = kv.get(deviceId);
  if (cur && cur.day === today) {
    if (cur.count >= GUEST_DAILY_LIMIT) return true;
    cur.count += 1;
    return false;
  }
  kv.set(deviceId, { count: 1, day: today });
  return false;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/** Groq STT with model fallback; throws on total failure. */
async function groqStt(apiKey: string, audio: Blob): Promise<string> {
  const attempt = async (model: string) => {
    const form = new FormData();
    form.append('file', audio, 'audio.m4a');
    form.append('model', model);
    form.append('response_format', 'json');
    return fetch(`${GROQ_URL}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
  };
  let res = await attempt(STT_MODELS[0]);
  if (!res.ok) res = await attempt(STT_MODELS[1]);
  if (!res.ok) throw new Error(`stt failed: ${res.status}`);
  const data = (await res.json()) as { text?: string };
  return data.text ?? '';
}

/** Normalized expense shape returned to the app (mirrors lib/ai/schema.ts). */
interface NormalizedExpense {
  amount: number;
  currency: string;
  currency_stated: boolean;
  merchant: string | null;
  person: string | null;
  category: string;
  spent_at: string;
  date_resolution: string;
  notes: string | null;
  confidence: number;
}

/** Normalized top-level shape: exactly {expenses, unparsed_text, clarification_needed}. */
interface NormalizedExtraction {
  expenses: NormalizedExpense[];
  unparsed_text: string | null;
  clarification_needed: string | null;
}

/**
 * spent_at resolution for one raw item: prefer an existing spent_at; else take
 * date, upgrading a bare 'YYYY-MM-DD' to ISO at Cairo +03:00 noon (12:00);
 * other date strings pass through. Returns '' when neither key is usable.
 */
function coerceSpentAt(item: Record<string, unknown>): string {
  if (typeof item.spent_at === 'string' && item.spent_at) return item.spent_at;
  if (typeof item.date === 'string' && item.date) {
    return /^\d{4}-\d{2}-\d{2}$/.test(item.date) ? `${item.date}T12:00:00+03:00` : item.date;
  }
  return '';
}

/**
 * Post-pass after JSON.parse: repairs model drift before the payload reaches
 * the app's Zod schema. Renames date→spent_at, applies field defaults, drops
 * unknown keys, re-validates each item strictly (amount number >= 0, currency
 * in the 7-enum, category in the 15-enum, usable spent_at) and moves invalid
 * items into unparsed_text instead of failing the whole call. Top-level keys
 * are pinned to exactly {expenses, unparsed_text, clarification_needed}.
 */
function normalizeExtraction(obj: unknown): NormalizedExtraction {
  const src = (typeof obj === 'object' && obj !== null ? obj : {}) as Record<string, unknown>;
  const rawExpenses = Array.isArray(src.expenses) ? src.expenses : [];
  const expenses: NormalizedExpense[] = [];
  const rejected: string[] = [];
  for (const raw of rawExpenses) {
    const item = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
    const amount = typeof item.amount === 'number' ? item.amount : Number.NaN;
    const currency = typeof item.currency === 'string' ? item.currency : 'EGP';
    const category = typeof item.category === 'string' ? item.category : 'other';
    const spentAt = coerceSpentAt(item);
    const confidence = typeof item.confidence === 'number' ? item.confidence : 0.5;
    const candidate: NormalizedExpense = {
      amount,
      currency,
      currency_stated: typeof item.currency_stated === 'boolean' ? item.currency_stated : false,
      merchant: typeof item.merchant === 'string' ? item.merchant : null,
      person: typeof item.person === 'string' ? item.person : null,
      category,
      spent_at: spentAt,
      date_resolution: typeof item.date_resolution === 'string' ? item.date_resolution : 'day',
      notes: typeof item.notes === 'string' ? item.notes : null,
      confidence: Math.min(1, Math.max(0, confidence)),
    };
    const valid =
      Number.isFinite(amount) &&
      amount >= 0 &&
      CURRENCIES.includes(currency) &&
      CATEGORIES.includes(category) &&
      spentAt !== '';
    if (valid) expenses.push(candidate);
    else rejected.push(JSON.stringify(raw));
  }
  const baseUnparsed = typeof src.unparsed_text === 'string' ? src.unparsed_text : null;
  const rejectedText = rejected.length > 0 ? rejected.join(' | ') : null;
  const unparsedText = [baseUnparsed, rejectedText].filter(Boolean).join(' | ') || null;
  return {
    expenses,
    unparsed_text: unparsedText,
    clarification_needed:
      typeof src.clarification_needed === 'string' ? src.clarification_needed : null,
  };
}

/** Groq extraction with model fallback + strict schema; throws on total failure. */
async function groqExtract(
  apiKey: string,
  transcript: string,
  nowIso: string,
  tz: string,
): Promise<NormalizedExtraction> {
  const attempt = async (model: string) =>
    fetch(`${GROQ_URL}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: buildSystemPrompt(nowIso, tz) },
          { role: 'user', content: transcript },
        ],
        response_format: { type: 'json_object', schema: EXPENSE_SCHEMA },
      }),
    });
  let res = await attempt(EXTRACT_MODELS[0]);
  if (!res.ok) res = await attempt(EXTRACT_MODELS[1]);
  if (!res.ok) throw new Error(`extraction failed: ${res.status}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('extraction returned no content');
  return normalizeExtraction(JSON.parse(content));
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const apiKey = Deno.env.get('GROQ_API_KEY');
  if (!apiKey) {
    return json({ error: 'server_not_configured' }, 500);
  }

  // Auth: optional Bearer JWT → signed-in user; otherwise guest via x-device-id.
  const authHeader = req.headers.get('authorization') ?? '';
  const deviceId = req.headers.get('x-device-id') ?? '';
  let userId: string | null = null;
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length);
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );
    const { data } = await supabase.auth.getUser();
    if (data.user) userId = data.user.id;
  }
  if (!userId) {
    if (!deviceId) {
      return json({ error: 'missing_device_id' }, 400);
    }
    if (guestOverLimit(deviceId)) {
      return json({ error: 'rate_limited' }, 429);
    }
  }

  // Input: JSON { text } or multipart with 'audio' file (+ optional text field).
  const contentType = req.headers.get('content-type') ?? '';
  let transcript = '';
  let audio: Blob | null = null;
  try {
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('audio');
      if (file instanceof Blob) audio = file;
      transcript = String(form.get('text') ?? '');
    } else {
      const body = (await req.json()) as { text?: string };
      transcript = body.text ?? '';
    }
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  if (audio) {
    try {
      transcript = await groqStt(apiKey, audio);
    } catch {
      return json({ error: 'stt_failed' }, 502);
    }
  }
  if (!transcript.trim()) {
    return json({ error: 'empty_input' }, 400);
  }

  const tz = 'Africa/Cairo';
  const nowIso = new Date().toISOString();
  try {
    const extracted = await groqExtract(apiKey, normalizeNumerals(transcript), nowIso, tz);
    return json({ transcript, extracted, user_id: userId }, 200);
  } catch {
    return json({ error: 'extraction_failed' }, 502);
  }
});
