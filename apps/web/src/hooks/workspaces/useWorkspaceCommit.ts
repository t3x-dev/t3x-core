import { useCallback } from 'react';
import { commitWorkspaceDraft, saveWorkspaceDraft } from '@/queries/workspaces';
import type { WorkspaceCandidate } from '@/types/workspaces';
import type { WorkspaceYOpsTreeNode } from '@/types/workspaceYops';

export function useWorkspaceCommit(candidate: WorkspaceCandidate) {
  const commit = useCallback(
    async (materializedTrees: WorkspaceYOpsTreeNode[]) => {
      await saveWorkspaceDraft(candidate.projectId, candidate.id, candidate);
      const result = await commitWorkspaceDraft(
        candidate.projectId,
        candidate.id,
        { trees: materializedTrees, relations: [] },
        `Workspace commit: ${candidate.title}`
      );

      return result.commit.hash;
    },
    [candidate]
  );

  return { commit };
}
