import { useCallback } from 'react';
import { getWorkspaceYOpsRootKey, validateWorkspaceYOps } from '@/infrastructure/workspaceYops';
import { fetchCommitByHash } from '@/queries/commitByHash';
import type { WorkspaceCandidate } from '@/types/workspaces';
import type { WorkspaceYOpsTreeNode } from '@/types/workspaceYops';

export function useWorkspaceYOps(candidate: WorkspaceCandidate) {
  const validate = useCallback(async () => {
    const inheritedBaseline = isCanonicalCommitHash(candidate.baseCommitHash)
      ? await loadWorkspaceBaseline(candidate.baseCommitHash, candidate.projectId)
      : undefined;
    return validateWorkspaceYOps(candidate, inheritedBaseline);
  }, [candidate]);
  const loadCommittedContent = useCallback(
    async (hash: string) => {
      const commit = await fetchCommitByHash(hash, candidate.projectId);
      return {
        trees: commit.content.trees as WorkspaceYOpsTreeNode[],
        relations: commit.content.relations ?? [],
      };
    },
    [candidate.projectId]
  );
  const rootKey = getWorkspaceYOpsRootKey(candidate.schemaBindings);

  return { loadCommittedContent, rootKey, validate };
}

async function loadWorkspaceBaseline(hash: string, projectId: string) {
  const commit = await fetchCommitByHash(hash, projectId);
  return {
    trees: commit.content.trees as WorkspaceYOpsTreeNode[],
    relations: commit.content.relations,
  };
}

function isCanonicalCommitHash(hash: string | null | undefined): hash is string {
  return /^sha256:[a-f\d]{64}$/i.test(hash ?? '');
}
