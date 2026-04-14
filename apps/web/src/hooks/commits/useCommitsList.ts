/**
 * useCommitsList — imperative commits-list loader (per-project, per-branch).
 */

import { useCallback } from 'react';
import { fetchCommits } from '@/queries/commits';

export function useCommitsList() {
  const loadCommits = useCallback(
    async (projectId: string, branch?: string, limit?: number) =>
      fetchCommits(projectId, branch, limit),
    []
  );
  return { loadCommits };
}
