import { useCallback } from 'react';
import { extractWorkspaceCandidate, sendWorkspaceYOpsDraft } from '@/infrastructure/workspaceFlow';
import type { WorkspaceCandidate } from '@/types/workspaces';

export function useWorkspaceFlow() {
  const extractCandidate = useCallback((candidate: WorkspaceCandidate) => {
    return extractWorkspaceCandidate(candidate);
  }, []);

  const sendToYOps = useCallback((candidate: WorkspaceCandidate) => {
    return sendWorkspaceYOpsDraft(candidate);
  }, []);

  return { extractCandidate, sendToYOps };
}
