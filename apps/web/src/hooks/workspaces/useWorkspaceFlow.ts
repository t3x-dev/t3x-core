import { useCallback } from 'react';
import { createConversation } from '@/commands/conversations';
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

  const saveDraft = useCallback((candidate: WorkspaceCandidate) => {
    return saveWorkspaceDraft(candidate.projectId, candidate.id, candidate);
  }, []);

  const startNextIteration = useCallback(
    async ({
      candidate,
      createBranchFrom,
      parentCommitHash,
      targetBranch,
    }: StartWorkspaceIterationOptions): Promise<StartWorkspaceIterationResult> => {
      const nextWorkspace = buildNextWorkspaceIteration(candidate, parentCommitHash, targetBranch);

      if (createBranchFrom) {
        try {
          await createBranch(candidate.projectId, targetBranch, createBranchFrom);
        } catch {
          // Branch registration is best-effort. The target branch is still persisted
          // on the workspace and will be materialized by its next commit.
        }
      }

      const saved = await saveWorkspaceDraft(candidate.projectId, candidate.id, nextWorkspace);

      try {
        const conversation = await createConversation(
          candidate.projectId,
          `${candidate.title} source chat`,
          parentCommitHash,
          undefined,
          {
            target_branch: targetBranch,
            workspace_id: candidate.id,
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

  return { extractCandidate, saveDraft, sendToYOps, startNextIteration };
}

function buildNextWorkspaceIteration(
  candidate: WorkspaceCandidate,
  parentCommitHash: string,
  targetBranch: string
): WorkspaceCandidate {
  const { lastCommitHash: _lastCommitHash, ...workspace } = candidate;

  return {
    ...workspace,
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
