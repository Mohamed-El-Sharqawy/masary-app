# Masary DECISIONS (autonomous, captain away)

## D1 — npm --legacy-peer-deps for RN deps
SDK 57's react-dom 19.2.8 peer-wants react 19.2.8 while expo pins 19.2.3.
Standard Expo practice: install with --legacy-peer-deps (Expo CLI does the same
internally). Land it once, lockfile stays committed.

## D2 — package identity com.masary.app chosen at M0 (per plan §10)
Android package + iOS bundle com.masary.app, app name مصاري, versionCode 1.

## D3 — Deno edge function excluded from app tsc
supabase/functions/ excluded from tsconfig (Deno globals/types differ);
verified with supabase functions deploy + curl instead.

## D4 — reanimated 4.6.0 / worklets 0.12 (not 4.1)
SDK 57 needs reanimated ~4.6.0 + worklets ~0.12 (RN 0.86 peer range).

## D5 — date boundaries on Cairo calendar via UTC math
startOf* helpers use fixed +03:00 offset (Cairo has no DST since 2023) instead
of local setHours — deterministic on any machine (CI included).
