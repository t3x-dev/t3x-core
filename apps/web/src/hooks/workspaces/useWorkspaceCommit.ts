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

      const commitCreatedEvent = {
        type: 'commit.created',
        projectId: candidate.projectId,
        branch: candidate.targetBranch,
        payload: { hash: result.commit.hash, branch: candidate.targetBranch },
      };
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('t3x:commit-created', { detail: commitCreatedEvent }));
      }
      if (typeof BroadcastChannel !== 'undefined') {
        try {
          const channel = new BroadcastChannel('t3x-commits');
          channel.postMessage(commitCreatedEvent);
          channel.close();
        } catch {
          // BroadcastChannel is optional; the same-window event still keeps local views in sync.
        }
      }

      return result.commit.hash;
    },
    [candidate]
  );

  return { commit };
}
