/**
 * Onboarding final-step account entry card (Flamingo, flat).
 * Email button opens the auth modal (via onEmail), Google/Apple go through
 * lib/supabase.ts OAuth helpers, guest stays local-only (continueAsGuest
 * then onDone marks onboarding complete). Inline MSA error line on failure.
 * Used by: app/onboarding.tsx (page 3).
 */
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { t, usePrefs } from '@/lib/i18n';
import { continueAsGuest, signInWithApple, signInWithGoogle } from '@/lib/supabase';

interface AuthCardProps {
  /** Opens the email sign-in/up modal (app/auth.tsx). */
  onEmail: () => void;
  /** Marks onboarding complete — called after guest or OAuth success. */
  onDone: () => void;
}

/** Flat full-width label row button (Cairo). */
function AuthRow({
  label,
  onPress,
  primary,
  disabled,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      className={`items-center rounded-full px-5 py-3.5 ${
        primary ? 'bg-primary' : 'border border-borderx bg-surface'
      }`}
    >
      <Text className={`font-cairo text-base ${primary ? 'text-white' : 'text-ink'}`}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Account entry card shown on the last onboarding page. */
export function AuthCard({ onEmail, onDone }: AuthCardProps) {
  const lang = usePrefs((s) => s.language);
  const [busy, setBusy] = useState<null | 'google' | 'apple'>(null);
  const [error, setError] = useState<string | null>(null);

  const runOauth = async (provider: 'google' | 'apple') => {
    setError(null);
    setBusy(provider);
    try {
      if (provider === 'google') await signInWithGoogle();
      else await signInWithApple();
      onDone();
    } catch {
      setError(t('error_generic', lang));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View className="rounded-3xl border border-borderx bg-surface p-5" style={{ gap: 10 }}>
      <AuthRow label={t('auth_email_button', lang)} onPress={onEmail} disabled={busy !== null} />
      <AuthRow
        label={t('auth_google_button', lang)}
        onPress={() => void runOauth('google')}
        disabled={busy !== null}
      />
      <AuthRow
        label={t('auth_apple_button', lang)}
        onPress={() => void runOauth('apple')}
        disabled={busy !== null}
      />
      {busy ? <ActivityIndicator color="#F43F5E" /> : null}
      {error ? (
        <Text className="text-center font-cairo text-xs text-destructive">{error}</Text>
      ) : null}
      <View className="mt-1 items-center" style={{ gap: 4 }}>
        <Pressable accessibilityRole="button" onPress={() => { continueAsGuest(); onDone(); }}>
          <Text className="font-cairo text-sm text-primary">{t('continue_guest', lang)}</Text>
        </Pressable>
        <Text className="font-cairo text-xs text-inksoft">
          {t('guest_privacy_note', lang)}
        </Text>
      </View>
    </View>
  );
}
