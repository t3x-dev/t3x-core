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

// Simple cache for deduplication
const queryCache = new Map<string, { data: unknown; timestamp: number }>();

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
      queryCache.set(requestKey, { data: result, timestamp: Date.now() });
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

// Utility to invalidate cache entries
export function invalidateQueries(keyPrefix: string): void {
  for (const key of queryCache.keys()) {
    if (key.startsWith(`["${keyPrefix}"`)) {
      queryCache.delete(key);
    }
  }
}

// Clear all cache
export function clearQueryCache(): void {
  queryCache.clear();
}
