/**
 * Offline notice banner (soft chip fill) shown above the composer when the
 * device has no connection — captures keep saving to SQLite and sync later.
 * Used by: app/(tabs)/index.tsx (chat screen).
 */
import { Text, View } from 'react-native';
import { t, usePrefs } from '@/lib/i18n';

/** Slim centered banner; informational only, never blocks input. */
export function OfflineBanner() {
  const lang = usePrefs((s) => s.language);
  return (
    <View className="mx-3 mb-1 rounded-xl bg-chip px-3 py-2">
      <Text className="text-center font-cairo text-xs text-inksoft">
        {t('offline_banner', lang)}
      </Text>
    </View>
  );
}
