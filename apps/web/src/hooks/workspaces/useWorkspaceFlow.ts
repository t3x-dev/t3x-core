import { useCallback } from 'react';
import { createConversation } from '@/commands/conversations';
import { buildWorkspaceContextId } from '@/domain/workspaces/navigation';
import { createBranch } from '@/infrastructure/branches';
import { extractWorkspaceCandidate, sendWorkspaceYOpsDraft } from '@/infrastructure/workspaceFlow';
import { saveWorkspaceDraft } from '@/queries/workspaces';
import type { WorkspaceCandidate } from '@/types/workspaces';

interface StartWorkspaceIterationOptions {
  candidate: WorkspaceCandidate;
  createBranchFrom?: string;
  parentCommitHash: string;
  targetBranch: string;
}

interface StartWorkspaceIterationResult {
  conversationId?: string;
  workspace: WorkspaceCandidate;
}

export function useWorkspaceFlow() {
  const extractCandidate = useCallback((candidate: WorkspaceCandidate) => {
    return extractWorkspaceCandidate(candidate);
  }, []);

  const sendToYOps = useCallback((candidate: WorkspaceCandidate) => {
    return sendWorkspaceYOpsDraft(candidate);
  }, []);

  const startNextIteration = useCallback(
    async ({
      candidate,
      createBranchFrom,
      parentCommitHash,
      targetBranch,
    }: StartWorkspaceIterationOptions): Promise<StartWorkspaceIterationResult> => {
      const nextWorkspaceId = buildWorkspaceContextId(candidate.id, targetBranch, parentCommitHash);
      const nextWorkspace = buildNextWorkspaceIteration(
        candidate,
        nextWorkspaceId,
        parentCommitHash,
        targetBranch
      );

      if (createBranchFrom) {
        try {
          await createBranch(candidate.projectId, targetBranch, createBranchFrom);
        } catch {
          // Branch registration is best-effort. The target branch is still persisted
          // on the workspace and will be materialized by its next commit.
        }
      }

      const saved = await saveWorkspaceDraft(candidate.projectId, nextWorkspace.id, nextWorkspace);

      try {
        const conversation = await createConversation(
          candidate.projectId,
          `${candidate.title} source chat`,
          parentCommitHash,
          undefined,
          {
            target_branch: targetBranch,
            workspace_id: nextWorkspace.id,
          }
        );
        return { conversationId: conversation.conversation_id, workspace: saved.workspace };
      } catch {
        // The Source chat can lazily create this conversation on the first message.
        return { workspace: saved.workspace };
      }
    },
    []
  );

  return { extractCandidate, sendToYOps, startNextIteration };
}

function buildNextWorkspaceIteration(
  candidate: WorkspaceCandidate,
  workspaceId: string,
  parentCommitHash: string,
  targetBranch: string
): WorkspaceCandidate {
  const { lastCommitHash: _lastCommitHash, ...workspace } = candidate;

  return {
    ...workspace,
    id: workspaceId,
    baseCommitHash: parentCommitHash,
    targetBranch,
    status: 'draft',
    updatedAt: new Date().toISOString(),
    sourceBundle: candidate.sourceBundle.filter((source) => source.type !== 'chat'),
    schemaCandidate: {
      summary: 'Collect new source evidence, then generate the next candidate proposal.',
      fields: [],
    },
    schemaReview: {
      verdict: 'needs_review',
      summary: 'This iteration starts from the committed baseline and needs new evidence.',
      gaps: ['Generate a candidate proposal for this iteration.'],
    },
    yopsDraft: {
      ...candidate.yopsDraft,
      operations: [],
    },
  };
}
