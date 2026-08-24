/**
 * One chat message bubble: user (coral, self-end in RTL) vs assistant
 * (white surface, soft border). Voice-origin messages get a 🎤 prefix.
 * Used by: app/(tabs)/index.tsx (chat message list).
 */
import { Text, View } from 'react-native';
import type { ChatMessage } from '@/types';

interface MessageBubbleProps {
  message: Pick<ChatMessage, 'role' | 'content' | 'transactions_json'>;
  /** True for voice-origin messages (M3); a leading "🎤 " marker also counts. */
  voice?: boolean;
}

/** A single user or assistant bubble row. */
export function MessageBubble({ message, voice = false }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const body = message.content.replace(/^🎤\s*/, '');
  const showMic = voice || body !== message.content;

  if (isUser) {
    return (
      <View className="mb-2 max-w-[80%] self-end rounded-2xl bg-primary px-4 py-2.5">
        <Text className="font-cairo text-base text-white">
          {showMic ? `🎤 ${body}` : body}
        </Text>
      </View>
    );
  }

  return (
    <View className="mb-2 max-w-[85%] self-start rounded-2xl border border-borderx bg-surface px-4 py-2.5">
      <Text className="font-cairo text-base text-ink">{body}</Text>
    </View>
  );
}
