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
