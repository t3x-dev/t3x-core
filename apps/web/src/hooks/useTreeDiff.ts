/**
 * useTreeDiff — imperative tree-diff loader.
 *
 * Thin wrapper around fetchTreeDiff so components can call the query
 * on-demand (e.g. a click handler) without importing @/queries.
 * Returns the raw response; caller does its own state management
 * because the usage site typically already has loading/error UI state.
 */

import { useCallback } from 'react';
import { fetchTreeDiff } from '@/queries/treeDiff';

export function useTreeDiff() {
  const loadDiff = useCallback(
    async (baseHash: string, targetHash: string) => fetchTreeDiff(baseHash, targetHash),
    []
  );
  return { loadDiff };
}
