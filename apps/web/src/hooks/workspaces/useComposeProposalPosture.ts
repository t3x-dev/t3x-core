import { useCallback, useEffect, useState } from 'react';
import type { WorkspaceProposalPosture } from '@/types/workspaces';

const DEFAULT_POSTURE: WorkspaceProposalPosture = 'guided';
const POSTURES = new Set<string>(['source_only', 'guided', 'recommend']);

function storageKey(workspaceId: string) {
  return `t3x-compose-posture:${workspaceId}`;
}

function storedPosture(workspaceId: string): WorkspaceProposalPosture {
  try {
    const value = localStorage.getItem(storageKey(workspaceId));
    return value && POSTURES.has(value) ? (value as WorkspaceProposalPosture) : DEFAULT_POSTURE;
  } catch {
    return DEFAULT_POSTURE;
  }
}

/** The generation posture the Compose assistant uses, remembered per Workspace. */
export function useComposeProposalPosture(workspaceId: string) {
  const [posture, setPostureState] = useState<WorkspaceProposalPosture>(DEFAULT_POSTURE);

  useEffect(() => {
    setPostureState(storedPosture(workspaceId));
  }, [workspaceId]);

  const setPosture = useCallback(
    (next: WorkspaceProposalPosture) => {
      setPostureState(next);
      try {
        localStorage.setItem(storageKey(workspaceId), next);
      } catch {
        // Storage can be unavailable (private mode, quota); the choice still applies this session.
      }
    },
    [workspaceId]
  );

  return { posture, setPosture };
}
