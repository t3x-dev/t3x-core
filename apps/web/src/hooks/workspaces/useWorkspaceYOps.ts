import { useCallback } from 'react';
import { getWorkspaceYOpsRootKey, validateWorkspaceYOps } from '@/infrastructure/workspaceYops';
import type { WorkspaceCandidate } from '@/types/workspaces';

export function useWorkspaceYOps(candidate: WorkspaceCandidate) {
  const validate = useCallback(() => validateWorkspaceYOps(candidate), [candidate]);
  const rootKey = getWorkspaceYOpsRootKey(candidate.schemaBindings);

  return { rootKey, validate };
}
