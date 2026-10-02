const ACTIVE_DELIVERY_CACHE_MS = 15_000;
const MAX_CACHE_ENTRIES = 2_000;

type CacheEntry = { expiresAt: number; values: string[] };
type PendingEntry = { version: number; promise: Promise<string[]> };

const cached = new Map<string, CacheEntry>();
const pending = new Map<string, PendingEntry>();
const versions = new Map<string, number>();

export async function activeDeliveryTargets(
  driverId: string,
  load: () => Promise<string[]>,
  now = Date.now(),
): Promise<string[]> {
  const existing = cached.get(driverId);
  if (existing && existing.expiresAt > now) return existing.values;

  const version = versions.get(driverId) ?? 0;
  const inFlight = pending.get(driverId);
  if (inFlight?.version === version) return inFlight.promise;
  if (inFlight) pending.delete(driverId);

  const promise = load().then((values) => {
    if ((versions.get(driverId) ?? 0) === version) {
      cached.set(driverId, { expiresAt: now + ACTIVE_DELIVERY_CACHE_MS, values });
      if (cached.size > MAX_CACHE_ENTRIES) {
        for (const [key, entry] of cached) {
          if (entry.expiresAt <= Date.now() || cached.size > MAX_CACHE_ENTRIES) cached.delete(key);
        }
      }
    }
    return values;
  }).finally(() => {
    if (pending.get(driverId)?.promise === promise) pending.delete(driverId);
  });
  pending.set(driverId, { version, promise });
  return promise;
}

export function invalidateActiveDeliveryTargets(driverId: string | null | undefined): void {
  if (!driverId) return;
  cached.delete(driverId);
  versions.set(driverId, (versions.get(driverId) ?? 0) + 1);
}