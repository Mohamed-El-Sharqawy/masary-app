/**
 * Settings section wrapper: MSA title + flat card (bg-surface, border-borderx,
 * rounded-3xl per the ui-ux-plan §6 settings spec). Children render as rows
 * inside the card (Row.tsx draws its own dividers). Flat, no gradients, Cairo.
 * Used by: app/(tabs)/settings.tsx (every settings section).
 */
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

interface SectionProps {
  /** MSA section title (e.g. الحساب، اللغة). */
  title: string;
  children: ReactNode;
}

/** One titled settings card. */
export function Section({ title, children }: SectionProps) {
  return (
    <View className="mt-6">
      <Text className="mb-2 px-1 font-cairo text-sm font-bold text-inksoft">{title}</Text>
      <View className="overflow-hidden rounded-3xl border border-borderx bg-surface">{children}</View>
    </View>
  );
}
