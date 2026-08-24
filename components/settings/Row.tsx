/**
 * Reusable settings row: optional leading icon + label on the start side;
 * end side shows a muted value, a direction-aware chevron, and/or a radio
 * indicator (when `selected` is provided) — or a fully custom `right` node.
 * Dividers between sibling rows via `last`. Flat Flamingo tokens, Cairo,
 * RTL-aware (chevron mirrors for Arabic). Label-first per ui-ux-plan §6
 * ("rows are label-first — values muted"); the icon prop exists but screens
 * should use it sparingly and only with a visible label.
 * Used by: app/(tabs)/settings.tsx (every row).
 */
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { usePrefs } from '@/lib/i18n';

interface RowProps {
  /** Optional leading icon (emoji/text) — always paired with the label. */
  icon?: string;
  label: string;
  /** Muted value text shown at the row end. */
  value?: string;
  /** Direction-aware chevron (navigation/expand affordance). */
  chevron?: boolean;
  /** Radio indicator instead of/next to the value; true = selected. */
  selected?: boolean;
  /** Custom end element — overrides value / chevron / selected. */
  right?: ReactNode;
  onPress?: () => void;
  /** Last row in a card: omit the bottom divider. */
  last?: boolean;
  /** Destructive label color (sign-out) — always with a text label. */
  danger?: boolean;
}

/** Flat radio dot: primary ring + filled center when selected. */
function RadioDot({ selected }: { selected: boolean }) {
  return (
    <View
      className={`h-5 w-5 items-center justify-center rounded-full border-2 ${
        selected ? 'border-primary' : 'border-borderx'
      }`}
    >
      {selected ? <View className="h-2.5 w-2.5 rounded-full bg-primary" /> : null}
    </View>
  );
}

/** One settings row; a plain View when no onPress is given. */
export function Row({
  icon,
  label,
  value,
  chevron,
  selected,
  right,
  onPress,
  last,
  danger,
}: RowProps) {
  const lang = usePrefs((s) => s.language);
  const end =
    right ?? (
      <View className="flex-row items-center gap-2">
        {value ? <Text className="font-cairo text-sm text-inksoft">{value}</Text> : null}
        {selected !== undefined ? (
          <RadioDot selected={selected} />
        ) : chevron ? (
          <Text className="font-cairo text-lg leading-6 text-inksoft">{lang === 'ar' ? '‹' : '›'}</Text>
        ) : null}
      </View>
    );

  const body = (
    <View
      className={`flex-row items-center justify-between gap-3 px-4 py-3.5 ${
        last ? '' : 'border-b border-borderx'
      }`}
    >
      <View className="flex-1 flex-row items-center gap-2.5">
        {icon ? <Text className="text-base">{icon}</Text> : null}
        <Text className={`font-cairo text-base ${danger ? 'text-destructive' : 'text-ink'}`}>
          {label}
        </Text>
      </View>
      {end}
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      {body}
    </Pressable>
  );
}
