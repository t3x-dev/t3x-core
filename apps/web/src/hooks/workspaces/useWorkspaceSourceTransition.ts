import type { TransitionViewV1 } from '@t3x-dev/core';
import { useCallback, useRef, useState } from 'react';
import { ApiError } from '@/infrastructure/core';
import {
  reviewWorkspaceSourceRevert,
  reviewWorkspaceSourceTransition,
  saveWorkspaceDraft,
  type WorkspaceSourceChange,
  type WorkspaceSourceTransitionReviewResponse,
} from '@/queries/workspaces';
import type { WorkspaceCandidate } from '@/types/workspaces';

export type WorkspaceSourceTask = WorkspaceSourceChange;

export type WorkspaceSourceTransitionPhase =
  | 'idle'
  | 'reviewing'
  | 'reviewed'
  | 'deciding'
  | 'rejected'
  | 'committed';

export interface WorkspaceSourceTransitionState {
  error: string | null;
  errorCode: string | null;
  phase: WorkspaceSourceTransitionPhase;
  changeProjection: WorkspaceSourceTransitionReviewResponse['change_projection'] | null;
  reviewSnapshot: WorkspaceSourceTransitionReviewResponse['review_snapshot'] | null;
  runner: WorkspaceSourceTransitionReviewResponse['runner'] | null;
  task: 'change' | 'revert' | null;
  view: TransitionViewV1 | null;
}

const INITIAL_STATE: WorkspaceSourceTransitionState = {
  changeProjection: null,
  error: null,
  errorCode: null,
  phase: 'idle',
  reviewSnapshot: null,
  runner: null,
  task: null,
  view: null,
};

export function useWorkspaceSourceTransition(candidate: WorkspaceCandidate) {
  const [state, setState] = useState<WorkspaceSourceTransitionState>(INITIAL_STATE);
  const generationRef = useRef(0);

  const reset = useCallback(() => {
    generationRef.current += 1;
    setState(INITIAL_STATE);
  }, []);

  const review = useCallback(
    async (change: WorkspaceSourceChange, whyInput?: string): Promise<boolean> => {
      const artifact = candidate.sourceArtifact;
      if (!artifact?.root) {
        setState({
          ...INITIAL_STATE,
          error: 'Choose an ESPHome root configuration before running checks.',
          errorCode: 'SOURCE_ROOT_REQUIRED',
        });
        return false;
      }

      const why = optionalText(whyInput);
      const generation = generationRef.current + 1;
      generationRef.current = generation;
      setState({ ...INITIAL_STATE, phase: 'reviewing' });

      try {
        const saved = await saveWorkspaceDraft(candidate.projectId, candidate.id, candidate);
        const revision = saved.workspace.revision;
        if (revision === undefined) {
          throw new Error('Saved Workspace did not return a review revision.');
        }
        if (generationRef.current !== generation) return false;

        const reviewed = await reviewWorkspaceSourceTransition(candidate.projectId, candidate.id, {
          artifact,
          change,
          why,
          ifRevision: revision,
        });
        if (generationRef.current !== generation) return false;

        setState({
          changeProjection: reviewed.change_projection,
          error: null,
          errorCode: null,
          phase: 'reviewed',
          reviewSnapshot: reviewed.review_snapshot,
          runner: reviewed.runner,
          task: 'change',
          view: reviewed.transition,
        });
        return true;
      } catch (error) {
        if (generationRef.current !== generation) return false;
        setState(failedState(error, null, null, 'idle', null));
        return false;
      }
    },
    [candidate]
  );

  const reviewRevert = useCallback(
    async (commitId: string, whyInput?: string): Promise<boolean> => {
      const why = optionalText(whyInput);
      const generation = generationRef.current + 1;
      generationRef.current = generation;
      setState({ ...INITIAL_STATE, phase: 'reviewing', task: 'revert' });

      try {
        const saved = await saveWorkspaceDraft(candidate.projectId, candidate.id, candidate);
        const revision = saved.workspace.revision;
        if (revision === undefined) {
          throw new Error('Saved Workspace did not return a review revision.');
        }
        if (generationRef.current !== generation) return false;

        const reviewed = await reviewWorkspaceSourceRevert(candidate.projectId, candidate.id, {
          commitId,
          why,
          ifRevision: revision,
        });
        if (generationRef.current !== generation) return false;

        setState({
          changeProjection: reviewed.change_projection,
          error: null,
          errorCode: null,
          phase: 'reviewed',
          reviewSnapshot: reviewed.review_snapshot,
          runner: reviewed.runner,
          task: 'revert',
          view: reviewed.transition,
        });
        return true;
      } catch (error) {
        if (generationRef.current !== generation) return false;
        setState(failedState(error, null, null, 'idle', null));
        return false;
      }
    },
    [candidate]
  );

  return { reset, review, reviewRevert, state };
}

function optionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function failedState(
  error: unknown,
  view: TransitionViewV1 | null,
  runner: WorkspaceSourceTransitionState['runner'],
  phase: WorkspaceSourceTransitionPhase,
  task: WorkspaceSourceTransitionState['task']
): WorkspaceSourceTransitionState {
  if (error instanceof ApiError) {
    return {
      changeProjection: null,
      error:
        error.code === 'LEGACY_HEAD_READ_ONLY'
          ? 'Exact-source changes are not enabled for this legacy branch. Migrate the branch before saving a verified change.'
          : error.message,
      errorCode: error.code,
      phase,
      reviewSnapshot: null,
      runner,
      task,
      view,
    };
  }
  return {
    changeProjection: null,
    error: error instanceof Error ? error.message : 'Exact-source review failed.',
    errorCode: null,
    phase,
    reviewSnapshot: null,
    runner,
    task,
    view,
  };
}
