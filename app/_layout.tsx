/**
 * Root layout: fonts, providers, RTL theming, launch gate.
 * Loads the Cairo font family, applies RTL + direction from the prefs
 * store, wraps the app in QueryClientProvider. Gates first paint on prefs
 * hydration; renders the Onboarding component instead of the navigator
 * until prefs.onboarded is true (M5). Registers /auth as a modal route
 * for guest → account upgrades from settings.
 * Used by: every screen (root of tree).
 */
import '@/global.css';
import '@/lib/i18n'; // ensure the prefs store hydrates before first paint
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { I18nManager, useColorScheme } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Cairo_400Regular, Cairo_600SemiBold, Cairo_700Bold } from '@expo-google-fonts/cairo';
import { usePrefs } from '@/lib/prefs';
import Onboarding from './onboarding';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1 } },
});

/** Root layout component. */
export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Cairo_400Regular,
    Cairo_600SemiBold,
    Cairo_700Bold,
  });
  const language = usePrefs((s) => s.language);
  const themePref = usePrefs((s) => s.theme);
  const hasHydrated = usePrefs((s) => s.hasHydrated);
  const onboarded = usePrefs((s) => s.onboarded);
  const colorScheme = useColorScheme();

  // RTL stays structural: set once language becomes Arabic (and stay on
  // reload), mirroring layout per ui-ux-plan "Arabic-first, RTL by default".
  useEffect(() => {
    const shouldBeRtl = language === 'ar';
    if (I18nManager.isRTL !== shouldBeRtl) {
      I18nManager.allowRTL(shouldBeRtl);
      I18nManager.forceRTL(shouldBeRtl);
    }
  }, [language]);

  const isDark = themePref === 'system' ? colorScheme === 'dark' : themePref === 'dark';
  const navTheme = isDark
    ? { ...DarkTheme, colors: { ...DarkTheme.colors, background: '#1E1114', primary: '#F43F5E', card: '#2B1A1F', text: '#FCE9ED', border: '#472830' } }
    : { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: '#FFF1F3', primary: '#F43F5E', card: '#FFFFFF', text: '#3B1D26', border: '#FBD5DC' } };

  // Gate: nothing until fonts + persisted prefs are ready.
  if (!fontsLoaded || !hasHydrated) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={navTheme}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        {onboarded ? (
          <Stack
            screenOptions={{
              headerShown: false,
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="capture" />
            <Stack.Screen name="auth" options={{ presentation: 'modal' }} />
          </Stack>
        ) : (
          <Onboarding />
        )}
      </ThemeProvider>
    </QueryClientProvider>
  );
}
