import type { TransitionViewV1 } from '@t3x-dev/core';
import { useEffect, useState } from 'react';
import { ApiError } from '@/infrastructure/core';
import {
  getWorkspaceControlPlaneTransition,
  getWorkspaceExtractionTransitionLink,
} from '@/infrastructure/workspaces';

export interface WorkspaceExtractionTransitionState {
  error: string | null;
  loading: boolean;
  transitionId: string | null;
  view: TransitionViewV1 | null;
}

export function useWorkspaceExtractionTransition(
  projectId: string,
  workspaceId: string,
  candidateId: string | undefined
): WorkspaceExtractionTransitionState {
  const [state, setState] = useState<WorkspaceExtractionTransitionState>({
    error: null,
    loading: false,
    transitionId: null,
    view: null,
  });

  useEffect(() => {
    if (!candidateId) {
      setState({ error: null, loading: false, transitionId: null, view: null });
      return;
    }
    const controller = new AbortController();
    setState({ error: null, loading: true, transitionId: null, view: null });
    void getWorkspaceExtractionTransitionLink(projectId, workspaceId, controller.signal)
      .then(async (link) => {
        if (link.candidate_id !== candidateId) return null;
        const inspected = await getWorkspaceControlPlaneTransition(
          projectId,
          link.transition_id,
          controller.signal
        );
        return { transitionId: link.transition_id, view: inspected.view.transition };
      })
      .then((resolved) => {
        if (controller.signal.aborted) return;
        setState({
          error: null,
          loading: false,
          transitionId: resolved?.transitionId ?? null,
          view: resolved?.view ?? null,
        });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.code === 'NOT_FOUND') {
          setState({ error: null, loading: false, transitionId: null, view: null });
          return;
        }
        setState({
          error: error instanceof Error ? error.message : 'Unable to load extraction review.',
          loading: false,
          transitionId: null,
          view: null,
        });
      });
    return () => controller.abort();
  }, [candidateId, projectId, workspaceId]);

  return state;
}
