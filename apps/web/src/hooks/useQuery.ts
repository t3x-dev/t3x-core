'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  dedup,
  getCacheEntry,
  invalidateCache,
  isStale,
  setCacheEntry,
  setCacheError,
} from '@/lib/queryClient';

export interface UseQueryOptions {
  /** Time in ms before cached data is considered stale (default: 30000) */
  staleTime?: number;
  /** Whether to fetch on mount (default: true) */
  enabled?: boolean;
  /** Refetch interval in ms (0 = disabled, default: 0) */
  refetchInterval?: number;
}

export interface UseQueryResult<T> {
  data: T | undefined;
  error: Error | undefined;
  isLoading: boolean;
  isRefetching: boolean;
  refetch: () => Promise<void>;
  invalidate: () => void;
}

export function useQuery<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  options: UseQueryOptions = {}
): UseQueryResult<T> {
  const { staleTime = 30_000, enabled = true, refetchInterval = 0 } = options;
  const [, forceUpdate] = useState(0);
  const rerender = useCallback(() => forceUpdate((n) => n + 1), []);
  const mountedRef = useRef(true);
  const fetchingRef = useRef(false);

  // Use ref for fetcher to avoid triggering effects on every render
  // when callers pass inline arrow functions
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const doFetch = useCallback(
    async (isRefetch = false) => {
      if (!key || !enabled) return;
      fetchingRef.current = true;
      if (!isRefetch) rerender();

      try {
        const data = await dedup(key, fetcherRef.current);
        setCacheEntry(key, data);
      } catch (err) {
        setCacheError(key, err instanceof Error ? err : new Error(String(err)));
      } finally {
        fetchingRef.current = false;
        if (mountedRef.current) rerender();
      }
    },
    [key, enabled, rerender]
  );

  // Initial fetch + SWR
  useEffect(() => {
    if (!key || !enabled) return;
    if (isStale(key, staleTime)) {
      doFetch();
    }
  }, [key, enabled, staleTime, doFetch]);

  // Refetch interval
  useEffect(() => {
    if (!refetchInterval || !key || !enabled) return;
    const id = setInterval(() => doFetch(true), refetchInterval);
    return () => clearInterval(id);
  }, [refetchInterval, key, enabled, doFetch]);

  // Cleanup
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const entry = key ? getCacheEntry<T>(key) : undefined;
  const hasData = entry && !entry.error;
  const isLoading = !hasData && fetchingRef.current;

  return {
    data: entry?.data as T | undefined,
    error: entry?.error,
    isLoading,
    isRefetching: hasData ? fetchingRef.current : false,
    refetch: () => doFetch(!!hasData),
    invalidate: () => {
      if (key) {
        invalidateCache(key);
        doFetch();
      }
    },
  };
}
