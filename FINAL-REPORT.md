# Masary (مصاري) — Final Report

**Date:** 2026-08-24 · **Stack:** Expo SDK 57 (RN 0.86.2, TS 6) · Expo Router · NativeWind v4 · SQLite · Supabase · Groq
**Delivery model:** milestone branches (m0→m5), main untouched for the captain to merge.

## Executive summary

The full app shipped end-to-end: voice & chat-first Egyptian expense tracker, Arabic فصيح RTL-first,
Flamingo flat design, on-device SQLite source of truth with Supabase outbox sync for signed-in users,
guest local-only mode with rate-limited AI access, and a deployed Edge Function doing Groq STT +
strict-schema extraction — live-verified with real Arabic test inputs.

## Milestones

| Branch | Commit | Scope |
|---|---|---|
| m0-foundations | 0f1b3fb | Scaffold, Router tabs, Flamingo tokens, RTL i18n, CI, 38 tests |
| m1-data-core | 3636966 | SQLite schema, Supabase link + RLS migrations, outbox sync, auth, backup, chat UI pipeline |
| m2-chat-extraction | 7d426ea | Hardened /capture contract (normalizeExtraction), live-verified extraction, env wiring |
| m3-voice | 42cd045 | 16kHz mono recorder, hold-to-talk button, offline queue with 3-strike review |
| m4-dashboard | 4b1d817 | Aggregates (Cairo bounds, FX-normalized), donut + bars, edit sheet |
| m5-polish | 4fe78fa | Onboarding 3-pager, email/Google/Apple auth, guest mode, full settings, backup import/export |

## Live verification (deployed Edge Function, project gkueawywmczejwvzyvbk)

- "bought groceries for 200" → clean contract JSON (EGP, groceries, spent_at ISO, confidence)
- "شريت قهوة وميترو بـ 35" → clarification_needed asks per-item split — never guesses
- "دفعت 50 لأحمد امبارح" → person أحمد captured, امبارح resolved to 2026-08-23

## Quality gates (all green on m5-polish)

- `npx tsc --noEmit` → 0 errors
- `npm run lint` → 0 problems
- `npm run structure` → OK (52 source files)
- `npm test` → 7 files, 72/72 tests (numerals, currency, dates, schema, extract, queue, aggregates)

## Key decisions (full log in DECISIONS.md)

- npm --legacy-peer-deps (Expo SDK 57 peer tangles); reanimated 4.6 + worklets 0.12
- Edge function excluded from app tsc (Deno types), verified by deploy + live curl
- Cairo calendar boundaries via fixed +03:00 UTC math (no DST since 2023)
- date→spent_at rename + field defaults server-side (model drift defense)
- Milestone branches, main untouched (captain merges)

## Known gaps / follow-ups

- Device/EAS build not yet run (needs dev-client build on a device or emulator — M5 store-readiness item)
- Google/Apple OAuth redirect URIs need dashboard configuration before first real sign-in
- RLS SQL asserts exist (supabase/tests/rls_test.sql) but are not yet wired into CI
- Guest rate limit is in-memory per edge instance (30/day/device-id) — durable backend (KV/table) if abuse appears

## Secrets posture

GROQ_API_KEY lives only in Supabase Edge Function secrets. App .env (gitignored) holds only
public-safe EXPO_PUBLIC_SUPABASE_URL + ANON_KEY. No secret ever entered the repo.
