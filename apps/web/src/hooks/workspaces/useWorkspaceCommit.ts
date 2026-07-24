import { useCallback } from 'react';
import { dispatchCommitCreated } from '@/hooks/commits/commitEvents';
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

      dispatchCommitCreated({
        projectId: candidate.projectId,
        hash: result.commit.hash,
        branch: candidate.targetBranch,
      });

      return result.commit.hash;
    },
    [candidate]
  );

  return { commit };
}
