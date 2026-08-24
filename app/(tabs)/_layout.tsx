/**
 * Tab bar layout: المحادثة · لوحة التحكم · الإعدادات (RTL order).
 * Flat Flamingo styling, Cairo font, functional icons with labels.
 * Used by: root stack — the three main tabs of the app.
 */
import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { usePrefs, t } from '@/lib/i18n';

/** Colors for the tab bar (flat, no gradients). */
const TAB_COLORS = {
  active: '#F43F5E',
  inactive: '#8A6B74',
  bg: '#FFFFFF',
  border: '#FBD5DC',
};

/** Bottom tabs for the main app. */
export default function TabsLayout() {
  const lang = usePrefs((s) => s.language);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: TAB_COLORS.active,
        tabBarInactiveTintColor: TAB_COLORS.inactive,
        tabBarStyle: {
          backgroundColor: TAB_COLORS.bg,
          borderTopColor: TAB_COLORS.border,
        },
        tabBarLabelStyle: { fontFamily: 'Cairo_600SemiBold', fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tab_chat', lang),
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>💬</Text>,
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: t('tab_dashboard', lang),
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>📊</Text>,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tab_settings', lang),
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>⚙️</Text>,
        }}
      />
    </Tabs>
  );
}
