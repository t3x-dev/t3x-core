/**
 * useDiffRaw — imperative raw-diff loader for two commits.
 *
 * Returns the unprocessed two-way diff payload used by full-screen diff
 * views (vs `useTreeDiff` which returns the structured tree diff).
 */

import { useCallback } from 'react';
import { diffRaw } from '@/infrastructure/diff';

export function useDiffRaw() {
  const loadDiff = useCallback(
    async (baseHash: string, targetHash: string, projectId?: string) =>
      diffRaw(baseHash, targetHash, projectId),
    []
  );
  return { loadDiff };
}
