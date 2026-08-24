/**
 * SETTINGS screen — placeholder M0 shell.
 * M5 fills this with: account card (guest upgrade), language, numerals,
 * default currency, categories manager, backup & import, about.
 * Used by: app/(tabs)/_layout.tsx (tab 3).
 */
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView } from 'react-native';
import { usePrefs, t } from '@/lib/i18n';

/** Settings tab placeholder screen. */
export default function SettingsScreen() {
  const lang = usePrefs((s) => s.language);
  return (
    <SafeAreaView className="flex-1 bg-cream" edges={['top']}>
      <ScrollView contentContainerClassName="p-5">
        <Text className="font-cairo text-2xl font-bold text-ink">{t('tab_settings', lang)}</Text>
        <View className="mt-6 rounded-2xl bg-surface p-5" style={{ borderWidth: 1, borderColor: '#FBD5DC' }}>
          <View className="flex-row items-center justify-between">
            <Text className="font-cairo text-base text-ink">{t('account', lang)}</Text>
            <Text className="font-cairo text-sm text-inksoft">{t('guest', lang)}</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
