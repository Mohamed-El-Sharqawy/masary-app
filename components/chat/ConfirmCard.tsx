/**
 * Transaction confirmation card shown under an assistant message.
 * Amount via formatMinor + CURRENCY_AR, category chip (bg-chip), date,
 * merchant/person line, تأكيد (primary) / تعديل (outline) actions.
 * Entrance: slide-up + fade 180ms (reanimated), 60ms stagger in stacks.
 * Used by: app/(tabs)/index.tsx (chat message rows).
 */
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { CATEGORY_AR, CURRENCY_AR } from '@/constants';
import { formatMinor, toEasternDigits } from '@/utils/numerals';
import { startOfDaysAgo, startOfToday } from '@/utils/dates';
import { t, usePrefs } from '@/lib/i18n';
import type { NumeralSystem, Transaction } from '@/types';

interface ConfirmCardProps {
  tx: Transaction;
  onConfirm: (tx: Transaction) => void;
  onEdit: (tx: Transaction) => void;
  numerals: NumeralSystem;
  /** Stagger delay in ms for stacked cards (60ms steps per ui-ux-plan §7). */
  delay?: number;
}

/** Relative date label: اليوم · أمس · قبل يومين, else ISO date (Cairo clock). */
function dateLabel(iso: string, lang: 'ar' | 'en', system: NumeralSystem): string {
  const spent = new Date(iso).getTime();
  if (spent >= new Date(startOfToday()).getTime()) return t('today', lang);
  if (spent >= new Date(startOfDaysAgo(1)).getTime()) return t('yesterday', lang);
  if (spent >= new Date(startOfDaysAgo(2)).getTime()) return t('day_before_yesterday', lang);
  const isoDate = iso.slice(0, 10);
  return system === 'eastern' ? toEasternDigits(isoDate) : isoDate;
}

/** One extracted-transaction card with confirm / edit actions. */
export function ConfirmCard({ tx, onConfirm, onEdit, numerals, delay = 0 }: ConfirmCardProps) {
  const lang = usePrefs((s) => s.language);
  const fractionDigits = tx.amount_minor % 100 === 0 ? 0 : 2;
  const amountText = `${formatMinor(tx.amount_minor, numerals, fractionDigits)} ${
    CURRENCY_AR[tx.currency] ?? tx.currency
  }`;
  const whoLine = tx.merchant && tx.person ? `${tx.merchant} · ${tx.person}` : (tx.merchant ?? tx.person);
  const needsReview = tx.status === 'needs_review';

  return (
    <Animated.View
      entering={FadeInUp.duration(180).delay(delay)}
      className={`mb-2 w-[82%] self-start rounded-2xl border bg-surface p-3 ${
        needsReview ? 'border-accent' : 'border-borderx'
      }`}
    >
      <View className="flex-row items-center justify-between gap-2">
        <Text className="font-cairo text-xl font-bold text-ink">{amountText}</Text>
        <View className="flex-row items-center gap-1.5">
          <View className="rounded-full bg-chip px-2.5 py-1">
            <Text className="font-cairo text-xs text-ink">{CATEGORY_AR[tx.category]}</Text>
          </View>
          <Text className="font-cairo text-xs text-inksoft">
            {dateLabel(tx.spent_at, lang, numerals)}
          </Text>
        </View>
      </View>
      {whoLine ? (
        <Text className="mt-1.5 font-cairo text-sm text-inksoft">{whoLine}</Text>
      ) : null}
      <View className="mt-3 flex-row gap-2">
        <Pressable
          accessibilityRole="button"
          onPress={() => onConfirm(tx)}
          className="flex-1 items-center rounded-full bg-primary py-2"
        >
          <Text className="font-cairo text-sm text-white">{t('confirm', lang)}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => onEdit(tx)}
          className="flex-1 items-center rounded-full border border-borderx bg-surface py-2"
        >
          <Text className="font-cairo text-sm text-ink">{t('edit', lang)}</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}
