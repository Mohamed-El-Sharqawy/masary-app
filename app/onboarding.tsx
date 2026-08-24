/**
 * ONBOARDING screen — one-shot 3-page intro (value · voice · privacy),
 * per docs/ui-ux-plan §9-5 and technical-plan §8 M5. Simple index state +
 * RN Animated slide (RTL-aware), subtle 150ms entrances, page dots, skip,
 * التالي / ابدأ. Final page hosts AuthCard (email / Google / Apple /
 * guest) and a Western/Eastern numerals preview toggle. Rendered by
 * app/_layout.tsx until prefs.onboarded flips true; never re-shown after.
 * Also a no-op /onboarding route for expo-router file discovery.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  I18nManager,
  Modal,
  Pressable,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthCard } from '@/components/onboarding/AuthCard';
import { AuthScreen } from './auth';
import { t, usePrefs } from '@/lib/i18n';
import { continueAsGuest } from '@/lib/supabase';

const PAGE_COUNT = 3;

/** Flat illustration placeholder tile — large emoji on bg-cream. */
function HeroTile({ emoji }: { emoji: string }) {
  return (
    <View className="items-center justify-center self-center rounded-full border border-borderx bg-cream"
      style={{ width: 168, height: 168 }}
    >
      <Text style={{ fontSize: 72, lineHeight: 96 }}>{emoji}</Text>
    </View>
  );
}

/** One bullet row: flat primary dot + MSA copy. */
function Bullet({ text }: { text: string }) {
  return (
    <View className="flex-row items-center gap-3">
      <View className="h-2.5 w-2.5 rounded-full bg-primary" />
      <Text className="flex-1 font-cairo text-base text-ink">{text}</Text>
    </View>
  );
}

/** Numerals preview chip — Western 0123 / Eastern ٠١٢٣, tap to set pref. */
function NumeralChip({
  label,
  sample,
  active,
  onPress,
}: {
  label: string;
  sample: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`flex-1 items-center rounded-2xl px-4 py-3 ${
        active ? 'bg-primary' : 'border border-borderx bg-surface'
      }`}
    >
      <Text className={`font-cairo text-xl ${active ? 'text-white' : 'text-ink'}`}>{sample}</Text>
      <Text className={`font-cairo text-xs ${active ? 'text-white' : 'text-inksoft'}`}>{label}</Text>
    </Pressable>
  );
}

/** Onboarding pager — shown by the root layout until onboarded. */
export default function Onboarding() {
  const lang = usePrefs((s) => s.language);
  const numerals = usePrefs((s) => s.numerals);
  const setNumerals = usePrefs((s) => s.setNumerals);
  const setOnboarded = usePrefs((s) => s.setOnboarded);
  const [index, setIndex] = useState(0);
  const [showAuth, setShowAuth] = useState(false);

  // Subtle 150ms entrance: fade + slide from the leading edge (RTL mirrors).
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    enter.setValue(0);
    Animated.timing(enter, {
      toValue: 1,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }, [index, enter]);
  const dir = I18nManager.isRTL ? -1 : 1;
  const isLast = index === PAGE_COUNT - 1;

  const next = () => setIndex((i) => Math.min(i + 1, PAGE_COUNT - 1));
  const finishAsGuest = () => {
    continueAsGuest();
    setOnboarded(true);
  };

  const titleKey =
    index === 0 ? 'onboarding_value_title' : index === 1 ? 'onboarding_voice_title' : 'onboarding_privacy_title';

  return (
    <SafeAreaView className="flex-1 bg-cream" edges={['top', 'bottom']}>
      {/* Header: page title + skip */}
      <View className="flex-row items-center justify-between px-5 pt-2">
        <Text className="font-cairo text-lg font-bold text-ink">{t(titleKey, lang)}</Text>
        {!isLast ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setIndex(PAGE_COUNT - 1)}
            className="rounded-full bg-chip px-4 py-1.5"
          >
            <Text className="font-cairo text-xs text-inksoft">{t('onboarding_skip', lang)}</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Page body with entrance animation */}
      <Animated.View
        key={index}
        className="flex-1 justify-center px-6"
        style={{
          opacity: enter,
          transform: [
            { translateX: enter.interpolate({ inputRange: [0, 1], outputRange: [dir * 24, 0] }) },
            { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) },
          ],
        }}
      >
        {index === 0 ? (
          <View className="items-center" style={{ gap: 20 }}>
            <HeroTile emoji="💬" />
            <Text className="font-cairo text-5xl font-bold text-primary">مصاري</Text>
            <Text className="text-center font-cairo text-base text-inksoft">
              {t('onboarding_tagline', lang)}
            </Text>
          </View>
        ) : null}

        {index === 1 ? (
          <View style={{ gap: 24 }}>
            <HeroTile emoji="🎤" />
            <View style={{ gap: 14 }}>
              <Bullet text={t('onboarding_bullet_voice', lang)} />
              <Bullet text={t('onboarding_bullet_extract', lang)} />
              <Bullet text={t('onboarding_bullet_confirm', lang)} />
            </View>
          </View>
        ) : null}

        {index === 2 ? (
          <View style={{ gap: 20 }}>
            <View className="rounded-3xl border border-borderx bg-surface p-5" style={{ gap: 10 }}>
              <Text className="font-cairo text-base font-bold text-ink">
                {t('onboarding_privacy_local', lang)}
              </Text>
              <Text className="font-cairo text-sm text-inksoft">
                {t('onboarding_privacy_sync', lang)}
              </Text>
              <Text className="font-cairo text-xs text-inksoft">
                {t('onboarding_privacy_body', lang)}
              </Text>
            </View>

            <View style={{ gap: 10 }}>
              <Text className="font-cairo text-sm text-inksoft">
                {t('onboarding_numerals_label', lang)}
              </Text>
              <View className="flex-row" style={{ gap: 10 }}>
                <NumeralChip
                  label={t('onboarding_numerals_western', lang)}
                  sample="0123"
                  active={numerals === 'western'}
                  onPress={() => setNumerals('western')}
                />
                <NumeralChip
                  label={t('onboarding_numerals_eastern', lang)}
                  sample="٠١٢٣"
                  active={numerals === 'eastern'}
                  onPress={() => setNumerals('eastern')}
                />
              </View>
            </View>

            <AuthCard onEmail={() => setShowAuth(true)} onDone={() => setOnboarded(true)} />
          </View>
        ) : null}
      </Animated.View>

      {/* Footer: dots + التالي / ابدأ */}
      <View className="items-center px-6 pb-4" style={{ gap: 16 }}>
        <View className="flex-row" style={{ gap: 6 }}>
          {Array.from({ length: PAGE_COUNT }, (_, i) => (
            <View
              key={i}
              className={`h-2 rounded-full ${i === index ? 'w-6 bg-primary' : 'w-2 bg-borderx'}`}
            />
          ))}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={isLast ? finishAsGuest : next}
          className="w-full items-center rounded-full bg-primary px-5 py-3.5"
        >
          <Text className="font-cairo text-base text-white">
            {isLast ? t('onboarding_start', lang) : t('onboarding_next', lang)}
          </Text>
        </Pressable>
      </View>

      {/* Email sign-in/up modal (app/auth.tsx screen) */}
      <Modal visible={showAuth} animationType="slide" onRequestClose={() => setShowAuth(false)}>
        <AuthScreen onDone={() => setOnboarded(true)} onCancel={() => setShowAuth(false)} />
      </Modal>
    </SafeAreaView>
  );
}
