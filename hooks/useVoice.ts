/**
 * React wrapper around the M3 voice recorder + send flow.
 * Owns the useAudioRecorder instance (16 kHz mono VOICE_PRESET), drives it
 * with lib/voice/recorder.ts helpers: hold-to-talk start/stop/cancel, 60 s
 * auto-stop (onAutoStop hands the finished take back), call-state
 * interruptions stop cleanly and discard the partial take. send() pushes the
 * take into the offline queue and drains it (direct /capture round-trip when
 * online), then invalidates the chat/transaction queries.
 * Used by: components/chat/VoiceButton.tsx, app/capture.tsx.
 */
import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import type { AudioRecorder, RecordingStatus } from 'expo-audio';
import {
  MAX_RECORDING_MS,
  VOICE_PRESET,
  cancelRecording,
  isInterrupted,
  requestMicPermission,
  startRecording,
  stopRecording,
} from '@/lib/voice/recorder';
import type { VoiceTake } from '@/lib/voice/recorder';
import { pushCapture } from '@/lib/voice/queue';
import { ensureVoiceDrain, processQueue } from '@/lib/voice/process';

/** Options for useVoice. */
interface UseVoiceOptions {
  /** Fired when the duration cap ends the take while the button is still held. */
  onAutoStop?: (take: VoiceTake) => void;
}

/** Live recording state + send flow for one voice input surface. */
export function useVoice(options: UseVoiceOptions = {}) {
  const qc = useQueryClient();
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);

  // Recorder + session bookkeeping. recorderRef lets the status listener
  // (registered before the recorder exists) reach the instance safely.
  const recorderRef = useRef<AudioRecorder | null>(null);
  const activeRef = useRef(false); // a take we started is in flight
  const stoppingRef = useRef(false); // we initiated the stop ourselves
  const autoStopRef = useRef(options.onAutoStop);
  autoStopRef.current = options.onAutoStop;

  const onStatus = useCallback((status: RecordingStatus) => {
    const recorder = recorderRef.current;
    if (!recorder || !activeRef.current || stoppingRef.current) return;
    if (isInterrupted(status)) {
      // Call state / media services reset — stop cleanly, discard partial take.
      stoppingRef.current = true;
      void cancelRecording(recorder)
        .catch(() => {})
        .finally(() => {
          activeRef.current = false;
          stoppingRef.current = false;
          setRecording(false);
        });
      return;
    }
    if (status.isFinished) {
      // 60 s cap reached while still holding — finalize and hand the take over.
      stoppingRef.current = true;
      void stopRecording(recorder)
        .then((take) => autoStopRef.current?.(take))
        .catch(() => {})
        .finally(() => {
          activeRef.current = false;
          stoppingRef.current = false;
          setRecording(false);
        });
    }
  }, []);

  const recorder = useAudioRecorder(VOICE_PRESET, onStatus);
  recorderRef.current = recorder;
  const { durationMillis } = useAudioRecorderState(recorder);

  /** Begin a hold-to-talk take. False when mic permission is denied. */
  const start = useCallback(async (): Promise<boolean> => {
    const granted = await requestMicPermission();
    if (!granted) return false;
    activeRef.current = true;
    stoppingRef.current = false;
    await startRecording(recorder);
    setRecording(true);
    return true;
  }, [recorder]);

  /** Finish the take; null when nothing is (or was) being recorded. */
  const stop = useCallback(async (): Promise<VoiceTake | null> => {
    if (!activeRef.current) return null;
    stoppingRef.current = true;
    try {
      return await stopRecording(recorder);
    } catch {
      return null; // e.g. instant tap produced no file
    } finally {
      activeRef.current = false;
      stoppingRef.current = false;
      setRecording(false);
    }
  }, [recorder]);

  /** Discard the take (release-to-cancel). */
  const cancel = useCallback(async (): Promise<void> => {
    if (!activeRef.current) return;
    stoppingRef.current = true;
    activeRef.current = false;
    await cancelRecording(recorder).catch(() => {});
    stoppingRef.current = false;
    setRecording(false);
  }, [recorder]);

  /**
   * Push a finished take into the offline queue and drain it now (direct
   * upload when online; NetInfo/AppState listeners drain it later otherwise).
   */
  const send = useCallback(
    async (take: VoiceTake): Promise<void> => {
      setBusy(true);
      try {
        await pushCapture({ uri: take.uri });
        ensureVoiceDrain();
        await processQueue({
          invalidate: () => {
            qc.invalidateQueries({ queryKey: ['transactions'] });
            qc.invalidateQueries({ queryKey: ['chat_messages'] });
          },
        });
      } finally {
        setBusy(false);
      }
    },
    [qc],
  );

  return {
    recording,
    durationMs: Math.min(durationMillis, MAX_RECORDING_MS),
    busy,
    start,
    stop,
    cancel,
    send,
  };
}
