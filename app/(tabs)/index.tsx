/**
 * CHAT screen (default landing tab) — the heart of the app.
 * Live M2 pipeline: inverted message list (bubbles + confirm cards), composer,
 * example chips on empty state, offline banner, saving + error-with-retry.
 * Used by: app/(tabs)/_layout.tsx (tab 1).
 */
import { useCallback, useMemo } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNetInfo } from '@react-native-community/netinfo';
import * as Haptics from 'expo-haptics';
import { Composer } from '@/components/chat/Composer';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { ConfirmCard } from '@/components/chat/ConfirmCard';
import { ExampleChips } from '@/components/chat/ExampleChips';
import { OfflineBanner } from '@/components/chat/OfflineBanner';
import { useChat } from '@/hooks/useChat';
import { t, usePrefs } from '@/lib/i18n';
import { CATEGORY_AR } from '@/constants';
import { formatMinor } from '@/utils/numerals';
import type { ChatMessage, Transaction } from '@/types';

/** Parse a message's transactions_json into renderable cards (bad JSON → none). */
function parseTransactions(json: string | null): Transaction[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as Transaction[]) : [];
  } catch {
    return [];
  }
}

/** Chat tab screen. */
export default function ChatScreen() {
  const lang = usePrefs((s) => s.language);
  const numerals = usePrefs((s) => s.numerals);
  const { messages, send, saving, error, retry, confirmTransaction } = useChat();
  const net = useNetInfo();
  const offline = net.isConnected === false || net.isInternetReachable === false;

  // Inverted list wants newest first; the query returns oldest first.
  const data = useMemo(() => [...messages].reverse(), [messages]);

  const handleConfirm = useCallback(
    (tx: Transaction) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      void confirmTransaction(tx);
    },
    [confirmTransaction],
  );

  // Stub until the M4 edit sheet — shows what would be edited.
  const handleEdit = useCallback(
    (tx: Transaction) => {
      Alert.alert(
        t('edit_expense', lang),
        `${formatMinor(tx.amount_minor, numerals)} ${CATEGORY_AR[tx.category]}`,
        [{ text: t('cancel', lang) }],
      );
    },
    [lang, numerals],
  );

  const renderItem = useCallback(
    ({ item }: { item: ChatMessage }) => {
      const cards = item.role === 'assistant' ? parseTransactions(item.transactions_json) : [];
      return (
        <View className="px-4">
          <MessageBubble message={item} />
          {cards.map((tx, i) => (
            <ConfirmCard
              key={tx.id}
              tx={tx}
              numerals={numerals}
              onConfirm={handleConfirm}
              onEdit={handleEdit}
              delay={i * 60}
            />
          ))}
        </View>
      );
    },
    [numerals, handleConfirm, handleEdit],
  );

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
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {messages.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <ExampleChips onPress={(chipText) => void send(chipText)} />
          </View>
        ) : (
          <FlatList
            inverted
            data={data}
            keyExtractor={(m) => m.id}
            renderItem={renderItem}
            contentContainerStyle={{ paddingVertical: 12 }}
            keyboardShouldPersistTaps="handled"
          />
        )}
        {offline ? <OfflineBanner /> : null}
        {error ? (
          <View className="flex-row items-center justify-between gap-3 border-t border-borderx bg-surface px-4 py-2">
            <Text className="flex-1 font-cairo text-xs text-destructive">{error}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void retry()}
              className="rounded-full bg-primary px-4 py-1.5"
            >
              <Text className="font-cairo text-xs text-white">{t('retry', lang)}</Text>
            </Pressable>
          </View>
        ) : null}
        <Composer onSend={(text) => void send(text)} saving={saving} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
