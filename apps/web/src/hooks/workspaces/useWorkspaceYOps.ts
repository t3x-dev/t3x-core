import { useCallback } from 'react';
import {
  buildWorkspaceBaselineTrees,
  getWorkspaceYOpsRootKey,
  validateWorkspaceYOps,
} from '@/infrastructure/workspaceYops';
import { fetchCommitByHash } from '@/queries/commitByHash';
import type { WorkspaceCandidate } from '@/types/workspaces';
import type { WorkspaceYOpsTreeNode } from '@/types/workspaceYops';

export function useWorkspaceYOps(candidate: WorkspaceCandidate) {
  const validate = useCallback(async () => {
    return validateWorkspaceCandidateYOps(candidate);
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

  const loadDraftContent = useCallback(async () => {
    if (candidate.yopsDraft.operations.length) {
      const result = await validate();
      if (!result.ok || !result.previewTrees)
        throw new Error(result.error?.message ?? 'Cannot replay the current draft.');
      return { trees: result.previewTrees, relations: result.previewRelations ?? [] };
    }
    const base = isCanonicalCommitHash(candidate.baseCommitHash)
      ? await loadWorkspaceBaseline(candidate.baseCommitHash, candidate.projectId)
      : undefined;
    return {
      trees: buildWorkspaceBaselineTrees(
        candidate,
        getWorkspaceYOpsRootKey(candidate.schemaBindings),
        base?.trees ?? []
      ),
      relations: base?.relations ?? [],
    };
  }, [candidate, validate]);
  return { loadCommittedContent, loadDraftContent, rootKey, validate };
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

export async function validateWorkspaceCandidateYOps(candidate: WorkspaceCandidate) {
  const inheritedBaseline = isCanonicalCommitHash(candidate.baseCommitHash)
    ? await loadWorkspaceBaseline(candidate.baseCommitHash, candidate.projectId)
    : undefined;
  return validateWorkspaceYOps(candidate, inheritedBaseline);
}
