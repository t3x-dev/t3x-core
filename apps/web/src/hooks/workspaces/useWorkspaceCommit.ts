import { useCallback } from 'react';
import { commitWorkspaceDraft, saveWorkspaceDraft } from '@/queries/workspaces';
import type { WorkspaceCandidate, WorkspaceValidationOverride } from '@/types/workspaces';
import type { WorkspaceYOpsTreeNode } from '@/types/workspaceYops';

export function useWorkspaceCommit(candidate: WorkspaceCandidate) {
  const commit = useCallback(
    async (
      content: { trees: WorkspaceYOpsTreeNode[]; relations: unknown[] },
      validationOverride?: WorkspaceValidationOverride
    ) => {
      await saveWorkspaceDraft(candidate.projectId, candidate.id, candidate);
      const result = await commitWorkspaceDraft(
        candidate.projectId,
        candidate.id,
        content,
        `Workspace commit: ${candidate.title}`,
        validationOverride
      );

      return result.commit.hash;
    },
    [candidate]
  );

  return { commit };
}
