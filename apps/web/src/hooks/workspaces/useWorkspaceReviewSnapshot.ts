import { useCallback, useEffect, useState } from 'react';
import type { WorkspaceTransitionReviewSnapshotResponse } from '@/infrastructure/workspaces';
import { fetchWorkspaceTransitionReviewSnapshot } from '@/queries/workspaces';

export interface WorkspaceReviewSnapshotState {
  data: WorkspaceTransitionReviewSnapshotResponse | null;
  error: string | null;
  loading: boolean;
}

export function useWorkspaceReviewSnapshot(
  projectId: string,
  workspaceId: string,
  snapshotId: string
) {
  const [state, setState] = useState<WorkspaceReviewSnapshotState>({
    data: null,
    error: null,
    loading: true,
  });

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setState((current) => ({ ...current, error: null, loading: true }));
      try {
        const data = await fetchWorkspaceTransitionReviewSnapshot(
          projectId,
          workspaceId,
          snapshotId,
          signal
        );
        if (!signal?.aborted) setState({ data, error: null, loading: false });
      } catch (error) {
        if (signal?.aborted) return;
        setState({
          data: null,
          error: error instanceof Error ? error.message : 'Unable to load the change review.',
          loading: false,
        });
      }
    },
    [projectId, snapshotId, workspaceId]
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return { load, state };
}
