/**
 * DASHBOARD screen — M4 aggregates UI (technical-plan §5/§8-M4,
 * ui-ux-plan §6): period pills (هذا الشهر / الشهر الماضي / 3 أشهر),
 * EGP total card with FX-snapshot line, category donut (react-native-svg,
 * flat Flamingo slices, Cairo-bold center total), amber daily bars,
 * top merchants, recent transactions (row press → EditSheet), empty state
 * with example chips, pull-to-refresh invalidating aggregate queries.
 * Used by: app/(tabs)/_layout.tsx (tab 2).
 */
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import Animated, { FadeInUp } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { EditSheet } from '@/components/dashboard/EditSheet';
import { ExampleChips } from '@/components/chat/ExampleChips';
import { dailyTotals, monthlySummary, topMerchants } from '@/lib/aggregates';
import type { DailyTotal, MonthlySummary, TopMerchant } from '@/lib/aggregates';
import { useRecentTransactions } from '@/services/queries';
import { useSyncStatus } from '@/hooks/useSyncStatus';
import { t, usePrefs } from '@/lib/i18n';
import { CATEGORY_AR, CATEGORY_COLORS, CURRENCY_AR } from '@/constants';
import { formatMinor, toEasternDigits } from '@/utils/numerals';
import { startOfDaysAgo, startOfToday } from '@/utils/dates';
import type { AppLanguage, Category, NumeralSystem, Transaction } from '@/types';

/** Cairo is UTC+3 year-round (mirrors utils/dates APP_TZ). */
const CAIRO_OFFSET_MS = 3 * 3600_000;

const MONTHS: Record<AppLanguage, string[]> = {
  ar: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};

/** Dashboard-only copy (M4 additions, not in the shared i18n table). */
const DASH_LABELS: Record<AppLanguage, Record<string, string>> = {
  ar: {
    this_month: 'هذا الشهر',
    last_month: 'الشهر الماضي',
    q3: '3 أشهر',
    last_3_label: 'آخر 3 أشهر',
    by_category: 'حسب الفئة',
    daily: 'المصروف اليومي',
    merchants: 'أكثر المتاجر',
    recent: 'أحدث المصروفات',
    rest_categories: 'فئات أخرى',
    loading: 'جاري التحميل…',
    no_merchants: 'لا توجد متاجر مسجلة في هذه الفترة',
    operations: 'عمليات',
  },
  en: {
    this_month: 'This month',
    last_month: 'Last month',
    q3: '3 months',
    last_3_label: 'Last 3 months',
    by_category: 'By category',
    daily: 'Daily spend',
    merchants: 'Top merchants',
    recent: 'Recent expenses',
    rest_categories: 'Other categories',
    loading: 'Loading…',
    no_merchants: 'No merchants recorded in this period',
    operations: 'expenses',
  },
};

type Period = 'this' | 'last' | 'q3';

interface MonthRef {
  year: number;
  month: number;
}

/** Current (or k months back) year/month on the Cairo calendar. */
function cairoMonth(back: number): MonthRef[] {
  const shifted = new Date(Date.now() + CAIRO_OFFSET_MS);
  return Array.from({ length: back }, (_, i) => {
    const d = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() - i, 1));
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
  });
}

/** Month list each period reads (this: [now] · last: [prev] · q3: [m-2..now]). */
function periodMonths(period: Period): MonthRef[] {
  const back = cairoMonth(3);
  if (period === 'this') return [back[0]];
  if (period === 'last') return [back[1]];
  return back;
}

/** Western digits, or Eastern when the user's numeral pref says so. */
function numStr(n: number | string, system: NumeralSystem): string {
  const s = String(n);
  return system === 'eastern' ? toEasternDigits(s) : s;
}

/** Relative date label for recent rows: اليوم · أمس · قبل يومين · ISO date. */
function dateLabel(iso: string, lang: AppLanguage, system: NumeralSystem): string {
  const spent = new Date(iso).getTime();
  if (spent >= new Date(startOfToday()).getTime()) return t('today', lang);
  if (spent >= new Date(startOfDaysAgo(1)).getTime()) return t('yesterday', lang);
  if (spent >= new Date(startOfDaysAgo(2)).getTime()) return t('day_before_yesterday', lang);
  const isoDate = iso.slice(0, 10);
  return system === 'eastern' ? toEasternDigits(isoDate) : isoDate;
}

