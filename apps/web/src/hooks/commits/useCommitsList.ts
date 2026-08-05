/**
 * useCommitsList — imperative commits-list loader (per-project, per-branch).
 */

import { useCallback } from 'react';
import { fetchCommits } from '@/infrastructure/commits';

export function useCommitsList() {
  const loadCommits = useCallback(
    async (projectId: string, branch?: string, limit?: number, offset?: number) =>
      fetchCommits(projectId, branch, limit, offset),
    []
  );
  return { loadCommits };
}
