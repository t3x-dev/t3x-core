'use client';

import { useCallback, useRef, useState } from 'react';
import { getCacheEntry, invalidateCache, setCacheEntry } from '@/lib/queryClient';

export interface UseMutationOptions<TData, TVariables> {
  /** Called to optimistically update cache before the mutation resolves */
  onOptimistic?: (variables: TVariables) => { key: string; data: unknown } | void;
  /** Called on success */
  onSuccess?: (data: TData, variables: TVariables) => void;
  /** Called on error */
  onError?: (error: Error, variables: TVariables) => void;
  /** Called after success or error */
  onSettled?: (data: TData | undefined, error: Error | undefined, variables: TVariables) => void;
  /** Cache keys to invalidate on success */
  invalidateKeys?: string[];
}

export interface UseMutationResult<TData, TVariables> {
  mutate: (variables: TVariables) => Promise<TData>;
  data: TData | undefined;
  error: Error | undefined;
  isLoading: boolean;
  reset: () => void;
}

export function useMutation<TData, TVariables = void>(
  mutator: (variables: TVariables) => Promise<TData>,
  options: UseMutationOptions<TData, TVariables> = {}
): UseMutationResult<TData, TVariables> {
  const [data, setData] = useState<TData | undefined>();
  const [error, setError] = useState<Error | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const rollbackRef = useRef<{ key: string; prev: unknown } | null>(null);

  // Use refs for mutator and options to keep mutate callback stable
  const mutatorRef = useRef(mutator);
  mutatorRef.current = mutator;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const mutate = useCallback(async (variables: TVariables): Promise<TData> => {
    const opts = optionsRef.current;
    setIsLoading(true);
    setError(undefined);
    rollbackRef.current = null;

    // Optimistic update
    if (opts.onOptimistic) {
      const optimistic = opts.onOptimistic(variables);
      if (optimistic) {
        const prev = getCacheEntry(optimistic.key);
        rollbackRef.current = { key: optimistic.key, prev: prev?.data };
        setCacheEntry(optimistic.key, optimistic.data);
      }
    }

    try {
      const result = await mutatorRef.current(variables);
      setData(result);
      rollbackRef.current = null;

      // Invalidate related caches
      if (opts.invalidateKeys) {
        for (const key of opts.invalidateKeys) {
          invalidateCache(key);
        }
      }

      opts.onSuccess?.(result, variables);
      opts.onSettled?.(result, undefined, variables);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);

      // Rollback optimistic update
      if (rollbackRef.current) {
        const { key, prev } = rollbackRef.current;
        if (prev !== undefined) {
          setCacheEntry(key, prev);
        } else {
          invalidateCache(key);
        }
        rollbackRef.current = null;
      }

      opts.onError?.(error, variables);
      opts.onSettled?.(undefined, error, variables);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setData(undefined);
    setError(undefined);
    setIsLoading(false);
  }, []);

  return { mutate, data, error, isLoading, reset };
}
