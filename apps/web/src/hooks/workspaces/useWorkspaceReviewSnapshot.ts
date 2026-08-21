import type { ReviewSnapshotV1 } from '@t3x-dev/api-client';
import type { TransitionViewV1 } from '@t3x-dev/core';
import { useCallback, useEffect, useState } from 'react';
import { dispatchCommitCreated } from '@/hooks/commits/commitEvents';
import type {
  WorkspaceTransitionDecisionResponse,
  WorkspaceTransitionOutcome,
  WorkspaceTransitionPrecondition,
  WorkspaceTransitionReviewSnapshotResponse,
} from '@/infrastructure/workspaces';
import {
  decideWorkspaceTransition,
  fetchWorkspaceTransitionReviewSnapshot,
} from '@/queries/workspaces';
import type { WorkspaceCandidate } from '@/types/workspaces';

export interface WorkspaceReviewSnapshotState {
  data: WorkspaceTransitionReviewSnapshotResponse | null;
  deciding: boolean;
  error: string | null;
  loading: boolean;
}

export interface WorkspaceReviewSnapshotCommitResult {
  commitId: string;
  workspace: WorkspaceCandidate;
}

export function useWorkspaceReviewSnapshot(
  projectId: string,
  workspaceId: string,
  snapshotId: string
) {
  const [state, setState] = useState<WorkspaceReviewSnapshotState>({
    data: null,
    deciding: false,
    error: null,
    loading: true,
  });
  const [overrideReason, setOverrideReason] = useState('');

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setState((current) => ({ ...current, deciding: false, error: null, loading: true }));
      try {
        const data = await fetchWorkspaceTransitionReviewSnapshot(
          projectId,
          workspaceId,
          snapshotId,
          signal
        );
        if (!signal?.aborted) setState({ data, deciding: false, error: null, loading: false });
      } catch (error) {
        if (signal?.aborted) return;
        setState({
          data: null,
          deciding: false,
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

  const decide = useCallback(
    async (
      outcome: WorkspaceTransitionOutcome,
      decisionReasonInput?: string
    ): Promise<WorkspaceReviewSnapshotCommitResult | null> => {
      const snapshot = state.data?.snapshot ?? null;
      if (!snapshot) {
        setState((current) => ({
          ...current,
          deciding: false,
          error: 'Load the immutable ReviewSnapshot before making a decision.',
        }));
        return null;
      }
      if (snapshot.transition.mode !== 'transition') {
        setState((current) => ({
          ...current,
          deciding: false,
          error: 'This ReviewSnapshot does not contain a decidable Transition.',
        }));
        return null;
      }

      const decisionReason = optionalText(decisionReasonInput);
      if (outcome === 'overridden' && !decisionReason) {
        setState((current) => ({
          ...current,
          deciding: false,
          error: 'Explain why this change should continue despite the failed check.',
        }));
        return null;
      }

      setState((current) => ({ ...current, deciding: true, error: null }));
      try {
        const decided = await decideWorkspaceTransition(projectId, workspaceId, {
          transitionId: snapshot.transitionId,
          outcome,
          ...(decisionReason === undefined ? {} : { decisionReason }),
          precondition: preconditionFromSnapshot(snapshot),
        });
        const nextSnapshot = decisionResponseToSnapshotEnvelope(decided);
        const commitId = committedTransitionId(decided.transition);
        if (commitId && !decided.workspace) {
          throw new Error('Committed Workspace response did not include the latest revision.');
        }
        setState({
          data: nextSnapshot,
          deciding: false,
          error: null,
          loading: false,
        });
        if (commitId) {
          dispatchCommitCreated({
            projectId,
            hash: commitId,
            branch: decided.review_snapshot.review.precondition.refName,
          });
        }
        return commitId && decided.workspace ? { commitId, workspace: decided.workspace } : null;
      } catch (error) {
        setState((current) => ({
          ...current,
          deciding: false,
          error: error instanceof Error ? error.message : 'Unable to decide this change.',
          loading: false,
        }));
        return null;
      }
    },
    [projectId, state.data?.snapshot, workspaceId]
  );

  return { decide, load, overrideReason, setOverrideReason, state };
}

function optionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function preconditionFromSnapshot(snapshot: ReviewSnapshotV1): WorkspaceTransitionPrecondition {
  const precondition = snapshot.review.precondition;
  return {
    workspace_revision: precondition.workspaceRevision,
    ref_head: precondition.refHead,
    effect_digest: precondition.effectDigest,
    proposal_digest: precondition.proposalDigest,
    statement_digests: [...precondition.statementDigests],
    policy_digest: precondition.policyDigest,
  };
}

function decisionResponseToSnapshotEnvelope(
  decided: WorkspaceTransitionDecisionResponse
): WorkspaceTransitionReviewSnapshotResponse {
  return {
    snapshot_id: decided.review_snapshot.snapshotId,
    snapshot_digest: decided.review_snapshot.snapshotDigest,
    project_id: decided.review_snapshot.projectId,
    workspace_id: decided.review_snapshot.workspaceId,
    transition_id: decided.transition_id,
    review_digest: decided.review_snapshot.review.digest,
    supersedes_snapshot_id: decided.review_snapshot.supersedes?.snapshotId ?? null,
    supersedes_snapshot_digest: decided.review_snapshot.supersedes?.snapshotDigest ?? null,
    snapshot: decided.review_snapshot,
    change_projection: decided.change_projection,
    created_at: decided.review_snapshot.createdAt,
  };
}

function committedTransitionId(view: TransitionViewV1): string | null {
  if (view.mode !== 'transition' || view.history.observation !== 'committed') return null;
  return view.history.commit.id;
}
