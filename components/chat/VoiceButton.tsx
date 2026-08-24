/**
 * Hold-to-talk mic button (M3; ui-ux-plan §3 voice path + §7 micro-interactions).
 * Press-and-hold starts recording — medium haptic + 1→1.06 pulse loop; drag
 * up ≥ 40 px arms release-to-cancel with the 'اسحب للأعلى للإلغاء' hint;
 * release stops and sends the take into the offline voice queue + drain
 * (hooks/useVoice.ts). The 60 s cap auto-stops and sends while still held;
 * call interruptions stop cleanly and discard. size 'lg' is the quick-capture
 * screen's big button. Replaces the old inert mic placeholder.
 * Used by: components/chat/Composer.tsx, app/capture.tsx.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useVoice } from '@/hooks/useVoice';

/** Upward drag (px) that arms release-to-cancel. */
const CANCEL_DRAG_PX = 40;

interface VoiceButtonProps {
  /** 'md' = composer row size, 'lg' = quick-capture screen size. */
  size?: 'md' | 'lg';
}

/** Hold-to-talk microphone button with drag-up-to-cancel. */
export function VoiceButton({ size = 'md' }: VoiceButtonProps) {
  const large = size === 'lg';
  const { recording, durationMs, busy, start, stop, cancel, send } = useVoice({
    onAutoStop: (take) => {
      void send(take);
    },
  });
  const [cancelArmed, setCancelArmed] = useState(false);

  const scale = useRef(new Animated.Value(1)).current;
  const pulseRef = useRef<Animated.CompositeAnimation | null>(null);
  const holdRef = useRef({ held: false, armed: false });
  const voiceRef = useRef({ stop, cancel });
  voiceRef.current = { stop, cancel };

  function pulseStop() {
    pulseRef.current?.stop();
    pulseRef.current = null;
    scale.setValue(1);
  }

  function pulseStart() {
    pulseStop();
    pulseRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.06,
          duration: 420,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 420,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    pulseRef.current?.start();
  }

  /** Release handler: cancel when armed, otherwise stop + send. */
  async function finish() {
    if (!holdRef.current.held) return;
    holdRef.current.held = false;
    const armed = holdRef.current.armed;
    holdRef.current.armed = false;
    setCancelArmed(false);
    pulseStop();
    if (armed) {
      await voiceRef.current.cancel();
      return;
    }
    const take = await voiceRef.current.stop();
    if (take) await send(take);
  }

  const finishRef = useRef(finish);
  finishRef.current = finish;

  const startRef = useRef(start);
  startRef.current = start;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        holdRef.current = { held: true, armed: false };
        setCancelArmed(false);
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        void startRef.current().then((ok) => {
          if (ok) pulseStart();
        });
      },
      onPanResponderMove: (_e, gesture) => {
        if (!holdRef.current.held) return;
        const armed = gesture.dy <= -CANCEL_DRAG_PX;
        if (armed !== holdRef.current.armed) {
          holdRef.current.armed = armed;
          setCancelArmed(armed);
          if (armed) {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          }
        }
      },
      onPanResponderRelease: () => {
        void finishRef.current();
      },
      onPanResponderTerminate: () => {
        // Responder stolen (scroll etc.) — treat like a release.
        holdRef.current.armed = false;
        void finishRef.current();
      },
    }),
  ).current;

  // Unmount safety: never leave a pulse or a live recording behind.
  useEffect(() => {
    return () => {
      pulseStop();
      if (holdRef.current.held) {
        holdRef.current.held = false;
        void voiceRef.current.cancel();
      }
    };
  }, []);

  const dims = large ? 'h-28 w-28' : 'h-11 w-11';
  const icon = large ? 'text-5xl' : 'text-lg';
  const seconds = Math.floor(durationMs / 1000);

  return (
    <View className="items-center">
      <Animated.View style={{ transform: [{ scale }] }} {...pan.panHandlers}>
        <View
          accessibilityRole="button"
          accessibilityLabel="microphone"
          accessibilityState={{ busy, disabled: busy }}
          className={`${dims} items-center justify-center rounded-full ${
            recording ? (cancelArmed ? 'bg-destructive' : 'bg-primary') : 'bg-chip'
          } ${busy ? 'opacity-60' : ''}`}
        >
          <Text className={`${icon} ${recording ? 'opacity-100' : 'opacity-40'}`}>🎙</Text>
        </View>
      </Animated.View>
      {recording ? (
        <View className="absolute bottom-full left-0 right-0 mb-1 items-center gap-0.5">
          <View className="rounded-full bg-surface px-2 py-0.5">
            <Text
              className={`font-cairo text-xs ${
                cancelArmed ? 'text-destructive' : 'text-inksoft'
              }`}
            >
              اسحب للأعلى للإلغاء
            </Text>
          </View>
          {large ? (
            <Text className="font-cairo text-xs text-inksoft">{seconds} ث</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
