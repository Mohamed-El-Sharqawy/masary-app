/**
 * Quick-capture deep-link target: masary://capture → opens the chat composer
 * focused, ready to type an expense in one tap (technical-plan §6).
 * Used by: deep links / iOS Shortcuts (M5 documents the recipe).
 */
import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Deep-link capture screen — redirects into the chat tab. */
export default function CaptureScreen() {
  const router = useRouter();
  useEffect(() => {
    const id = setTimeout(() => router.replace('/(tabs)/'), 250);
    return () => clearTimeout(id);
  }, [router]);
  return (
    <SafeAreaView className="flex-1 items-center justify-center bg-cream">
      <View>
        <Text className="font-cairo text-lg text-ink">مصاري</Text>
      </View>
    </SafeAreaView>
  );
}