interface Slice {
  key: string;
  label: string;
  total_minor: number;
}

interface DonutProps {
  slices: Slice[];
  centerValue: string;
}

/** Flat segmented donut — hard color stops, no gradients (ui-ux-plan §6). */
function CategoryDonut({ slices, centerValue }: DonutProps) {
  const size = 120;
  const stroke = 16;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = slices.reduce((acc, s) => acc + s.total_minor, 0);
  let offset = 0;
  const arcs = slices.map((s, i) => {
    const len = total > 0 ? (s.total_minor / total) * c : 0;
    const arc = {
      color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
      len,
      gap: c - len,
      start: offset,
    };
    offset += len;
    return arc;
  });
  return (
    <View>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#FFE1E7" strokeWidth={stroke} />
        {arcs.map((a, i) =>
          a.len > 0 ? (
            <Circle
              key={slices[i].key}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={a.color}
              strokeWidth={stroke}
              strokeDasharray={`${a.len} ${a.gap}`}
              strokeDashoffset={-a.start}
              strokeLinecap="butt"
            />
          ) : null,
        )}
      </Svg>
      <View className="absolute inset-0 items-center justify-center">
        <Text className="font-cairo text-base font-bold text-ink">{centerValue}</Text>
        <Text className="font-cairo text-[10px] text-inksoft">{CURRENCY_AR.EGP}</Text>
      </View>
    </View>
  );
}

interface BarsProps {
  data: DailyTotal[];
  numerals: NumeralSystem;
}

