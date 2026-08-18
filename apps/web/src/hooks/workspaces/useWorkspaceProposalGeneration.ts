import { useCallback } from 'react';
import {
  commitWorkspaceProposal,
  decideWorkspaceProposal,
  generateWorkspaceProposal,
  verifyWorkspaceProposal,
} from '@/infrastructure/proposalGeneration';
import type { WorkspaceProposalGenerationView, WorkspaceProposalPosture } from '@/types/workspaces';

export function useWorkspaceProposalGeneration() {
  const generate = useCallback(
    (input: {
      projectId: string;
      workspaceId: string;
      posture: WorkspaceProposalPosture;
      instruction: string;
      sourceMaterialIds: string[];
      ifRevision?: number;
    }) => generateWorkspaceProposal(input),
    []
  );

  const verify = useCallback(
    (projectId: string, transitionId: string) => verifyWorkspaceProposal(projectId, transitionId),
    []
  );

  const decide = useCallback(
    (projectId: string, view: WorkspaceProposalGenerationView, outcome: 'accepted' | 'rejected') =>
      decideWorkspaceProposal(projectId, view, outcome),
    []
  );

  const commit = useCallback(
    (projectId: string, view: WorkspaceProposalGenerationView, decisionDigest: string) =>
      commitWorkspaceProposal(projectId, view, decisionDigest),
    []
  );

  return { commit, decide, generate, verify };
}
