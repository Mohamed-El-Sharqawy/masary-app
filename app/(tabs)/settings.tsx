/**
 * SETTINGS screen — M5 (ui-ux-plan §6 settings spec, technical-plan §8 M5).
 * Sectioned flat cards on bg-cream: الحساب (signed-in email + sign-out, or
 * guest card "أنت تستخدم الوضع الضيف" with ترقية الحساب → /auth email auth;
 * the upgrade triggers the one-time local→cloud merge via mergeLocalToCloud),
 * اللغة / الأرقام radio rows, العملة الافتراضية expandable selector,
 * النسخ الاحتياطي (export → share sheet, import → document picker + confirm
 * dialog), المزامنة pending count + مزامنة الآن (signed-in only, hidden for
 * guests), حول (app version from app.json via expo-constants + tagline).
 * Every control persists immediately. Flat Flamingo, RTL, Cairo.
 * Used by: app/(tabs)/_layout.tsx (tab 3).
 */
import Constants from 'expo-constants';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { Row } from '@/components/settings/Row';
import { Section } from '@/components/settings/Section';
import { CURRENCIES, CURRENCY_AR } from '@/constants';
import { exportBackup, importBackup } from '@/lib/backup';
import { useAuth } from '@/lib/auth-store';
import { signOut } from '@/lib/supabase';
import { mergeLocalToCloud, syncNow } from '@/lib/sync';
import { useSettings } from '@/hooks/useSettings';
import { useSyncStatus } from '@/hooks/useSyncStatus';
import { t } from '@/lib/i18n';
import { toEasternDigits } from '@/utils/numerals';

/** Busy flag for the three async actions (disables re-entry). */
type Busy = 'export' | 'import' | 'sync' | null;

