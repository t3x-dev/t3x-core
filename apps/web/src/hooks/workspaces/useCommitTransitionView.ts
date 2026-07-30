import type { TransitionViewV1 } from '@t3x-dev/core';
import { useEffect, useState } from 'react';
import { getCommitTransitionView } from '@/infrastructure/commits';

export interface CommitTransitionViewState {
  error: string | null;
  loading: boolean;
  view: TransitionViewV1 | null;
}

export function useCommitTransitionView(
  projectId: string,
  refName: string,
  commitId: string | null
): CommitTransitionViewState {
  const [state, setState] = useState<CommitTransitionViewState>({
    error: null,
    loading: false,
    view: null,
  });

  useEffect(() => {
    if (!commitId) {
      setState({ error: null, loading: false, view: null });
      return;
    }

    const controller = new AbortController();
    setState({ error: null, loading: true, view: null });
    void getCommitTransitionView(projectId, refName, commitId, controller.signal)
      .then((view) => {
        if (!controller.signal.aborted) setState({ error: null, loading: false, view });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setState({
          error: error instanceof Error ? error.message : 'Unable to load the saved change review.',
          loading: false,
          view: null,
        });
      });

    return () => controller.abort();
  }, [commitId, projectId, refName]);

  return state;
}
