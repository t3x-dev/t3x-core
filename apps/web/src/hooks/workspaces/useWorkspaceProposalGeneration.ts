import { useCallback } from 'react';
import {
  generateWorkspaceProposal,
  verifyWorkspaceProposal,
} from '@/infrastructure/proposalGeneration';
import type { WorkspaceProposalPosture } from '@/types/workspaces';

export function useWorkspaceProposalGeneration() {
  const generate = useCallback(
    (input: {
      projectId: string;
      workspaceId: string;
      posture: WorkspaceProposalPosture;
      instruction: string;
      sourceMaterialIds: string[];
      conversationTranscript?: string;
      ifRevision?: number;
      provider?: string;
      model?: string;
    }) => generateWorkspaceProposal(input),
    []
  );

  const verify = useCallback(
    (projectId: string, transitionId: string) => verifyWorkspaceProposal(projectId, transitionId),
    []
  );

  return { generate, verify };
}
