/**
 * Sync status hook for the Masary app.
 * TanStack Query wrapper over the outbox backlog size: pending = count of
 * dirty rows in SQLite, synced = backlog empty. Light polling keeps UI
 * badges live without manual cache invalidation. Used by: dashboard header
 * badge (متزامن ✓ / غير متزامن), settings sync row.
 */
import { useQuery } from '@tanstack/react-query';
import { getDb } from '@/lib/db';

export interface SyncStatus {
  synced: boolean;
  pending: number;
}

/** Unsynced-row count → badge state. */
export function useSyncStatus() {
  const { data, isLoading } = useQuery({
    queryKey: ['sync-status'],
    queryFn: async (): Promise<SyncStatus> => {
      const db = await getDb();
      const row = await db.getFirstAsync<{ pending: number }>(
        'SELECT COUNT(*) AS pending FROM transactions WHERE dirty = 1',
      );
      const pending = row?.pending ?? 0;
      return { synced: pending === 0, pending };
    },
    refetchInterval: 5_000,
  });
  return {
    synced: data?.synced ?? false,
    pending: data?.pending ?? 0,
    isLoading,
  };
}
