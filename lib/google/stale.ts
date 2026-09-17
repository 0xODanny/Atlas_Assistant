export const GOOGLE_SYNC_STALE_MS = 5 * 60_000;

export function isGoogleSyncStale(lastSyncedAt?: string, now = Date.now()): boolean {
  if (!lastSyncedAt) return true;
  return now - new Date(lastSyncedAt).getTime() >= GOOGLE_SYNC_STALE_MS;
}
