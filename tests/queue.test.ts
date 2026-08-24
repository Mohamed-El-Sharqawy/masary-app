/**
 * Tests for the offline voice queue (lib/voice/queue.ts).
 * Mocks AsyncStorage (in-memory map) + expo-crypto (counter uuid) — no RN
 * runtime: covers push defaults, takeBatch FIFO, markDone removal (queue
 * empty after a full drain), markFailed retry counting, the 3-strike
 * needs_review parking (audio kept, excluded from batches + pendingCount).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => store.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: async (k: string) => {
      store.delete(k);
    },
  },
}));

let seq = 0;
vi.mock('expo-crypto', () => ({
  randomUUID: () => `uuid-${String(++seq)}`,
}));

import {
  MAX_RETRIES,
  getQueue,
  markDone,
  markFailed,
  pendingCount,
  pushCapture,
  takeBatch,
} from '../lib/voice/queue';

beforeEach(() => {
  store.clear();
  seq = 0;
});

describe('pushCapture', () => {
  it('stores the item with queue defaults (id, retries, flags)', async () => {
    const item = await pushCapture({ uri: 'file:///cache/a.m4a' });
    expect(item.id).toBe('uuid-1');
    expect(item.retries).toBe(0);
    expect(item.needsReview).toBe(false);
    expect(item.lastError).toBeNull();
    expect(item.text).toBeNull();
    const q = await getQueue();
    expect(q).toHaveLength(1);
    expect(q[0].uri).toBe('file:///cache/a.m4a');
  });

  it('keeps a provided transcript hint', async () => {
    const item = await pushCapture({ uri: 'file:///cache/a.wav', text: 'قهوة بعشرين' });
    expect(item.text).toBe('قهوة بعشرين');
  });
});

describe('takeBatch', () => {
  it('returns items FIFO and respects the batch size', async () => {
    for (const n of ['a', 'b', 'c']) await pushCapture({ uri: `file:///cache/${n}.m4a` });
    const first = await takeBatch(2);
    expect(first.map((i) => i.uri)).toEqual([
      'file:///cache/a.m4a',
      'file:///cache/b.m4a',
    ]);
    // peek semantics: nothing removed yet, so the head of the queue repeats
    const again = await takeBatch(2);
    expect(again.map((i) => i.uri)).toEqual([
      'file:///cache/a.m4a',
      'file:///cache/b.m4a',
    ]);
  });

  it('does not remove items (markDone owns removal)', async () => {
    await pushCapture({ uri: 'file:///cache/a.m4a' });
    await takeBatch(5);
    expect(await getQueue()).toHaveLength(1);
  });

  it('advances past items completed with markDone (drain pattern)', async () => {
    for (const n of ['a', 'b', 'c']) await pushCapture({ uri: `file:///cache/${n}.m4a` });
    const batch = await takeBatch(2);
    for (const item of batch) await markDone(item.id);
    const rest = await takeBatch(2);
    expect(rest.map((i) => i.uri)).toEqual(['file:///cache/c.m4a']);
  });
});

describe('markDone', () => {
  it('removes the item — queue is empty after a full drain', async () => {
    await pushCapture({ uri: 'file:///cache/a.m4a' });
    await pushCapture({ uri: 'file:///cache/b.m4a' });
    const batch = await takeBatch(2);
    for (const item of batch) await markDone(item.id);
    expect(await getQueue()).toHaveLength(0);
    expect(await pendingCount()).toBe(0);
  });

  it('is a no-op for unknown ids', async () => {
    await pushCapture({ uri: 'file:///cache/a.m4a' });
    await markDone('missing');
    expect(await getQueue()).toHaveLength(1);
  });
});

describe('markFailed', () => {
  it('counts retries and keeps the audio (item stays queued)', async () => {
    const { id } = await pushCapture({ uri: 'file:///cache/a.m4a' });
    await markFailed(id, 'capture_failed_502');
    await markFailed(id, 'stt_failed');
    const [item] = await getQueue();
    expect(item.retries).toBe(2);
    expect(item.needsReview).toBe(false);
    expect(item.lastError).toBe('stt_failed');
  });

  it('parks the item as needs_review after 3 failures and skips it in batches', async () => {
    const { id } = await pushCapture({ uri: 'file:///cache/a.m4a' });
    await pushCapture({ uri: 'file:///cache/b.m4a' });
    for (let i = 0; i < MAX_RETRIES; i++) await markFailed(id, 'boom');
    const [parked] = await getQueue().then((q) => q.filter((i) => i.id === id));
    expect(parked.retries).toBe(MAX_RETRIES);
    expect(parked.needsReview).toBe(true);
    // audio kept: still stored, but excluded from drains
    expect(await getQueue()).toHaveLength(2);
    const batch = await takeBatch(5);
    expect(batch.map((i) => i.uri)).toEqual(['file:///cache/b.m4a']);
    expect(await pendingCount()).toBe(1);
  });

  it('truncates long error strings', async () => {
    const { id } = await pushCapture({ uri: 'file:///cache/a.m4a' });
    await markFailed(id, 'x'.repeat(1000));
    const [item] = await getQueue();
    expect(item.lastError?.length).toBeLessThanOrEqual(300);
  });
});
