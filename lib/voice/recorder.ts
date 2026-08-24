/**
 * Hold-to-talk recorder helpers on expo-audio (technical-plan §4/§8 M3).
 * Custom preset — NOT RecordingPresets.HIGH_QUALITY: the voice contract is
 * 16 kHz mono (WAV/lpcm on iOS, m4a/AAC on Android, webm on web; Groq STT
 * accepts all three). Framework-free: hooks/useVoice.ts owns the
 * AudioRecorder instance (useAudioRecorder) and drives it with these
 * helpers — permission → audio mode → prepare → record with a 60 s auto
 * cap → stop → {uri, durationMs}. Call interruptions (status hasError /
 * mediaServicesDidReset) are detected via isInterrupted so the hook can
 * stop cleanly and discard the partial take.
 * Used by: hooks/useVoice.ts only.
 */
import { Platform } from 'react-native';
import {
  AudioQuality,
  IOSOutputFormat,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import type { AudioRecorder, RecordingOptions, RecordingStatus } from 'expo-audio';
import { APP } from '@/constants';

/** Hard cap on one hold-to-talk take (auto-stop, M3 task spec). */
export const MAX_RECORDING_MS = 60_000;

/** Neutral audio mode restored after every take (releases the mic session). */
const IDLE_AUDIO_MODE = {
  playsInSilentMode: true,
  allowsRecording: false,
  shouldPlayInBackground: false,
  interruptionMode: 'mixWithOthers',
} as const;

/**
 * 16 kHz mono recording preset (AGENTS voice contract).
 * iOS: linear PCM WAV; Android: AAC in m4a; web: default webm.
 */
export const VOICE_PRESET: RecordingOptions = {
  extension: Platform.OS === 'ios' ? '.wav' : '.m4a',
  sampleRate: APP.audioSampleRate, // 16000
  numberOfChannels: APP.audioChannels, // 1
  bitRate: 48000,
  isMeteringEnabled: true,
  directory: 'cache',
  android: {
    extension: '.m4a',
    sampleRate: 16000,
    outputFormat: 'mpeg4',
    audioEncoder: 'aac',
  },
  ios: {
    extension: '.wav',
    sampleRate: 16000,
    outputFormat: IOSOutputFormat.LINEARPCM,
    audioQuality: AudioQuality.HIGH,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: { mimeType: 'audio/webm', bitsPerSecond: 48000 },
};

/** A finished take handed to the send flow. */
export interface VoiceTake {
  uri: string;
  durationMs: number;
}

/** Ask for mic access (system no-op when already granted). */
export async function requestMicPermission(): Promise<boolean> {
  const { granted } = await requestRecordingPermissionsAsync();
  return granted;
}

/** Arm the audio session and start recording with the 60 s auto-stop cap. */
export async function startRecording(recorder: AudioRecorder): Promise<void> {
  await setAudioModeAsync({
    playsInSilentMode: true,
    allowsRecording: true,
    shouldPlayInBackground: false,
    interruptionMode: 'doNotMix',
  });
  await recorder.prepareToRecordAsync();
  recorder.record({ forDuration: MAX_RECORDING_MS / 1000 });
}

/** Read the take's duration (works both mid-recording and after finish). */
function takeDurationMs(recorder: AudioRecorder): number {
  return recorder.getStatus().durationMillis || Math.round(recorder.currentTime * 1000);
}

/** Restore the idle audio mode; never fails the take on cleanup errors. */
async function restoreAudioMode(): Promise<void> {
  try {
    await setAudioModeAsync(IDLE_AUDIO_MODE);
  } catch {
    // audio mode restore is best-effort
  }
}

/**
 * Stop and finalize the take. Throws voice_no_file when nothing was captured
 * (e.g. an instant tap) so the caller can drop the send.
 */
export async function stopRecording(recorder: AudioRecorder): Promise<VoiceTake> {
  const durationMs = takeDurationMs(recorder);
  if (recorder.isRecording) await recorder.stop();
  const uri = recorder.uri;
  await restoreAudioMode();
  if (!uri) throw new Error('voice_no_file');
  return { uri, durationMs };
}

/** Stop and discard the take (release-to-cancel / interruption). */
export async function cancelRecording(recorder: AudioRecorder): Promise<void> {
  if (recorder.isRecording) await recorder.stop();
  await restoreAudioMode();
}

/** True when a status update means the system ended our session (call etc.). */
export function isInterrupted(status: RecordingStatus): boolean {
  return status.hasError || status.mediaServicesDidReset === true;
}