/** Daily bars — rounded tops, amber; deepest amber marks the max day. */
function DailyBars({ data, numerals }: BarsProps) {
  const height = 96;
  const max = data.reduce((m, d) => Math.max(m, d.total_minor), 0);
  const marked = [1, 5, 10, 15, 20, 25, 30];
  return (
    <View>
      <View className="flex-row items-end gap-[2px]" style={{ height }}>
        {data.map((d) => {
          const isMax = max > 0 && d.total_minor === max;
          const h = d.total_minor === 0 ? 2 : Math.max(4, Math.round((d.total_minor / max) * height));
          return (
            <View
              key={d.day}
              className="flex-1"
              style={{
                height: h,
                borderRadius: 3,
                backgroundColor: d.total_minor === 0 ? '#FFE1E7' : isMax ? '#D97706' : '#F59E0B',
              }}
            />
          );
        })}
      </View>
      <View className="mt-1 flex-row">
        {data.map((d) => (
          <Text key={d.day} className="flex-1 text-center font-cairo text-[9px] text-inksoft">
            {marked.includes(d.day) ? numStr(d.day, numerals) : ''}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** Dashboard tab screen. */
export default function DashboardScreen() {
  const lang = usePrefs((s) => s.language);
  const numerals = usePrefs((s) => s.numerals);
  const labels = DASH_LABELS[lang];
  const { synced } = useSyncStatus();
  const recentQ = useRecentTransactions(8);
  const qc = useQueryClient();
  const router = useRouter();
  const [period, setPeriod] = useState<Period>('this');
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const months = useMemo(() => periodMonths(period), [period]);

  const summaryQs = useQueries({
    queries: months.map((m) => ({
      queryKey: ['aggregates', 'monthly-summary', m.year, m.month],
      queryFn: (): Promise<MonthlySummary> => monthlySummary(m.year, m.month),
      staleTime: 60_000,
    })),
  });
  const dailyQs = useQueries({
    queries: months.map((m) => ({
      queryKey: ['aggregates', 'daily-totals', m.year, m.month],
      queryFn: (): Promise<DailyTotal[]> => dailyTotals(m.year, m.month),
      staleTime: 60_000,
    })),
  });
  const merchantQs = useQueries({
    queries: months.map((m) => ({
      queryKey: ['aggregates', 'top-merchants', m.year, m.month, 5],
      queryFn: (): Promise<TopMerchant[]> => topMerchants(m.year, m.month, 5),
      staleTime: 60_000,
    })),
  });

  const loading =
    recentQ.isPending ||
    summaryQs.some((q) => q.isPending) ||
    dailyQs.some((q) => q.isPending) ||
    merchantQs.some((q) => q.isPending);

  const merged = useMemo(() => {
    const summaries = summaryQs
      .map((q) => q.data)
      .filter((s): s is MonthlySummary => s != null);
    const catMap = new Map<Category, number>();
    for (const s of summaries) {
      for (const c of s.by_category) catMap.set(c.category, (catMap.get(c.category) ?? 0) + c.total_minor);
    }
    const total = summaries.reduce((acc, s) => acc + s.total_minor, 0);
    const byCategory = [...catMap.entries()]
      .map(([category, total_minor]) => ({ category, total_minor }))
      .sort((a, b) => b.total_minor - a.total_minor);

    const nonEgpParts = summaries
      .map((s) => s.non_egp)
      .filter((n): n is NonNullable<MonthlySummary['non_egp']> => n != null);
    const currencies = new Set<string>();
    let nonEgpTotal = 0;
    let rateWeight = 0;
    let rateDiv = 0;
    for (const n of nonEgpParts) {
      n.currencies.forEach((c) => currencies.add(c));
      nonEgpTotal += n.total_minor;
      if (n.weighted_rate != null && n.total_minor > 0) {
        rateWeight += n.weighted_rate * n.total_minor;
        rateDiv += n.total_minor;
      }
    }
    const nonEgp =
      nonEgpParts.length > 0
        ? {
            currencies: [...currencies].sort(),
            total_minor: nonEgpTotal,
            weighted_rate: rateDiv > 0 ? Math.round((rateWeight / rateDiv) * 10000) / 10000 : null,
          }
        : null;

    const dailies = dailyQs.map((q) => q.data).filter((d): d is DailyTotal[] => d != null);
    const dayCount = dailies.reduce((m, dv) => Math.max(m, dv.length), 0);
    const daily = Array.from({ length: dayCount }, (_, i) => ({
      day: i + 1,
      total_minor: dailies.reduce((acc, dv) => acc + (dv[i]?.total_minor ?? 0), 0),
    }));

    const mercMap = new Map<string, TopMerchant>();
    for (const list of merchantQs.map((q) => q.data).filter((l): l is TopMerchant[] => l != null)) {
      for (const m of list) {
        const prev = mercMap.get(m.name);
        if (prev) {
          prev.total_minor += m.total_minor;
          prev.count += m.count;
        } else {
          mercMap.set(m.name, { ...m });
        }
      }
    }
    const merchants = [...mercMap.values()].sort((a, b) => b.total_minor - a.total_minor).slice(0, 5);

    return { total, byCategory, nonEgp, daily, merchants };
  }, [summaryQs, dailyQs, merchantQs]);

  const slices = useMemo<Slice[]>(() => {
    const top: Slice[] = merged.byCategory.slice(0, 7).map((c) => ({
      key: c.category,
      label: CATEGORY_AR[c.category],
      total_minor: c.total_minor,
    }));
    const rest = merged.byCategory.slice(7).reduce((acc, c) => acc + c.total_minor, 0);
    if (rest > 0) top.push({ key: 'rest', label: labels.rest_categories, total_minor: rest });
    return top;
  }, [merged, labels]);

  const recent = recentQ.data ?? [];
  const isEmpty = !recentQ.isPending && recent.length === 0;

  const periodLabel = useMemo(() => {
    if (period === 'q3') return `${labels.last_3_label}`;
    const m = months[0];
    return `${MONTHS[lang][m.month - 1]} ${numStr(m.year, numerals)}`;
  }, [period, months, lang, numerals, labels]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['aggregates'] }),
      qc.invalidateQueries({ queryKey: ['transactions'] }),
      qc.invalidateQueries({ queryKey: ['sync-status'] }),
    ]);
    setRefreshing(false);
  }, [qc]);

  const fxLine =
    merged.nonEgp && merged.nonEgp.weighted_rate != null
      ? numStr(`1 USD = ${merged.nonEgp.weighted_rate.toFixed(2)} EGP`, numerals)
      : null;
  const equivalentLine =
    merged.nonEgp && merged.nonEgp.total_minor > 0
      ? lang === 'ar'
        ? `يشمل ما يعادل ${formatMinor(merged.nonEgp.total_minor, numerals)} ${CURRENCY_AR.EGP} من ${merged.nonEgp.currencies.join('، ')}`
        : `Includes ${formatMinor(merged.nonEgp.total_minor, numerals)} ${CURRENCY_AR.EGP} equivalent from ${merged.nonEgp.currencies.join(', ')}`
      : null;

  const periodDefs: { key: Period; label: string }[] = [
    { key: 'this', label: labels.this_month },
    { key: 'last', label: labels.last_month },
    { key: 'q3', label: labels.q3 },
  ];

  return (
    <SafeAreaView className="flex-1 bg-cream" edges={['top']}>
      <View className="flex-row items-center justify-between px-5 pb-3 pt-2">
        <Text className="font-cairo text-2xl font-bold text-ink">{t('tab_dashboard', lang)}</Text>
        <View className="rounded-full bg-chip px-3 py-1">
          <Text className="font-cairo text-xs text-inksoft">{synced ? t('synced', lang) : t('not_synced', lang)}</Text>
        </View>
      </View>
      <ScrollView
        contentContainerClassName="gap-4 px-5 pb-10"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#F43F5E" colors={['#F43F5E']} />
        }
      >
        <View className="flex-row gap-2">
          {periodDefs.map((p) => {
            const active = p.key === period;
            return (
              <Pressable
                key={p.key}
                accessibilityRole="button"
                onPress={() => {
                  setPeriod(p.key);
                  void Haptics.selectionAsync().catch(() => {});
                }}
                className={`flex-1 items-center rounded-full py-2 ${active ? 'bg-primary' : 'bg-chip'}`}
              >
                <Text className={`font-cairo text-sm ${active ? 'text-white' : 'text-ink'}`}>{p.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {loading ? (
          <Text className="self-center font-cairo text-sm text-inksoft">{labels.loading}</Text>
        ) : isEmpty ? (
          <View className="gap-4 rounded-3xl border border-borderx bg-surface p-6">
            <Text className="text-center font-cairo text-sm text-inksoft">{t('empty_dashboard', lang)}</Text>
            <ExampleChips onPress={() => router.navigate('/')} />
            <Pressable
              accessibilityRole="button"
              onPress={() => router.navigate('/')}
              className="self-center rounded-full bg-primary px-6 py-2.5"
            >
              <Text className="font-cairo text-sm text-white">{t('go_to_chat', lang)}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Animated.View
              entering={FadeInUp.duration(180)}
              className="rounded-3xl border border-borderx bg-surface p-5"
            >
              <Text className="font-cairo text-sm text-inksoft">
                {t('total_spend', lang)} — {periodLabel}
              </Text>
              <Text className="mt-1 font-cairo text-3xl font-bold text-ink">
                {formatMinor(merged.total, numerals)} {CURRENCY_AR.EGP}
              </Text>
              {equivalentLine ? (
                <Text className="mt-2 font-cairo text-xs text-inksoft">{equivalentLine}</Text>
              ) : null}
              {fxLine ? (
                <Text className="mt-1 font-cairo text-xs text-inksoft">
                  {lang === 'ar' ? `على أساس سعر ${fxLine}` : `Based on rate ${fxLine}`}
                </Text>
              ) : null}
            </Animated.View>

            {slices.length > 0 ? (
              <Animated.View
                entering={FadeInUp.duration(180).delay(60)}
                className="rounded-3xl border border-borderx bg-surface p-5"
              >
                <Text className="font-cairo text-sm font-bold text-ink">{labels.by_category}</Text>
                <View className="mt-3 flex-row items-center gap-4">
                  <CategoryDonut slices={slices} centerValue={formatMinor(merged.total, numerals)} />
                  <View className="flex-1 gap-1.5">
                    {slices.map((s, i) => (
                      <View key={s.key} className="flex-row items-center gap-2">
                        <View
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }}
                        />
                        <Text className="flex-1 font-cairo text-xs text-ink">{s.label}</Text>
                        <Text className="font-cairo text-xs text-inksoft">
                          {numStr(
                            merged.total > 0 ? Math.round((s.total_minor / merged.total) * 100) : 0,
                            numerals,
                          )}
                          %
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              </Animated.View>
            ) : null}

            <Animated.View
              entering={FadeInUp.duration(180).delay(120)}
              className="rounded-3xl border border-borderx bg-surface p-5"
            >
              <View className="flex-row items-center justify-between">
                <Text className="font-cairo text-sm font-bold text-ink">{labels.daily}</Text>
                <Text className="font-cairo text-xs text-inksoft">{periodLabel}</Text>
              </View>
              <View className="mt-3">
                <DailyBars data={merged.daily} numerals={numerals} />
              </View>
            </Animated.View>

            {merged.merchants.length > 0 ? (
              <Animated.View
                entering={FadeInUp.duration(180).delay(180)}
                className="rounded-3xl border border-borderx bg-surface p-5"
              >
                <Text className="font-cairo text-sm font-bold text-ink">{labels.merchants}</Text>
                <View className="mt-2 gap-2.5">
                  {merged.merchants.map((m) => (
                    <View key={m.name} className="flex-row items-center justify-between gap-3">
                      <View className="flex-1">
                        <Text className="font-cairo text-sm text-ink" numberOfLines={1}>
                          {m.name}
                        </Text>
                        <Text className="font-cairo text-[11px] text-inksoft">
                          {numStr(m.count, numerals)} {labels.operations}
                        </Text>
                      </View>
                      <Text className="font-cairo text-sm font-bold text-ink">
                        {formatMinor(m.total_minor, numerals)} {CURRENCY_AR.EGP}
                      </Text>
                    </View>
                  ))}
                </View>
              </Animated.View>
            ) : null}

            <Animated.View
              entering={FadeInUp.duration(180).delay(240)}
              className="rounded-3xl border border-borderx bg-surface p-5"
            >
              <Text className="font-cairo text-sm font-bold text-ink">{labels.recent}</Text>
              <View className="mt-2 gap-2.5">
                {recent.map((tx) => {
                  const frac = tx.amount_minor % 100 === 0 ? 0 : 2;
                  const symbol = CURRENCY_AR[tx.currency] ?? tx.currency;
                  const title = tx.merchant ?? tx.person ?? tx.notes ?? CATEGORY_AR[tx.category];
                  return (
                    <Pressable
                      key={tx.id}
                      accessibilityRole="button"
                      onPress={() => {
                        setEditing(tx);
                        void Haptics.selectionAsync().catch(() => {});
                      }}
                      className="flex-row items-center justify-between gap-3 rounded-2xl border border-borderx bg-surface px-4 py-3"
                    >
                      <View className="flex-1">
                        <View className="flex-row items-center gap-2">
                          <View className="rounded-full bg-chip px-2 py-0.5">
                            <Text className="font-cairo text-[11px] text-ink">{CATEGORY_AR[tx.category]}</Text>
                          </View>
                          <Text className="flex-1 font-cairo text-sm text-ink" numberOfLines={1}>
                            {title}
                          </Text>
                        </View>
                        <Text className="mt-1 font-cairo text-[11px] text-inksoft">
                          {dateLabel(tx.spent_at, lang, numerals)}
                        </Text>
                      </View>
                      <Text className="font-cairo text-base font-bold text-ink">
                        {formatMinor(tx.amount_minor, numerals, frac)} {symbol}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Animated.View>
          </>
        )}
      </ScrollView>
      <EditSheet tx={editing} onClose={() => setEditing(null)} />
    </SafeAreaView>
  );
}
