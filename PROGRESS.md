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
