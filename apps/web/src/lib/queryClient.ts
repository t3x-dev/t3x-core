/**
 * Lightweight query client — module-level cache + dedup.
 * No external dependencies.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  error?: undefined;
}

interface CacheErrorEntry {
  data?: undefined;
  error: Error;
  timestamp: number;
}

type CacheValue<T> = CacheEntry<T> | CacheErrorEntry;

const cache = new Map<string, CacheValue<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export function getCacheEntry<T>(key: string): CacheValue<T> | undefined {
  return cache.get(key) as CacheValue<T> | undefined;
}

export function setCacheEntry<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
}

export function setCacheError(key: string, error: Error): void {
  cache.set(key, { error, timestamp: Date.now() });
}

export function invalidateCache(keyOrPrefix: string): void {
  if (keyOrPrefix.endsWith('*')) {
    const prefix = keyOrPrefix.slice(0, -1);
    for (const key of cache.keys()) {
      if (key.startsWith(prefix)) cache.delete(key);
    }
  } else {
    cache.delete(keyOrPrefix);
  }
}

export function clearCache(): void {
  cache.clear();
}

/**
 * Deduplicate concurrent fetches for the same key.
 * If a fetch is already in-flight, return the same promise.
 */
export async function dedup<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = fetcher().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, promise);
  return promise;
}

/**
 * Check if a cache entry is stale.
 */
export function isStale(key: string, staleTime: number): boolean {
  const entry = cache.get(key);
  if (!entry) return true;
  return Date.now() - entry.timestamp > staleTime;
}
