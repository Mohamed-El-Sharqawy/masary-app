/**
 * Empty-state example chips ("شريت قهوة بـ 20" …) from the i18n table.
 * Tapping a chip sends its text into the chat as a normal user message.
 * Used by: app/(tabs)/index.tsx (chat empty state).
 */
import { Pressable, Text, View } from 'react-native';
import { t, usePrefs } from '@/lib/i18n';

const EXAMPLE_KEYS = ['example_1', 'example_2', 'example_3'] as const;

interface ExampleChipsProps {
  onPress: (chipText: string) => void;
}

/** Vertically stacked tappable example prompts. */
export function ExampleChips({ onPress }: ExampleChipsProps) {
  const lang = usePrefs((s) => s.language);
  return (
    <View className="w-full items-center gap-2.5 px-6">
      {EXAMPLE_KEYS.map((key) => (
        <Pressable
          key={key}
          accessibilityRole="button"
          onPress={() => onPress(t(key, lang))}
          className="rounded-full bg-chip px-4 py-2.5"
        >
          <Text className="font-cairo text-sm text-ink">{t(key, lang)}</Text>
        </Pressable>
      ))}
    </View>
  );
}
