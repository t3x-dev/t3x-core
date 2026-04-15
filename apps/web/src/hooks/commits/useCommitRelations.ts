/**
 * useCommitRelations — imperative loader for a commit's relations.
 */

import { useCallback } from 'react';
import { getCommitRelations } from '@/infrastructure/relations';

export function useCommitRelations() {
  const loadRelations = useCallback(
    async (commitHash: string) => getCommitRelations(commitHash),
    []
  );
  return { loadRelations };
}
