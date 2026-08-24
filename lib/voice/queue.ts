/**
 * Offline voice-capture queue (technical-plan §8 M3): record now →
 * transcribe when online. Table-less JSON queue persisted in AsyncStorage
 * under 'masary-voice-queue'. Items keep their audio uri until done
 * (audio is never silently dropped); after MAX_RETRIES failures an item is
 * flagged needsReview and parked — audio kept for manual review.
 * Drained by lib/voice/process.ts (NetInfo online + AppState active).
 * Used by: hooks/useVoice.ts (push), lib/voice/process.ts (drain), tests.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';

const KEY = 'masary-voice-queue';

/** Failures before an item is parked as needs_review (audio kept). */
export const MAX_RETRIES = 3;

/** One queued voice capture. */
export interface VoiceCapture {
  id: string; // uuid, generated on push
  uri: string; // local audio file (cache dir)
  text: string | null; // transcript hint when already known
  createdAt: string; // ISO-8601
  retries: number;
  needsReview: boolean; // 3-strike flag — kept but excluded from drains
  lastError: string | null;
}

/** Read the whole queue; corrupt storage degrades to an empty queue. */
async function readAll(): Promise<VoiceCapture[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as VoiceCapture[]) : [];
  } catch {
    return [];
  }
}

async function writeAll(items: VoiceCapture[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(items));
}

/** Enqueue a fresh capture; returns the stored item. */
export async function pushCapture(input: { uri: string; text?: string }): Promise<VoiceCapture> {
  const item: VoiceCapture = {
    id: randomUUID(),
    uri: input.uri,
    text: input.text ?? null,
    createdAt: new Date().toISOString(),
    retries: 0,
    needsReview: false,
    lastError: null,
  };
  const items = await readAll();
  items.push(item);
  await writeAll(items);
  return item;
}

/** Next n drainable items (FIFO; needs_review items are skipped). */
export async function takeBatch(n: number): Promise<VoiceCapture[]> {
  const items = await readAll();
  return items.filter((i) => !i.needsReview).slice(0, Math.max(0, n));
}

/** Remove a finished item from the queue. */
export async function markDone(id: string): Promise<void> {
  const items = await readAll();
  await writeAll(items.filter((i) => i.id !== id));
}

/** Record a failure; after MAX_RETRIES the item is parked needs_review. */
export async function markFailed(id: string, err: string): Promise<void> {
  const items = await readAll();
  const item = items.find((i) => i.id === id);
  if (!item) return;
  item.retries += 1;
  item.lastError = err.slice(0, 300);
  if (item.retries >= MAX_RETRIES) item.needsReview = true;
  await writeAll(items);
}

/** Count of drainable items (needs_review excluded). */
export async function pendingCount(): Promise<number> {
  const items = await readAll();
  return items.filter((i) => !i.needsReview).length;
}

/** Raw stored queue — introspection for tests/debug. */
export async function getQueue(): Promise<VoiceCapture[]> {
  return readAll();
}
