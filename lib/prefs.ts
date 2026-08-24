/**
 * Local preference store for the Masary app (Zustand + AsyncStorage).
 * Single source of truth for onboarded / language / numerals / theme /
 * defaultCurrency, persisted under 'masary-prefs'. Exposes hasHydrated so
 * the root layout can gate first paint on the async rehydrate.
 * lib/i18n.ts re-exports usePrefs — the store itself lives ONLY here.
 * Used by: app/_layout.tsx (launch gate), app/onboarding.tsx,
 * app/auth.tsx, components/onboarding/AuthCard.tsx, settings, chat.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { AppLanguage, NumeralSystem, ThemePref } from '@/types';

/** Local UI preferences persisted on device. */
export interface PrefsState {
  onboarded: boolean;
  language: AppLanguage;
  numerals: NumeralSystem;
  theme: ThemePref;
  defaultCurrency: string; // ISO-4217, EGP default (technical-plan §5)
  hasHydrated: boolean; // true once AsyncStorage rehydrate settles
  setOnboarded: (v: boolean) => void;
  setLanguage: (l: AppLanguage) => void;
  setNumerals: (n: NumeralSystem) => void;
  setTheme: (t: ThemePref) => void;
  setDefaultCurrency: (c: string) => void;
  markHydrated: () => void;
}

/** Masary prefs store — persisted under 'masary-prefs' in AsyncStorage. */
export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      onboarded: false,
      language: 'ar',
      numerals: 'western',
      theme: 'system',
      defaultCurrency: 'EGP',
      hasHydrated: false,
      setOnboarded: (onboarded) => set({ onboarded }),
      setLanguage: (language) => set({ language }),
      setNumerals: (numerals) => set({ numerals }),
      setTheme: (theme) => set({ theme }),
      setDefaultCurrency: (defaultCurrency) => set({ defaultCurrency }),
      markHydrated: () => set({ hasHydrated: true }),
    }),
    {
      name: 'masary-prefs',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        onboarded: s.onboarded,
        language: s.language,
        numerals: s.numerals,
        theme: s.theme,
        defaultCurrency: s.defaultCurrency,
      }),
      onRehydrateStorage: () => (state) => {
        state?.markHydrated();
      },
    },
  ),
);
