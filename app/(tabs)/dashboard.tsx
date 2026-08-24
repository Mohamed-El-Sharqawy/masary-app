/**
 * DASHBOARD screen — placeholder M0 shell.
 * M4 fills this with: period toggle, total, category donut, daily bars,
 * recent transactions list (see docs/ui-ux-plan.html §6 Dashboard spec).
 * Used by: app/(tabs)/_layout.tsx (tab 2).
 */
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView } from 'react-native';
import { usePrefs, t } from '@/lib/i18n';

/** Dashboard tab placeholder screen. */
export default function DashboardScreen() {
  const lang = usePrefs((s) => s.language);
  return (
    <SafeAreaView className="flex-1 bg-cream" edges={['top']}>
      <ScrollView contentContainerClassName="p-5">
        <Text className="font-cairo text-2xl font-bold text-ink">{t('tab_dashboard', lang)}</Text>
        <View className="mt-6 items-center rounded-2xl bg-surface p-6" style={{ borderWidth: 1, borderColor: '#FBD5DC' }}>
          <Text className="font-cairo text-sm text-inksoft">{t('empty_dashboard', lang)}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
