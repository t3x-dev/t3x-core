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

// Simple result cache (capped at 200 entries to prevent unbounded growth)
const queryCache = new Map<string, { data: unknown; timestamp: number }>();
const QUERY_CACHE_MAX_SIZE = 200;
const STALE_CLEANUP_MS = 60_000; // Prune entries older than 60s

function getCacheKey(queryKey: unknown[]): string {
  return JSON.stringify(queryKey);
}

type QuerySnapshot<T> = {
  key: string;
  data: T | null;
} & ({ status: 'loading' | 'success'; error: null } | { status: 'error'; error: Error });

export function useQuery<T>({
  queryKey,
  queryFn,
  enabled = true,
  staleTime = 30000,
}: UseQueryOptions<T>): UseQueryResult<T> {
  const cacheKey = getCacheKey(queryKey);
  const [snapshot, setSnapshot] = useState<QuerySnapshot<T>>();
  const mountedRef = useRef(false);
  const requestRef = useRef(0);
  const queryFnRef = useRef(queryFn);
  queryFnRef.current = queryFn;
  const activeKeyRef = useRef(cacheKey);
  activeKeyRef.current = cacheKey;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const fetchData = useCallback(async () => {
    if (!mountedRef.current || !enabled || !enabledRef.current || activeKeyRef.current !== cacheKey)
      return;
    const request = ++requestRef.current;
    const isCurrent = () =>
      mountedRef.current &&
      enabledRef.current &&
      activeKeyRef.current === cacheKey &&
      requestRef.current === request;
    const cached = queryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < staleTime) {
      setSnapshot({ key: cacheKey, data: cached.data as T, status: 'success', error: null });
      return;
    }

    setSnapshot((current) => ({
      key: cacheKey,
      data: current?.key === cacheKey ? current.data : null,
      status: 'loading',
      error: null,
    }));
    try {
      const result = await queryFnRef.current();
      if (!isCurrent()) return;
      setSnapshot({ key: cacheKey, data: result, status: 'success', error: null });
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
      queryCache.set(cacheKey, { data: result, timestamp: now });
    } catch (err) {
      if (!isCurrent()) return;
      setSnapshot((current) => ({
        key: cacheKey,
        data: current?.key === cacheKey ? current.data : null,
        status: 'error',
        error: err instanceof Error ? err : new Error(String(err)),
      }));
    }
  }, [cacheKey, enabled, staleTime]);

  useEffect(() => {
    mountedRef.current = true;
    if (enabled) void fetchData();
    else setSnapshot(undefined);
    return () => {
      mountedRef.current = false;
      ++requestRef.current;
    };
  }, [enabled, fetchData]);

  const refetch = useCallback(() => {
    if (!mountedRef.current || !enabledRef.current || activeKeyRef.current !== cacheKey) return;
    // Invalidate cache on refetch
    queryCache.delete(cacheKey);
    fetchData();
  }, [cacheKey, fetchData]);

  const current = enabled && snapshot?.key === cacheKey ? snapshot : undefined;
  return {
    data: current?.data ?? null,
    isLoading: enabled && (!current || current.status === 'loading'),
    error: current?.error ?? null,
    refetch,
  };
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
