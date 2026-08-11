import type { TransitionViewV1 } from '@t3x-dev/core';
import { useCallback, useRef, useState } from 'react';
import { dispatchCommitCreated } from '@/hooks/commits/commitEvents';
import { ApiError } from '@/infrastructure/core';
import type {
  WorkspaceTransitionContent,
  WorkspaceTransitionOutcome,
  WorkspaceTransitionPrecondition,
} from '@/infrastructure/workspaces';
import {
  decideWorkspaceTransition,
  reviewWorkspaceTransition,
  saveWorkspaceDraft,
} from '@/queries/workspaces';
import type { WorkspaceCandidate } from '@/types/workspaces';

export type WorkspaceTransitionPhase =
  | 'idle'
  | 'reviewing'
  | 'reviewed'
  | 'deciding'
  | 'rejected'
  | 'committed';

export interface WorkspaceTransitionState {
  error: string | null;
  errorCode: string | null;
  phase: WorkspaceTransitionPhase;
  view: TransitionViewV1 | null;
}

interface ReviewSession {
  content: WorkspaceTransitionContent;
  precondition: WorkspaceTransitionPrecondition;
  transitionId: string;
  why?: string;
}

export interface WorkspaceTransitionCommitResult {
  commitId: string;
  workspace: WorkspaceCandidate;
}

const INITIAL_STATE: WorkspaceTransitionState = {
  error: null,
  errorCode: null,
  phase: 'idle',
  view: null,
};

export function useWorkspaceTransition(candidate: WorkspaceCandidate) {
  const [state, setState] = useState<WorkspaceTransitionState>(INITIAL_STATE);
  const generationRef = useRef(0);
  const sessionRef = useRef<ReviewSession | null>(null);

  const reset = useCallback(() => {
    generationRef.current += 1;
    sessionRef.current = null;
    setState(INITIAL_STATE);
  }, []);

  const review = useCallback(
    async (content: WorkspaceTransitionContent, whyInput?: string): Promise<boolean> => {
      const why = optionalText(whyInput);
      const generation = generationRef.current + 1;
      generationRef.current = generation;
      sessionRef.current = null;
      setState({ error: null, errorCode: null, phase: 'reviewing', view: null });

      try {
        const saved = await saveWorkspaceDraft(candidate.projectId, candidate.id, candidate);
        const revision = saved.workspace.revision;
        if (revision === undefined) {
          throw new Error('Saved Workspace did not return a review revision.');
        }
        if (generationRef.current !== generation) return false;
        const reviewed = await reviewWorkspaceTransition(
          candidate.projectId,
          candidate.id,
          content,
          why,
          revision
        );
        if (generationRef.current !== generation) return false;
        sessionRef.current = {
          content,
          precondition: reviewed.precondition,
          transitionId: reviewed.transition_id,
          why,
        };
        setState({
          error: null,
          errorCode: null,
          phase: 'reviewed',
          view: reviewed.transition,
        });
        return true;
      } catch (error) {
        if (generationRef.current !== generation) return false;
        sessionRef.current = null;
        setState(failedState(error, null, 'idle'));
        return false;
      }
    },
    [candidate]
  );

  const decide = useCallback(
    async (
      outcome: WorkspaceTransitionOutcome,
      decisionReasonInput?: string
    ): Promise<WorkspaceTransitionCommitResult | null> => {
      const session = sessionRef.current;
      if (!session) {
        setState({
          error: 'Review this change again before making a decision.',
          errorCode: 'REVIEW_REQUIRED',
          phase: 'idle',
          view: null,
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
        const decided = await decideWorkspaceTransition(candidate.projectId, candidate.id, {
          transitionId: session.transitionId,
          content: session.content,
          why: session.why,
          outcome,
          decisionReason,
          precondition: session.precondition,
        });
        sessionRef.current = null;
        const commitId = committedTransitionId(decided.transition);
        if (commitId && !decided.workspace) {
          throw new Error('Committed Workspace response did not include the latest revision.');
        }
        setState({
          error: null,
          errorCode: null,
          phase: commitId ? 'committed' : 'rejected',
          view: decided.transition,
        });
        if (commitId) {
          dispatchCommitCreated({
            projectId: candidate.projectId,
            hash: commitId,
            branch: candidate.targetBranch,
          });
        }
        return commitId && decided.workspace ? { commitId, workspace: decided.workspace } : null;
      } catch (error) {
        const stale = error instanceof ApiError && error.code === 'STALE_REVIEW';
        if (stale) sessionRef.current = null;
        setState((current) =>
          failedState(error, stale ? null : current.view, stale ? 'idle' : 'reviewed')
        );
        return null;
      }
    },
    [candidate.id, candidate.projectId, candidate.targetBranch]
  );

  return { decide, reset, review, state };
}

function optionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function committedTransitionId(view: TransitionViewV1): string | null {
  if (view.mode !== 'transition' || view.history.observation !== 'committed') return null;
  return view.history.commit.id;
}

function failedState(
  error: unknown,
  view: TransitionViewV1 | null,
  phase: WorkspaceTransitionPhase
): WorkspaceTransitionState {
  if (error instanceof ApiError) {
    return {
      error:
        error.code === 'LEGACY_HEAD_READ_ONLY'
          ? 'Verified changes are not enabled for this legacy branch yet. Existing history remains readable, but this branch needs an explicit migration before it can save a Transition.'
          : error.message,
      errorCode: error.code,
      phase,
      view,
    };
  }
  return {
    error: error instanceof Error ? error.message : 'Workspace Transition failed.',
    errorCode: null,
    phase,
    view,
  };
}
