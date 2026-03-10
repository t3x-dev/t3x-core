'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface UseQueryOptions<T> {
  queryKey: unknown[];
  queryFn: () => Promise<T>;
  enabled?: boolean;
  staleTime?: number;
}

interface UseQueryResult<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

// Simple cache for deduplication (capped at 200 entries to prevent unbounded growth)
const queryCache = new Map<string, { data: unknown; timestamp: number }>();
const QUERY_CACHE_MAX_SIZE = 200;
const STALE_CLEANUP_MS = 60_000; // Prune entries older than 60s

function getCacheKey(queryKey: unknown[]): string {
  return JSON.stringify(queryKey);
}

export function useQuery<T>({
  queryKey,
  queryFn,
  enabled = true,
  staleTime = 30000,
}: UseQueryOptions<T>): UseQueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);
  const queryFnRef = useRef(queryFn);
  queryFnRef.current = queryFn;

  const cacheKey = getCacheKey(queryKey);
  // Track active key to discard stale responses when key changes mid-flight
  const activeKeyRef = useRef(cacheKey);
  activeKeyRef.current = cacheKey;

  const fetchData = useCallback(async () => {
    if (!enabled) return;

    // Check cache
    const cached = queryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < staleTime) {
      setData(cached.data as T);
      return;
    }

    setIsLoading(true);
    setError(null);
    const requestKey = cacheKey; // capture at call time
    try {
      const result = await queryFnRef.current();
      if (!mountedRef.current || activeKeyRef.current !== requestKey) return;
      setData(result);
      // Prune stale entries before inserting, then evict oldest if still over limit
      const now = Date.now();
      if (queryCache.size >= QUERY_CACHE_MAX_SIZE) {
        for (const [k, v] of queryCache) {
          if (now - v.timestamp > STALE_CLEANUP_MS) queryCache.delete(k);
        }
      }
      if (queryCache.size >= QUERY_CACHE_MAX_SIZE) {
        const oldestKey = queryCache.keys().next().value;
        if (oldestKey !== undefined) queryCache.delete(oldestKey);
      }
      queryCache.set(requestKey, { data: result, timestamp: now });
    } catch (err) {
      if (!mountedRef.current || activeKeyRef.current !== requestKey) return;
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (mountedRef.current && activeKeyRef.current === requestKey) setIsLoading(false);
    }
  }, [cacheKey, enabled, staleTime]);

  useEffect(() => {
    mountedRef.current = true;
    fetchData();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchData]);

  const refetch = useCallback(() => {
    // Invalidate cache on refetch
    queryCache.delete(cacheKey);
    fetchData();
  }, [cacheKey, fetchData]);

  return { data, isLoading, error, refetch };
}

// Utility to invalidate cache entries by prefix
export function invalidateQueries(keyPrefix: string): void {
  const toDelete: string[] = [];
  for (const key of queryCache.keys()) {
    // Match serialized keys where the prefix appears as first or any element
    if (key.startsWith(`["${keyPrefix}"`) || key.includes(`"${keyPrefix}"`)) {
      toDelete.push(key);
    }
  }
  for (const key of toDelete) {
    queryCache.delete(key);
  }
}

// Clear all cache entries (use on project navigation to prevent cross-project stale data)
export function clearQueryCache(): void {
  queryCache.clear();
}

// Alias for clarity — clears the entire module-level cache
export function clearAllCache(): void {
  queryCache.clear();
}
