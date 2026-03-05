'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Shape returned by the cursor-based fetcher */
interface CursorPage<T> {
  items: T[];
  next_cursor: string;
  has_more: boolean;
}

interface UseCursorPaginationOptions<T> {
  /** Fetch function that takes a cursor string and limit, returns a page */
  fetcher: (cursor: string, limit: number) => Promise<CursorPage<T>>;
  /** Items per page (default 50) */
  limit?: number;
  /** Whether the query is enabled (default true) */
  enabled?: boolean;
}

interface UseCursorPaginationResult<T> {
  items: T[];
  loading: boolean;
  loadingMore: boolean;
  error: Error | null;
  hasMore: boolean;
  loadMore: () => void;
  reset: () => void;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
}

export function useCursorPagination<T>({
  fetcher,
  limit = 50,
  enabled = true,
}: UseCursorPaginationOptions<T>): UseCursorPaginationResult<T> {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const mountedRef = useRef(true);
  const fetchingRef = useRef(false);
  const cursorRef = useRef('');
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Keep fetcher in a ref to avoid stale closures
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const fetchPage = useCallback(
    async (isInitial: boolean) => {
      if (!enabled || fetchingRef.current) return;

      fetchingRef.current = true;
      if (isInitial) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);

      try {
        const cursor = isInitial ? '' : cursorRef.current;
        const page = await fetcherRef.current(cursor, limit);
        if (!mountedRef.current) return;

        if (isInitial) {
          setItems(page.items);
        } else {
          setItems((prev) => [...prev, ...page.items]);
        }
        cursorRef.current = page.next_cursor;
        setHasMore(page.has_more);
      } catch (err) {
        if (!mountedRef.current) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        fetchingRef.current = false;
        if (mountedRef.current) {
          if (isInitial) {
            setLoading(false);
          } else {
            setLoadingMore(false);
          }
        }
      }
    },
    [limit, enabled]
  );

  // Initial fetch
  useEffect(() => {
    mountedRef.current = true;
    cursorRef.current = '';
    setItems([]);
    setHasMore(true);
    fetchPage(true);
    return () => {
      mountedRef.current = false;
    };
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (hasMore && !fetchingRef.current) {
      fetchPage(false);
    }
  }, [hasMore, fetchPage]);

  const reset = useCallback(() => {
    cursorRef.current = '';
    setItems([]);
    setHasMore(true);
    setError(null);
    fetchPage(true);
  }, [fetchPage]);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && hasMore && !fetchingRef.current) {
          fetchPage(false);
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(sentinel);
    return () => {
      observer.disconnect();
    };
  }, [hasMore, fetchPage]);

  return {
    items,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    reset,
    sentinelRef,
  };
}