/** Settings tab screen. */
export default function SettingsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { language, numerals, defaultCurrency, setLanguage, setNumerals, setDefaultCurrency } =
    useSettings();
  const lang = language;
  const mode = useAuth((s) => s.mode);
  const userEmail = useAuth((s) => s.user?.email ?? null);
  const { pending, synced } = useSyncStatus();
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);

  // One-time guest → account merge (ui-ux-plan §5-٦): fires the first time
  // this screen mounts while signed in — i.e., right after the upgrade flow
  // returns from /auth. Re-arms after a sign-out.
  const mergeStarted = useRef(false);
  useEffect(() => {
    if (mode === 'signed_in') {
      if (mergeStarted.current) return;
      mergeStarted.current = true;
      void mergeLocalToCloud()
        .then(() => queryClient.invalidateQueries({ queryKey: ['sync-status'] }))
        .catch(() => undefined);
    } else {
      mergeStarted.current = false;
    }
  }, [mode, queryClient]);

  const version = Constants.expoConfig?.version ?? '1.0.0';
  const versionText = numerals === 'eastern' ? toEasternDigits(version) : version;
  const pendingCount = numerals === 'eastern' ? toEasternDigits(String(pending)) : String(pending);

  /** Sign out: end the Supabase session; local data stays on device. */
  const onSignOut = async () => {
    try {
      await signOut();
      await queryClient.invalidateQueries({ queryKey: ['sync-status'] });
    } catch {
      Alert.alert(t('error_generic', lang));
    }
  };

  /** Push dirty rows now, then refresh the pending badge. */
  const onSyncNow = async () => {
    if (busy) return;
    setBusy('sync');
    try {
      await syncNow();
      await queryClient.invalidateQueries({ queryKey: ['sync-status'] });
    } catch {
      Alert.alert(t('error_generic', lang));
    } finally {
      setBusy(null);
    }
  };

  /** Dump SQLite to JSON and open the OS share sheet. */
  const onExport = async () => {
    if (busy) return;
    setBusy('export');
    try {
      await exportBackup();
    } catch {
      Alert.alert(t('error_generic', lang));
    } finally {
      setBusy(null);
    }
  };

  /** Read + restore the picked backup file (confirm dialog before overwrite). */
  const restoreFile = async (uri: string) => {
    setBusy('import');
    try {
      const text = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      await importBackup(JSON.parse(text));
      await queryClient.invalidateQueries({ queryKey: ['sync-status'] });
      Alert.alert(t('import_success', lang));
    } catch {
      Alert.alert(t('error_generic', lang));
    } finally {
      setBusy(null);
    }
  };

  /** Pick a backup JSON, then ask for confirmation before restoring. */
  const onImport = async () => {
    if (busy) return;
    const res = await DocumentPicker.getDocumentAsync({
      type: ['application/json', 'application/octet-stream', 'text/plain'],
      copyToCacheDirectory: true,
    });
    const asset = res.canceled ? null : res.assets[0];
    if (!asset) return;
    Alert.alert(t('import_confirm_title', lang), t('import_confirm_body', lang), [
      { text: t('cancel', lang), style: 'cancel' },
      { text: t('confirm', lang), style: 'default', onPress: () => void restoreFile(asset.uri) },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-cream" edges={['top']}>
      <ScrollView contentContainerClassName="p-5 pb-10">
        <Text className="font-cairo text-2xl font-bold text-ink">{t('tab_settings', lang)}</Text>

        {/* الحساب — signed-in identity card or guest upgrade card */}
        <Section title={t('account', lang)}>
          {mode === 'signed_in' ? (
            <View className="px-4 py-4">
              <Text className="font-cairo text-base text-ink" numberOfLines={1}>
                {userEmail ?? '—'}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => void onSignOut()}
                className="mt-4 items-center rounded-full border border-destructive bg-surface px-5 py-2.5"
              >
                <Text className="font-cairo text-sm font-bold text-destructive">
                  {t('sign_out', lang)}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View className="px-4 py-4">
              <Text className="font-cairo text-base text-ink">{t('guest_mode_note', lang)}</Text>
              <Text className="mt-1 font-cairo text-sm text-inksoft">
                {t('guest_privacy_note', lang)}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/auth')}
                className="mt-4 items-center rounded-full bg-primary px-5 py-2.5"
              >
                <Text className="font-cairo text-sm font-bold text-white">
                  {t('upgrade_account', lang)}
                </Text>
              </Pressable>
            </View>
          )}
        </Section>

        {/* اللغة — radio rows */}
        <Section title={t('language', lang)}>
          <Row
            label={t('lang_ar', lang)}
            selected={language === 'ar'}
            onPress={() => setLanguage('ar')}
          />
          <Row
            label={t('lang_en', lang)}
            selected={language === 'en'}
            onPress={() => setLanguage('en')}
            last
          />
        </Section>

        {/* الأرقام — radio rows with live previews */}
        <Section title={t('numerals', lang)}>
          <Row
            label={t('numerals_western', lang)}
            value="0123"
            selected={numerals === 'western'}
            onPress={() => setNumerals('western')}
          />
          <Row
            label={t('numerals_eastern', lang)}
            value="٠١٢٣"
            selected={numerals === 'eastern'}
            onPress={() => setNumerals('eastern')}
            last
          />
        </Section>

        {/* العملة الافتراضية — expandable selector */}
        <Section title={t('default_currency', lang)}>
          <Row
            label={`${CURRENCY_AR[defaultCurrency]} ${defaultCurrency}`}
            chevron
            onPress={() => setCurrencyOpen((v) => !v)}
            last={!currencyOpen}
          />
          {currencyOpen
            ? CURRENCIES.map((c, i) => (
                <Row
                  key={c}
                  label={`${CURRENCY_AR[c]} ${c}`}
                  selected={c === defaultCurrency}
                  last={i === CURRENCIES.length - 1}
                  onPress={() => {
                    setDefaultCurrency(c);
                    setCurrencyOpen(false);
                  }}
                />
              ))
            : null}
        </Section>

        {/* النسخ الاحتياطي — export (share sheet) + import (document picker) */}
        <Section title={t('backup_section', lang)}>
          <Row
            label={t('export_backup', lang)}
            onPress={() => void onExport()}
            right={busy === 'export' ? <ActivityIndicator size="small" color="#F43F5E" /> : undefined}
          />
          <Row
            label={t('import_backup', lang)}
            onPress={() => void onImport()}
            last
            right={busy === 'import' ? <ActivityIndicator size="small" color="#F43F5E" /> : undefined}
          />
        </Section>

        {/* المزامنة — signed-in only, hidden entirely for guests */}
        {mode === 'signed_in' ? (
          <Section title={t('sync_section', lang)}>
            <Row
              label={synced ? t('synced', lang) : t('pending_sync', lang)}
              value={synced ? undefined : pendingCount}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => void onSyncNow()}
              disabled={busy === 'sync'}
              className="flex-row items-center justify-center gap-2 border-t border-borderx py-3"
            >
              {busy === 'sync' ? <ActivityIndicator size="small" color="#F43F5E" /> : null}
              <Text className="font-cairo text-sm font-bold text-primary">
                {t('sync_now', lang)}
              </Text>
            </Pressable>
          </Section>
        ) : null}

        {/* حول — version (app.json via expo-constants) + مصاري tagline */}
        <Section title={t('about', lang)}>
          <Row label={t('version', lang)} value={versionText} />
          <View className="px-4 py-4">
            <Text className="font-cairo text-lg font-bold text-ink">مصاري</Text>
            <Text className="mt-1 font-cairo text-sm leading-6 text-inksoft">
              {t('welcome_pitch', lang)}
            </Text>
          </View>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}
