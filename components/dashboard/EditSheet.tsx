/**
 * Transaction edit bottom sheet (ui-ux-plan §6 edit-sheet spec).
 * Slide-up via reanimated over a dimmed overlay, drag handle, bg-surface
 * rounded-t-3xl. Edits amount (decimal keypad, both numeral systems via
 * parseAmount), category chip grid, date (quick chips + DD/MM/YYYY validated
 * on the Cairo clock), notes. Save → services/mutations useUpdateTransaction
 * + success haptic + aggregates invalidation; delete is red and labeled with
 * a confirm alert. Used by: app/(tabs)/dashboard.tsx (recent row press).
 */
import { useState } from 'react';
import { Alert, Modal, Pressable, Text, TextInput, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  createAnimatedComponent,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import { useDeleteTransaction, useUpdateTransaction } from '@/services/mutations';
import { t, usePrefs } from '@/lib/i18n';
import { CATEGORIES, type Category, type Transaction } from '@/types';
import { CATEGORY_AR, CURRENCY_AR } from '@/constants';
import { amountToMinor, minorFactor } from '@/utils/currency';
import { normalizeNumerals, parseAmount } from '@/utils/numerals';
import { startOfDaysAgo } from '@/utils/dates';

const AnimatedPressable = createAnimatedComponent(Pressable);

/** Cairo is UTC+3 year-round (mirrors utils/dates APP_TZ). */
const CAIRO_OFFSET_MS = 3 * 3600_000;

/** Sheet-only copy (not in the shared i18n table — M4 additions). */
const SHEET_LABELS = {
  ar: {
    amount_invalid: 'أدخل مبلغًا صحيحًا أكبر من صفر',
    date_invalid: 'أدخل تاريخًا صحيحًا بصيغة يوم/شهر/سنة',
    dd_mm_yyyy: 'يوم/شهر/سنة — DD/MM/YYYY',
    delete_confirm_title: 'حذف المصروف',
    delete_confirm_body: 'سيُحذف هذا المصروف نهائيًا ولا يمكن التراجع',
  },
  en: {
    amount_invalid: 'Enter a valid amount greater than zero',
    date_invalid: 'Enter a valid date as DD/MM/YYYY',
    dd_mm_yyyy: 'DD/MM/YYYY',
    delete_confirm_title: 'Delete expense',
    delete_confirm_body: 'This expense will be deleted permanently',
  },
} as const;

interface EditSheetProps {
  tx: Transaction | null;
  onClose: () => void;
}

/** Modal wrapper — body remounts per transaction so fields reset cleanly. */
export function EditSheet({ tx, onClose }: EditSheetProps) {
  return (
    <Modal transparent visible={tx != null} animationType="none" onRequestClose={onClose}>
      {tx ? <SheetBody key={tx.id} tx={tx} onClose={onClose} /> : null}
    </Modal>
  );
}

/** Initial amount text: major units, trailing zeros trimmed, western digits. */
function initialAmount(tx: Transaction): string {
  const major = tx.amount_minor / minorFactor(tx.currency);
  return major.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

/** ISO → DD/MM/YYYY on the Cairo calendar. */
function toDdMmYyyy(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + CAIRO_OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(shifted.getUTCDate())}/${p(shifted.getUTCMonth() + 1)}/${shifted.getUTCFullYear()}`;
}

/** DD/MM/YYYY (either numeral system) → ISO at 12:00 Cairo, or null. */
function parseDdMmYyyy(input: string): string | null {
  const m = normalizeNumerals(input).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d, 9, 0, 0));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return dt.toISOString();
}

/** Quick-date chip options: اليوم · أمس · قبل يومين. */
const QUICK_DAYS = [0, 1, 2] as const;
const QUICK_KEYS = ['today', 'yesterday', 'day_before_yesterday'] as const;

function SheetBody({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const lang = usePrefs((s) => s.language);
  const update = useUpdateTransaction();
  const del = useDeleteTransaction();
  const qc = useQueryClient();
  const labels = SHEET_LABELS[lang];

  const [amount, setAmount] = useState(initialAmount(tx));
  const [category, setCategory] = useState<Category>(tx.category);
  const [dateStr, setDateStr] = useState(toDdMmYyyy(tx.spent_at));
  const [notes, setNotes] = useState(tx.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  const currencySymbol = CURRENCY_AR[tx.currency] ?? tx.currency;
  const whoLine = tx.merchant && tx.person ? `${tx.merchant} · ${tx.person}` : (tx.merchant ?? tx.person);

  function applyQuickDate(days: number) {
    setDateStr(toDdMmYyyy(startOfDaysAgo(days)));
  }

  function handleSave() {
    const parsed = parseAmount(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError(labels.amount_invalid);
      return;
    }
    const iso = parseDdMmYyyy(dateStr);
    if (!iso) {
      setError(labels.date_invalid);
      return;
    }
    setError(null);
    update.mutate(
      {
        id: tx.id,
        amount_minor: amountToMinor(parsed, tx.currency),
        currency: tx.currency,
        category,
        spent_at: iso,
        merchant: tx.merchant,
        person: tx.person,
        notes: notes.trim() ? notes.trim() : null,
      },
      {
        onSuccess: () => {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          void qc.invalidateQueries({ queryKey: ['aggregates'] });
          onClose();
        },
        onError: () => setError(t('error_generic', lang)),
      },
    );
  }

  function handleDelete() {
    Alert.alert(labels.delete_confirm_title, labels.delete_confirm_body, [
      { text: t('cancel', lang), style: 'cancel' },
      {
        text: t('delete', lang),
        style: 'destructive',
        onPress: () => {
          del.mutate(tx.id, {
            onSuccess: () => {
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              void qc.invalidateQueries({ queryKey: ['aggregates'] });
              onClose();
            },
          });
        },
      },
    ]);
  }

  return (
    <View className="flex-1 justify-end">
      <AnimatedPressable
        accessibilityLabel="close"
        entering={FadeIn.duration(150)}
        exiting={FadeOut.duration(150)}
        onPress={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <Animated.View
        entering={SlideInDown.duration(240)}
        exiting={SlideOutDown.duration(200)}
        className="rounded-t-3xl bg-surface px-5 pb-8 pt-2"
      >
        <Pressable accessibilityRole="button" accessibilityLabel="dismiss" onPress={onClose} className="self-center py-2.5">
          <View className="h-1.5 w-10 rounded-full bg-borderx" />
        </Pressable>
        <Text className="font-cairo text-xl font-bold text-ink">{t('edit_expense', lang)}</Text>

        <View className="mt-3 flex-row items-baseline justify-center gap-2">
          <TextInput
            className="min-w-0 flex-1 text-center font-cairo text-3xl font-bold text-ink"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            accessibilityLabel="amount"
          />
          <Text className="font-cairo text-lg text-inksoft">{currencySymbol}</Text>
        </View>

        <Text className="mt-4 font-cairo text-xs text-inksoft">{t('category_label', lang)}</Text>
        <View className="mt-2 flex-row flex-wrap gap-2">
          {CATEGORIES.map((c) => {
            const active = c === category;
            return (
              <Pressable
                key={c}
                accessibilityRole="button"
                onPress={() => {
                  setCategory(c);
                  void Haptics.selectionAsync().catch(() => {});
                }}
                className={`rounded-full px-3 py-1.5 ${active ? 'bg-primary' : 'bg-chip'}`}
              >
                <Text className={`font-cairo text-xs ${active ? 'text-white' : 'text-ink'}`}>
                  {CATEGORY_AR[c]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text className="mt-4 font-cairo text-xs text-inksoft">{t('date_label', lang)}</Text>
        <View className="mt-2 flex-row gap-2">
          {QUICK_DAYS.map((days, i) => (
            <Pressable
              key={days}
              accessibilityRole="button"
              onPress={() => applyQuickDate(days)}
              className="rounded-full bg-chip px-3 py-1.5"
            >
              <Text className="font-cairo text-xs text-ink">{t(QUICK_KEYS[i], lang)}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          className="mt-2 h-11 rounded-2xl border border-borderx bg-cream px-4 font-cairo text-sm text-ink"
          value={dateStr}
          onChangeText={setDateStr}
          keyboardType="numeric"
          placeholder={labels.dd_mm_yyyy}
          placeholderTextColor="#8A6B74"
          accessibilityLabel="date"
        />

        {whoLine ? (
          <Text className="mt-3 font-cairo text-xs text-inksoft">
            {t('merchant_person', lang)}: {whoLine}
          </Text>
        ) : null}

        <Text className="mt-4 font-cairo text-xs text-inksoft">{t('notes_label', lang)}</Text>
        <TextInput
          className="mt-2 min-h-[44px] rounded-2xl border border-borderx bg-cream px-4 py-2 font-cairo text-sm text-ink"
          value={notes}
          onChangeText={setNotes}
          multiline
          accessibilityLabel="notes"
        />

        {tx.raw_input ? (
          <Text className="mt-2 font-cairo text-[11px] text-inksoft" numberOfLines={1}>
            «{tx.raw_input}»
          </Text>
        ) : null}

        {error ? <Text className="mt-3 font-cairo text-xs text-destructive">{error}</Text> : null}

        <View className="mt-4 flex-row gap-2">
          <Pressable
            accessibilityRole="button"
            onPress={handleSave}
            disabled={update.isPending}
            className={`flex-1 items-center rounded-full bg-primary py-2.5 ${update.isPending ? 'opacity-60' : ''}`}
          >
            <Text className="font-cairo text-sm text-white">{t('save', lang)}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            className="flex-1 items-center rounded-full border border-borderx bg-surface py-2.5"
          >
            <Text className="font-cairo text-sm text-ink">{t('cancel', lang)}</Text>
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={handleDelete}
          className="mt-4 self-center rounded-full border border-destructive px-6 py-2"
        >
          <Text className="font-cairo text-sm text-destructive">{t('delete', lang)}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}
