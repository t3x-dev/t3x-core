import type { TransitionViewV1 } from '@t3x-dev/core';
import { useCallback, useRef, useState } from 'react';
import { dispatchCommitCreated } from '@/hooks/commits/commitEvents';
import { ApiError } from '@/infrastructure/core';
import {
  decideWorkspaceSourceRevert,
  decideWorkspaceSourceTransition,
  reviewWorkspaceSourceRevert,
  reviewWorkspaceSourceTransition,
  saveWorkspaceDraft,
  type WorkspaceSourceChange,
  type WorkspaceSourceTransitionPrecondition,
  type WorkspaceSourceTransitionReviewResponse,
} from '@/queries/workspaces';
import type { WorkspaceCandidate, WorkspaceSourceArtifact } from '@/types/workspaces';

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
  runner: WorkspaceSourceTransitionReviewResponse['runner'] | null;
  task: 'change' | 'revert' | null;
  view: TransitionViewV1 | null;
}

type ReviewSession =
  | {
      kind: 'change';
      artifact: WorkspaceSourceArtifact;
      change: WorkspaceSourceChange;
      precondition: WorkspaceSourceTransitionPrecondition;
      transitionId: string;
      why?: string;
    }
  | {
      kind: 'revert';
      commitId: string;
      precondition: WorkspaceSourceTransitionPrecondition;
      transitionId: string;
      why?: string;
    };

const INITIAL_STATE: WorkspaceSourceTransitionState = {
  error: null,
  errorCode: null,
  phase: 'idle',
  runner: null,
  task: null,
  view: null,
};

export function useWorkspaceSourceTransition(candidate: WorkspaceCandidate) {
  const [state, setState] = useState<WorkspaceSourceTransitionState>(INITIAL_STATE);
  const generationRef = useRef(0);
  const sessionRef = useRef<ReviewSession | null>(null);

  const reset = useCallback(() => {
    generationRef.current += 1;
    sessionRef.current = null;
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
      sessionRef.current = null;
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

        sessionRef.current = {
          kind: 'change',
          artifact: structuredClone(artifact),
          change: structuredClone(change),
          precondition: reviewed.precondition,
          transitionId: reviewed.transition_id,
          why,
        };
        setState({
          error: null,
          errorCode: null,
          phase: 'reviewed',
          runner: reviewed.runner,
          task: 'change',
          view: reviewed.transition,
        });
        return true;
      } catch (error) {
        if (generationRef.current !== generation) return false;
        sessionRef.current = null;
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
      sessionRef.current = null;
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

        sessionRef.current = {
          kind: 'revert',
          commitId,
          precondition: reviewed.precondition,
          transitionId: reviewed.transition_id,
          why,
        };
        setState({
          error: null,
          errorCode: null,
          phase: 'reviewed',
          runner: reviewed.runner,
          task: 'revert',
          view: reviewed.transition,
        });
        return true;
      } catch (error) {
        if (generationRef.current !== generation) return false;
        sessionRef.current = null;
        setState(failedState(error, null, null, 'idle', null));
        return false;
      }
    },
    [candidate]
  );

  const decide = useCallback(
    async (
      outcome: 'accepted' | 'overridden' | 'rejected',
      decisionReasonInput?: string
    ): Promise<string | null> => {
      const session = sessionRef.current;
      if (!session) {
        setState({
          ...INITIAL_STATE,
          error: 'Run checks again before making a decision.',
          errorCode: 'REVIEW_REQUIRED',
        });
        return null;
      }

      const decisionReason = optionalText(decisionReasonInput);
      if (outcome === 'overridden' && !decisionReason) {
        setState((current) => ({
          ...current,
          error: 'Explain why this change should continue despite the failed check.',
          errorCode: 'OVERRIDE_REASON_REQUIRED',
        }));
        return null;
      }

      setState((current) => ({ ...current, error: null, errorCode: null, phase: 'deciding' }));
      try {
        const decided =
          session.kind === 'change'
            ? await decideWorkspaceSourceTransition(candidate.projectId, candidate.id, {
                artifact: session.artifact,
                change: session.change,
                transitionId: session.transitionId,
                why: session.why,
                outcome,
                decisionReason,
                precondition: session.precondition,
              })
            : await decideWorkspaceSourceRevert(candidate.projectId, candidate.id, {
                commitId: session.commitId,
                transitionId: session.transitionId,
                why: session.why,
                outcome,
                decisionReason,
                precondition: session.precondition,
              });
        sessionRef.current = null;
        const commitId = committedTransitionId(decided.transition);
        setState({
          error: null,
          errorCode: null,
          phase: commitId ? 'committed' : 'rejected',
          runner: decided.runner,
          task: session.kind,
          view: decided.transition,
        });
        if (commitId) {
          dispatchCommitCreated({
            projectId: candidate.projectId,
            hash: commitId,
            branch: candidate.targetBranch,
          });
        }
        return commitId;
      } catch (error) {
        const stale = error instanceof ApiError && error.code === 'STALE_REVIEW';
        if (stale) sessionRef.current = null;
        setState((current) =>
          failedState(
            error,
            stale ? null : current.view,
            stale ? null : current.runner,
            stale ? 'idle' : 'reviewed',
            stale ? null : current.task
          )
        );
        return null;
      }
    },
    [candidate.id, candidate.projectId, candidate.targetBranch]
  );

  return { decide, reset, review, reviewRevert, state };
}

function committedTransitionId(view: TransitionViewV1): string | null {
  if (view.mode !== 'transition' || view.history.observation !== 'committed') return null;
  return view.history.commit.id;
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
      error:
        error.code === 'LEGACY_HEAD_READ_ONLY'
          ? 'Exact-source changes are not enabled for this legacy branch. Migrate the branch before saving a verified change.'
          : error.message,
      errorCode: error.code,
      phase,
      runner,
      task,
      view,
    };
  }
  return {
    error: error instanceof Error ? error.message : 'Exact-source review failed.',
    errorCode: null,
    phase,
    runner,
    task,
    view,
  };
}
