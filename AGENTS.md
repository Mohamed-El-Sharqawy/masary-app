// AGENTS.md — working contract for coding agents (opencode etc.) in this repo.
// Read FIRST. The full spec lives in docs/technical-plan.html (§ refs below).
// Complements .agents/skills/ — load them for Supabase/RN work.

## Mission
Masary (مصاري) — voice & chat-first expense tracker. Expo + React Native +
NativeWind v4, Arabic (فصيح, RTL) first. User types/speaks an expense → AI
extracts structured transactions → SQLite (source of truth) → Supabase sync
for signed-in users; guests stay local-only.

## Non-negotiables
- NEVER commit secrets, .env, or GROQ_API_KEY. It lives only in Supabase
  Edge Function secrets (`supabase secrets set`), never in app code or git.
- Money = integer minor units + ISO-4217 currency code. No float math for
  stored amounts. EGP default. fx_rate_to_egp snapshot at capture, never restated.
- Flat design "Flamingo", NO gradients: primary #F43F5E, accent #EC4899,
  bg #FFF1F3, surface #FFFFFF, success #0D9488, chart #F59E0B, destructive
  #DC2626 (always with text label), border #FBD5DC, chip #FFE1E7. Cairo font.
- UI copy: Modern Standard Arabic (فصيح). Input accepts Egyptian/MSA/English/mixed.
- Western numerals 0-9 default, Eastern ٠-٩ toggle. Theme follows system.
- Every .ts/.tsx file starts with a header comment: purpose + where used.
- Routes only in app/, components/<feature>/ + components/ui/, services/,
  lib/, hooks/, utils/, types/, constants/, assets/. Enforced by
  scripts/check-structure.mjs (CI).
- Conventional commits, one logical change per commit. No force pushes.
- Never touch: .agents/skills/ (installed skills), docs/*.html (plans).

## Key contracts
- Categories (flat enum): food coffee groceries transport utilities rent
  health personal entertainment shopping education travel family charity other
- Extraction JSON (Edge Function returns): { expenses: [{amount, currency,
  currency_stated, merchant, person, category, spent_at, date_resolution,
  notes, confidence}], unparsed_text, clarification_needed }
- Multi-item rule: total only → ask back (clarification_needed), NEVER guess split.
- Person names always captured in person field.
- Relative dates resolved with Africa/Cairo clock injected per call
  (امبارح، من يومين، من تلت ايام، الجمعة اللي فاتت…).
- Eastern numerals ٠١٢٣٤٥٦٧٨٩ → 0-9 deterministically (٫→. ٬→,).

## Stack map (SDK 57, RN 0.86)
- expo-router (tabs: المحادثة · لوحة التحكم · الإعدادات) — app/ dir
- expo-sqlite local DB (source of truth) + outbox sync → Supabase Postgres
- expo-audio 16kHz mono (WAV iOS / m4a Android) → Groq whisper-large-v3-turbo
- Groq gpt-oss-120b strict json_schema extraction (fallback gpt-oss-20b)
- TanStack Query + Zustand; services/api.ts · queries.ts · mutations.ts
- Zod everywhere for contracts. vitest for utils + extraction schema tests.

## Verify before done
npm run typecheck && npm run lint && npm run structure && npm test
(git push only when all green — see scripts in package.json)

## Milestone map (docs/technical-plan.html §8)
M0 Foundations (scaffold, tokens, tabs, i18n/RTL, CI) → M1 Data core (SQLite,
Supabase migrations+RLS, outbox, guest mode) → M2 Chat + text extraction →
M3 Voice pipeline → M4 Dashboard + Q&A → M5 Polish & pilot.
