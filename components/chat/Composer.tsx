/**
 * Chat composer: text input + send button + hold-to-talk mic (M3 voice).
 * RTL-aware row (mic on the thumb side), Cairo font, flat Flamingo tokens.
 * Shows the optimistic "جاري الحفظ…" state while a capture is in flight.
 * Used by: app/(tabs)/index.tsx (chat screen).
 */
import { useState } from 'react';
import { I18nManager, Pressable, Text, TextInput, View } from 'react-native';
import { VoiceButton } from '@/components/chat/VoiceButton';
import { t, usePrefs } from '@/lib/i18n';

interface ComposerProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  saving?: boolean;
}

/** Text input row at the bottom of the chat screen. */
export function Composer({ onSend, disabled = false, saving = false }: ComposerProps) {
  const [value, setValue] = useState('');
  const lang = usePrefs((s) => s.language);
  const canSend = !disabled && !saving && value.trim().length > 0;
  const sendArrow = I18nManager.isRTL ? '◀' : '▶';

  function handleSend() {
    if (!canSend) return;
    const text = value.trim();
    setValue('');
    onSend(text);
  }

  return (
    <View className="border-t border-borderx bg-surface px-3 pb-3 pt-2">
      {saving ? (
        <Text className="mb-1.5 self-center font-cairo text-xs text-inksoft">
          {t('saving', lang)}
        </Text>
      ) : null}
      <View className="flex-row items-center gap-2">
        {/* mic — hold-to-talk; takes queue offline and drain when online */}
        <VoiceButton />
        <TextInput
          className="h-11 min-w-0 flex-1 rounded-full border border-borderx bg-cream px-4 font-cairo text-base text-ink"
          placeholderTextColor="#8A6B74"
          placeholder={t('chat_placeholder', lang)}
          value={value}
          onChangeText={setValue}
          editable={!disabled && !saving}
          onSubmitEditing={handleSend}
          returnKeyType="send"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="send"
          onPress={handleSend}
          disabled={!canSend}
          className={`h-11 w-11 items-center justify-center rounded-full bg-primary ${canSend ? '' : 'opacity-50'}`}
        >
          <Text className="text-base text-white">{sendArrow}</Text>
        </Pressable>
      </View>
    </View>
  );
}
