# Masary PROGRESS

## M0 — Foundations (2026-08-24)
- Expo SDK 57 (RN 0.86.2, TS 6) blank-typescript scaffold merged; Expo Router tabs
  (المحادثة · لوحة التحكم · الإعدادات), NativeWind v4 + tailwind Flamingo tokens,
  Cairo font, RTL from day one, follow-system theme + dark derived palette.
- i18n: ar (MSA) primary / en string tables + prefs store (Zustand + AsyncStorage).
- utils/: numerals (Eastern↔Western deterministic), currency (minor units + FX
  snapshot normalization), dates (Cairo calendar + Egyptian relative phrases).
- lib/db.ts SQLite schema (transactions/captures/chat_messages + dirty outbox col).
- lib/ai/schema.ts Zod extraction contract.
- services/: api.ts · queries.ts · mutations.ts (TanStack best-practice layout).
- CI (.github/workflows/ci.yml): npm ci → typecheck → lint → structure → test.
- scripts/check-structure.mjs: header comments, feature dirs, services contract,
  utils purity. GREEN.
- Tests: 38 vitest tests green (numerals, currency, dates, schema).
- Verified: npx tsc --noEmit exit 0; npm test 4 files/38 tests passed;
  npm run structure OK.

## M1 — Data core (2026-08-24)
- SQLite schema live (transactions/captures/chat_messages + dirty outbox col) via lib/db.ts.
- Supabase project linked (gkueawywmczejwvzyvbk); migrations pushed; RLS auth.uid()
  on every table + indexes; RLS shape asserts in supabase/tests/rls_test.sql.
- Edge Function /capture deployed (Groq STT + strict-schema extraction, guest
  rate-limit 30/day, GROQ_API_KEY in secrets only).
- lib/: supabase.ts (auth helpers incl. Google/Apple OAuth), auth-store.ts (guest
  vs signed-in), sync.ts (outbox push/pull LWW, batches of 50, launch+foreground
  auto-sync, guest no-op), backup.ts (JSON export/import via file-system+sharing).
- Chat UI live: Composer, MessageBubble, ConfirmCard (animated), ExampleChips,
  OfflineBanner, hooks/useChat.ts pipeline (extraction → zod → repair retry →
  needs_review), app/(tabs)/index.tsx wired.
- lib/ai/extract.ts extraction wrapper + 9 mocked tests.
- Verified: tsc 0 errors, lint clean, structure OK (36 files), 47/47 tests.

## M2 — Chat + text extraction (2026-08-24)
- Chat UI complete: Composer/MessageBubble/ConfirmCard (animated)/ExampleChips/
  OfflineBanner + hooks/useChat.ts pipeline (extraction → Zod → 1 repair retry →
  needs_review fallback).
- Edge Function /capture hardened: normalizeExtraction post-pass (date→spent_at
  ISO+Cairo, field defaults, unknown-key drop, invalid-item quarantine),
  shared CURRENCIES/CATEGORIES consts, prompt rule 8 (exact 10-field contract).
- LIVE-VERIFIED against deployed function (gkueawywmczejwvzyvbk):
  * "bought groceries for 200" → clean contract JSON, EGP, category groceries.
  * "شريت قهوة وميترو بـ 35" → clarification_needed asks per-item split — no guessing.
  * "دفعت 50 لأحمد امبارح" → person أحمد captured, امبارح→2026-08-23.
- .env (gitignored) wired with EXPO_PUBLIC_SUPABASE_URL/ANON_KEY; .env.example committed.
- Verified: tsc 0, lint 0, structure OK, 47/47 tests.

## M3 — Voice pipeline (2026-08-24)
- lib/voice/recorder.ts: expo-audio 16kHz mono custom preset (WAV iOS / m4a Android),
  permission flow, interruption handling.
- lib/voice/queue.ts: AsyncStorage FIFO capture queue with 3-strike needs_review.
- lib/voice/process.ts: queue drain → /capture audio → extract → Transaction insert
  + chat append; clarification messages surfaced in chat.
- components/chat/VoiceButton.tsx: hold-to-talk, pulse, medium haptic, drag-up
  cancel hint, 60s auto-stop; wired into Composer.
- hooks/useVoice.ts wrapper; app/capture.tsx quick-capture screen.
- services/api.ts captureAudio() multipart; mutations extracted plain functions.
- Verified: tsc 0, lint 0, structure OK (45 files), 72/72 tests.

## M4 — Dashboard + aggregation (2026-08-24)
- lib/aggregates.ts: monthlySummary/dailyTotals/topMerchants — parameterized SQL,
  Cairo month bounds, FX-normalized EGP base, integer minor units.
- services/queries.ts: aggregate hooks (60s staleTime) + useRecentTransactions.
- app/(tabs)/dashboard.tsx: period pills, total card with FX snapshot line,
  flat donut (react-native-svg, amber accent), daily bars, top merchants,
  recent 8 → EditSheet, pull-to-refresh, empty state.
- components/dashboard/EditSheet.tsx: animated bottom sheet (amount decimal-pad
  with Eastern numerals, category chips, DD/MM/YYYY + quick chips, notes,
  delete with confirm).
- tests/aggregates.test.ts: 15 cases — Cairo bounds, FX weighting, KWD factor,
  day rollover UTC+3, SQL parameterization asserts.
- Verified: tsc 0, lint 0, structure OK (45 files), 72/72 tests.
