/**
 * Thin settings hook: exposes the persisted UI preferences (language,
 * numerals, defaultCurrency) and their setters from the prefs store in
 * lib/i18n.ts. Zustand + AsyncStorage persists each set immediately —
 * no extra save step for callers. Used by: app/(tabs)/settings.tsx.
 */
import { usePrefs } from '@/lib/i18n';
import type { CurrencyCode } from '@/constants';
import type { AppLanguage, NumeralSystem } from '@/types';

/** Read + write the user-preference slice used by the settings screen. */
export function useSettings() {
  const language = usePrefs((s) => s.language);
  const numerals = usePrefs((s) => s.numerals);
  const defaultCurrency = usePrefs((s) => s.defaultCurrency);
  const setLanguage = usePrefs((s) => s.setLanguage);
  const setNumerals = usePrefs((s) => s.setNumerals);
  const setDefaultCurrency = usePrefs((s) => s.setDefaultCurrency);
  return {
    language,
    numerals,
    defaultCurrency,
    setLanguage: (l: AppLanguage) => setLanguage(l),
    setNumerals: (n: NumeralSystem) => setNumerals(n),
    setDefaultCurrency: (c: CurrencyCode) => setDefaultCurrency(c),
  };
}
