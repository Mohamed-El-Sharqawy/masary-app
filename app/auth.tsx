/**
 * AUTH modal screen — email sign-in / sign-up form (Cairo, RTL, MSA copy).
 * Presented from onboarding inside a RN Modal (props onDone/onCancel) and
 * registered as the /auth modal route (expo-router) for later guest →
 * account upgrades. On success: mark onboarded + close.
 * Used by: app/onboarding.tsx (AuthCard), app/_layout.tsx Stack (/auth).
 */
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { t, usePrefs } from '@/lib/i18n';
import { signIn, signUp } from '@/lib/supabase';

interface AuthScreenProps {
  /** Called on auth success (marks onboarding complete). */
  onDone?: () => void;
  /** Closes the modal (RN Modal wrapper or router back for the route). */
  onCancel?: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Map supabase auth errors to short MSA messages; null = generic. */
function authErrorMessage(raw: string, lang: 'ar' | 'en'): string {
  const l = raw.toLowerCase();
  if (l.includes('invalid login') || l.includes('credentials'))
    return t('auth_error_credentials', lang);
  if (l.includes('already registered') || l.includes('already exists'))
    return t('auth_error_email_taken', lang);
  if (l.includes('password') && (l.includes('least') || l.includes('short')))
    return t('auth_error_weak_password', lang);
  if (l.includes('email')) return t('auth_error_invalid_email', lang);
  return t('error_generic', lang);
}

/** Email + password auth form — sign-in / sign-up toggle, inline errors. */
export function AuthScreen({ onDone, onCancel }: AuthScreenProps) {
  const lang = usePrefs((s) => s.language);
  const setOnboarded = usePrefs((s) => s.setOnboarded);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState(false);

  const close = () => (onCancel ? onCancel() : router.back());
  const complete = () => {
    onDone?.();
    setOnboarded(true);
    close();
  };

  const submit = async () => {
    setError(null);
    if (!EMAIL_RE.test(email.trim())) {
      setError(t('auth_error_invalid_email', lang));
      return;
    }
    if (password.length < 6) {
      setError(t('auth_error_weak_password', lang));
      return;
    }
    setBusy(true);
    try {
      if (pendingConfirm) {
        complete();
        return;
      }
      if (mode === 'signin') {
        await signIn(email.trim(), password);
        complete();
      } else {
        const user = await signUp(email.trim(), password);
        if (user) complete();
        else setPendingConfirm(true); // confirmation email sent — no session yet
      }
    } catch (e) {
      setError(authErrorMessage(e instanceof Error ? e.message : '', lang));
    } finally {
      setBusy(false);
    }
  };

  const isSignup = mode === 'signup';

  return (
    <SafeAreaView className="flex-1 bg-cream" edges={['top']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerClassName="flex-grow px-5 py-4" keyboardShouldPersistTaps="handled">
          <View className="flex-row items-center justify-between">
            <Text className="font-cairo text-2xl font-bold text-ink">
              {isSignup ? t('create_account', lang) : t('auth_signin_title', lang)}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={close}
              className="rounded-full bg-chip px-4 py-1.5"
            >
              <Text className="font-cairo text-xs text-ink">{t('auth_close', lang)}</Text>
            </Pressable>
          </View>

          <View className="mt-6" style={{ gap: 12 }}>
            <Text className="font-cairo text-sm text-inksoft">{t('auth_email_label', lang)}</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              className="rounded-2xl border border-borderx bg-surface px-4 py-3 font-cairo text-base text-ink"
              accessibilityLabel={t('auth_email_label', lang)}
            />
            <Text className="font-cairo text-sm text-inksoft">
              {t('auth_password_label', lang)}
            </Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete={isSignup ? 'new-password' : 'password'}
              className="rounded-2xl border border-borderx bg-surface px-4 py-3 font-cairo text-base text-ink"
              accessibilityLabel={t('auth_password_label', lang)}
            />
          </View>

          {pendingConfirm ? (
            <Text className="mt-4 font-cairo text-sm text-success">
              {t('auth_check_email', lang)}
            </Text>
          ) : null}
          {error ? (
            <Text className="mt-4 font-cairo text-sm text-destructive">{error}</Text>
          ) : null}

          <View className="mt-auto pt-6" style={{ gap: 12 }}>
            <Pressable
              accessibilityRole="button"
              onPress={() => void submit()}
              disabled={busy}
              className="items-center rounded-full bg-primary px-5 py-3.5"
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text className="font-cairo text-base text-white">
                  {pendingConfirm
                    ? t('onboarding_start', lang)
                    : isSignup
                      ? t('create_account', lang)
                      : t('auth_signin_title', lang)}
                </Text>
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setError(null);
                setPendingConfirm(false);
                setMode(isSignup ? 'signin' : 'signup');
              }}
              className="items-center py-1"
            >
              <Text className="font-cairo text-sm text-primary">
                {isSignup ? t('auth_switch_to_signin', lang) : t('auth_switch_to_signup', lang)}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** /auth modal route — same form; closes via router.back(). */
export default function AuthRoute() {
  return <AuthScreen />;
}
