/**
 * Quick-capture screen (M3 voice) — masary://capture deep-link target.
 * One big hold-to-talk mic (components/chat/VoiceButton size 'lg'): takes go
 * straight into the offline voice queue and drain immediately (direct
 * /capture round-trip when online; NetInfo/AppState drain it later when
 * offline). RTL, Flamingo flat tokens, Cairo; guests welcome (device-id
 * rate-limited AI path). Link back into the chat tab.
 * Used by: deep links / iOS Shortcuts (M5 documents the recipe).
 */
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VoiceButton } from '@/components/chat/VoiceButton';
import { usePrefs } from '@/lib/i18n';

/** Quick-capture voice screen. */
export default function CaptureScreen() {
  const router = useRouter();
  const lang = usePrefs((s) => s.language);

  return (
    <SafeAreaView className="flex-1 bg-cream" edges={['top']}>
      <View className="flex-1 items-center justify-center gap-6 px-6">
        <View className="items-center gap-2">
          <Text className="font-cairo text-2xl font-bold text-ink">تسجيل سريع</Text>
          <Text className="text-center font-cairo text-sm leading-6 text-inksoft">
            اضغط المطوّل على الميكروفون وتحدّث بالمصروف{'\n'}
            يسجَّل الآن ويُحوَّل نصًا عند عودة الاتصال
          </Text>
        </View>
        <VoiceButton size="lg" />
        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace('/(tabs)/')}
          className="rounded-full border border-borderx bg-surface px-5 py-2"
        >
          <Text className="font-cairo text-sm text-primary">
            {lang === 'ar' ? 'اذهب إلى المحادثة' : 'Go to chat'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
