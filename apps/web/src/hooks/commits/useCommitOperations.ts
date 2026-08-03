/**
 * useCommitOperations — imperative committed YOps loader.
 */

import { useCallback } from 'react';
import { fetchCommitOperations } from '@/queries/commitOperations';

export function useCommitOperations() {
  const loadOperations = useCallback(
    async (commitHash: string, projectId?: string) => fetchCommitOperations(commitHash, projectId),
    []
  );
  return { loadOperations };
}
