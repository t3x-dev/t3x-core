/**
 * useTreeMergeSuggestion — imperative tree-merge suggestion loader.
 *
 * Thin wrapper around fetchTreeMergeSuggestion so the ConflictCard
 * component doesn't import @/queries directly.
 */

import { useCallback } from 'react';
import { fetchTreeMergeSuggestion } from '@/queries/treeMergeSuggestion';

type Args = Parameters<typeof fetchTreeMergeSuggestion>;

export function useTreeMergeSuggestion() {
  const loadSuggestion = useCallback(
    async (...args: Args) => fetchTreeMergeSuggestion(...args),
    []
  );
  return { loadSuggestion };
}
