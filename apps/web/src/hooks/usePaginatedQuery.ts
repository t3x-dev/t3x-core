'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface UsePaginatedQueryOptions<T> {
  /** Fetch function that takes offset and limit */
  queryFn: (offset: number, limit: number) => Promise<T[]>;
  /** Items per page */
  limit?: number;
  /** Whether the query is enabled */
  enabled?: boolean;
}

interface UsePaginatedQueryResult<T> {
  data: T[];
  page: number;
  hasMore: boolean;
  nextPage: () => void;
  prevPage: () => void;
  goToPage: (page: number) => void;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function usePaginatedQuery<T>({
  queryFn,
  limit = 50,
  enabled = true,
}: UsePaginatedQueryOptions<T>): UsePaginatedQueryResult<T> {
  const [data, setData] = useState<T[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);
  const queryFnRef = useRef(queryFn);
  queryFnRef.current = queryFn;

  const fetchPage = useCallback(
    async (pageNum: number) => {
      if (!enabled) return;
      setIsLoading(true);
      setError(null);
      try {
        const offset = pageNum * limit;
        const result = await queryFnRef.current(offset, limit);
        if (!mountedRef.current) return;
        setData(result);
        setHasMore(result.length >= limit);
      } catch (err) {
        if (!mountedRef.current) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        if (mountedRef.current) setIsLoading(false);
      }
    },
    [limit, enabled]
  );

  useEffect(() => {
    mountedRef.current = true;
    fetchPage(page);
    return () => {
      mountedRef.current = false;
    };
  }, [page, fetchPage]);

  const nextPage = useCallback(() => {
    if (hasMore) setPage((p) => p + 1);
  }, [hasMore]);

  const prevPage = useCallback(() => {
    setPage((p) => Math.max(0, p - 1));
  }, []);

  const goToPage = useCallback((p: number) => {
    setPage(Math.max(0, p));
  }, []);

  const refetch = useCallback(() => {
    fetchPage(page);
  }, [page, fetchPage]);

  return { data, page, hasMore, nextPage, prevPage, goToPage, isLoading, error, refetch };
}
