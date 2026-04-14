/**
 * useCommitByHash — imperative commit-by-hash loader.
 *
 * Thin wrapper around fetchCommitByHash for components that load
 * individual commits on demand (merge preview, diff view).
 */

import { useCallback } from 'react';
import { fetchCommitByHash } from '@/queries/commitByHash';

export function useCommitByHash() {
  const loadCommit = useCallback(async (hash: string) => fetchCommitByHash(hash), []);
  return { loadCommit };
}
