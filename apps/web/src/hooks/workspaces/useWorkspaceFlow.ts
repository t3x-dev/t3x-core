import { useCallback } from 'react';
import { createBranch } from '@/infrastructure/branches';
import { extractWorkspaceCandidate, sendWorkspaceYOpsDraft } from '@/infrastructure/workspaceFlow';
import { fetchProjectWorkspaces, saveWorkspaceDraft } from '@/queries/workspaces';
import type { WorkspaceCandidate } from '@/types/workspaces';

interface StartWorkspaceIterationOptions {
  candidate: WorkspaceCandidate;
  createBranchFrom?: string;
  parentCommitHash: string;
  targetBranch: string;
}

interface StartWorkspaceIterationResult {
  workspace: WorkspaceCandidate;
}

export function useWorkspaceFlow() {
  const refreshWorkspaces = useCallback(
    (projectId: string) => fetchProjectWorkspaces(projectId),
    []
  );
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
      const workspaceId =
        targetBranch === candidate.targetBranch ? candidate.id : `workspace_${crypto.randomUUID()}`;
      const nextWorkspace = buildNextWorkspaceIteration(
        candidate,
        workspaceId,
        parentCommitHash,
        targetBranch
      );

      if (createBranchFrom) {
        await createBranch(candidate.projectId, targetBranch, createBranchFrom);
      }

      const saved = await saveWorkspaceDraft(candidate.projectId, workspaceId, nextWorkspace);
      return { workspace: saved.workspace };
    },
    []
  );

  return { extractCandidate, refreshWorkspaces, saveDraft, sendToYOps, startNextIteration };
}

function buildNextWorkspaceIteration(
  candidate: WorkspaceCandidate,
  workspaceId: string,
  parentCommitHash: string,
  targetBranch: string
): WorkspaceCandidate {
  const { lastCommitHash: _lastCommitHash, revision: _revision, ...workspace } = candidate;

  return {
    ...workspace,
    id: workspaceId,
    ...(workspaceId === candidate.id && candidate.revision !== undefined
      ? { revision: candidate.revision }
      : {}),
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
