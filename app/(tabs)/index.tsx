/**
 * CHAT screen (default landing tab) — the heart of the app.
 * Placeholder M0 shell: header, empty state with example chips, composer.
 * M2 replaces the body with the live chat pipeline (messages + confirm cards).
 * Used by: app/(tabs)/_layout.tsx (tab 1).
 */
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePrefs, t } from '@/lib/i18n';

/** Chat tab placeholder screen. */
export default function ChatScreen() {
  const lang = usePrefs((s) => s.language);
  return (
    <SafeAreaView className="flex-1 bg-cream" edges={['top']}>
      <View className="px-5 pb-3 pt-2">
        <View className="flex-row items-center justify-between">
          <Text className="font-cairo text-2xl font-bold text-ink">مصاري</Text>
          <View className="rounded-full bg-chip px-3 py-1">
            <Text className="font-cairo text-xs text-inksoft">{t('guest_badge', lang)}</Text>
          </View>
        </View>
      </View>
      <View className="flex-1 items-center justify-center px-6">
        <Text className="font-cairo text-base text-inksoft">{t('example_1', lang)}</Text>
        <Text className="mt-2 font-cairo text-base text-inksoft">{t('example_2', lang)}</Text>
        <Text className="mt-2 font-cairo text-base text-inksoft">{t('example_3', lang)}</Text>
      </View>
    </SafeAreaView>
  );
}
