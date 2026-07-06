import { useCallback } from 'react';
import { createCommit } from '@/infrastructure/commits';
import type { WorkspaceCandidate } from '@/types/workspaces';
import type { WorkspaceYOpsTreeNode } from '@/types/workspaceYops';

export function useWorkspaceCommit(candidate: WorkspaceCandidate) {
  const commit = useCallback(
    async (materializedTrees: WorkspaceYOpsTreeNode[]) => {
      const result = await createCommit(
        candidate.projectId,
        { trees: materializedTrees, relations: [] },
        {
          branch: candidate.targetBranch || 'main',
          message: `Workspace commit: ${candidate.title}`,
          parents: candidate.baseCommitHash ? [candidate.baseCommitHash] : [],
          provenance: { method: 'human_curation' },
          sources: candidate.sourceBundle.map(sourceToCommitRef),
        }
      );

      return result.commit.hash;
    },
    [candidate]
  );

  return { commit };
}

function sourceToCommitRef(source: WorkspaceCandidate['sourceBundle'][number]) {
  if (source.type === 'chat') {
    return { type: 'conversation', id: source.conversationId ?? source.id, title: source.title };
  }

  return {
    type: 'import',
    id: source.materialId ?? source.contentHash ?? source.id,
    title: source.title,
  };
}
