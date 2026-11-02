import type { ReviewSnapshotV1 } from '@t3x-dev/api-client';
import type { TransitionViewV1 } from '@t3x-dev/core';
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { workspaceCommitBlocker } from '@/domain/workspaces/changeDecision';
import { dispatchCommitCreated } from '@/hooks/commits/commitEvents';
import type {
  WorkspaceTransitionDecisionResponse,
  WorkspaceTransitionOutcome,
  WorkspaceTransitionPrecondition,
  WorkspaceTransitionReviewSnapshotResponse,
} from '@/infrastructure/workspaces';
import {
  decideWorkspaceTransition,
  fetchLatestWorkspaceTransitionReviewSnapshot,
  fetchWorkspaceTransitionReviewSnapshot,
} from '@/queries/workspaces';
import type { WorkspaceCandidate } from '@/types/workspaces';

type DecisionRequest = Parameters<typeof decideWorkspaceTransition>[2];

export interface WorkspaceReviewDecisionRecovery {
  outcome: WorkspaceTransitionOutcome;
  decisionReason?: string;
}

export interface WorkspaceReviewSnapshotState {
  data: WorkspaceTransitionReviewSnapshotResponse | null;
  deciding: boolean;
  error: string | null;
  loading: boolean;
  latestUnavailable?: boolean;
  recovery?: WorkspaceReviewDecisionRecovery;
}

export interface WorkspaceReviewSnapshotCommitResult {
  commitId: string;
  workspace: WorkspaceCandidate;
}

interface WorkspaceReviewSnapshotController {
  decide: (
    outcome: WorkspaceTransitionOutcome,
    decisionReason?: string
  ) => Promise<WorkspaceReviewSnapshotCommitResult | null>;
  load: (signal?: AbortSignal) => Promise<void>;
  overrideReason: string;
  setOverrideReason: Dispatch<SetStateAction<string>>;
  state: WorkspaceReviewSnapshotState;
  retryDecision?: () => Promise<WorkspaceReviewSnapshotCommitResult | null>;
}

const initialState: WorkspaceReviewSnapshotState = {
  data: null,
  deciding: false,
  error: null,
  loading: true,
};
const recoveryMessage =
  'The decision result is not confirmed. Refresh its result or retry the original decision.';

export function useWorkspaceReviewSnapshot(
  projectId: string,
  workspaceId: string,
  snapshotId: string
): WorkspaceReviewSnapshotController {
  const scope = `${projectId}:${workspaceId}:${snapshotId}`;
  const activeScope = useRef(scope);
  activeScope.current = scope;
  const epoch = useRef(0);
  const operation = useRef(0);
  const mounted = useRef(false);
  const reading = useRef(false);
  const deciding = useRef(false);
  const pendingDecision = useRef<DecisionRequest | null>(null);
  const [stored, setStored] = useState({ scope, value: initialState });
  const state = stored.scope === scope ? stored.value : initialState;
  const [overrideReason, setOverrideReason] = useState('');

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!mounted.current || activeScope.current !== scope || deciding.current) return;
      const currentEpoch = epoch.current;
      const token = ++operation.current;
      const isCurrent = () =>
        mounted.current &&
        activeScope.current === scope &&
        epoch.current === currentEpoch &&
        operation.current === token &&
        !signal?.aborted;
      reading.current = true;
      setStored((current) => ({
        scope,
        value: {
          ...(current.scope === scope ? current.value : initialState),
          error: null,
          loading: true,
        },
      }));
      let fixed: WorkspaceTransitionReviewSnapshotResponse | null = null;
      try {
        const pinned = await fetchWorkspaceTransitionReviewSnapshot(
          projectId,
          workspaceId,
          snapshotId,
          signal
        );
        if (!isCurrent()) return;
        assertSnapshotScope(pinned, projectId, workspaceId, pinned.transition_id);
        fixed = pinned;
        pendingDecision.current ??= readDecisionRecovery(
          projectId,
          workspaceId,
          fixed.transition_id
        );
        const latest = await fetchLatestWorkspaceTransitionReviewSnapshot(
          projectId,
          workspaceId,
          fixed.transition_id
        );
        if (!isCurrent()) return;
        assertSnapshotScope(latest, projectId, workspaceId, fixed.transition_id);
        if (isFinalSnapshot(latest)) {
          const wasRecovering = pendingDecision.current !== null;
          pendingDecision.current = null;
          writeDecisionRecovery(projectId, workspaceId, fixed.transition_id, null);
          if (wasRecovering) announceCommit(projectId, latest);
        }
        setStored({
          scope,
          value: {
            data: { ...latest, schema_review: latest.schema_review ?? fixed.schema_review },
            deciding: false,
            error: pendingDecision.current ? recoveryMessage : null,
            loading: false,
            ...(pendingDecision.current
              ? { recovery: recoverySummary(pendingDecision.current) }
              : {}),
          },
        });
      } catch (error) {
        if (!isCurrent()) return;
        setStored({
          scope,
          value: {
            data: fixed,
            deciding: false,
            error: error instanceof Error ? error.message : 'Unable to load the change review.',
            loading: false,
            latestUnavailable: true,
            ...(pendingDecision.current
              ? { recovery: recoverySummary(pendingDecision.current) }
              : {}),
          },
        });
      } finally {
        if (isCurrent()) reading.current = false;
      }
    },
    [projectId, scope, snapshotId, workspaceId]
  );

  useEffect(() => {
    mounted.current = true;
    ++epoch.current;
    reading.current = false;
    deciding.current = false;
    pendingDecision.current = null;
    setOverrideReason('');
    const controller = new AbortController();
    void load(controller.signal);
    return () => {
      mounted.current = false;
      ++epoch.current;
      controller.abort();
    };
  }, [load]);

  const decide = useCallback(
    async (
      outcome: WorkspaceTransitionOutcome,
      decisionReasonInput?: string
    ): Promise<WorkspaceReviewSnapshotCommitResult | null> => {
      if (
        !mounted.current ||
        activeScope.current !== scope ||
        reading.current ||
        deciding.current ||
        state.loading
      )
        return null;
      const data = state.data;
      const snapshot = data?.snapshot;
      const fail = (error: string) =>
        setStored((current) => ({ scope, value: { ...current.value, error } }));
      if (!data || !snapshot || snapshot.transition.mode !== 'transition') {
        fail('Load the immutable ReviewSnapshot before making a decision.');
        return null;
      }
      if (isFinalSnapshot(data)) return null;
      const decisionReason = optionalText(decisionReasonInput);
      const previous = pendingDecision.current;
      if (
        previous &&
        (previous.outcome !== outcome || previous.decisionReason !== decisionReason)
      ) {
        fail(recoveryMessage);
        return null;
      }
      if (!previous) {
        if (state.latestUnavailable) {
          fail('Refresh the latest result before making a decision.');
          return null;
        }
        const blocker = workspaceCommitBlocker(data.schema_review, snapshot.transition);
        if (outcome !== 'rejected' && blocker) {
          fail(blocker);
          return null;
        }
        if (outcome === 'overridden' && !decisionReason) {
          fail('Explain why this change should continue despite the failed check.');
          return null;
        }
      }
      // A transport failure must not turn a retry into a different Decision command.
      const request = previous ?? {
        transitionId: snapshot.transitionId,
        outcome,
        ...(decisionReason === undefined ? {} : { decisionReason }),
        precondition: preconditionFromSnapshot(snapshot),
      };
      pendingDecision.current = request;
      writeDecisionRecovery(projectId, workspaceId, request.transitionId, request);
      const currentEpoch = epoch.current;
      const token = ++operation.current;
      const isCurrent = () =>
        mounted.current &&
        activeScope.current === scope &&
        epoch.current === currentEpoch &&
        operation.current === token;
      deciding.current = true;
      setStored({ scope, value: { ...state, deciding: true, error: null } });
      const finish = (latest: WorkspaceTransitionReviewSnapshotResponse) => {
        pendingDecision.current = null;
        writeDecisionRecovery(projectId, workspaceId, request.transitionId, null);
        setStored({
          scope,
          value: {
            data: { ...latest, schema_review: latest.schema_review ?? data.schema_review },
            deciding: false,
            error: null,
            loading: false,
          },
        });
        announceCommit(projectId, latest);
      };
      try {
        const response = await decideWorkspaceTransition(projectId, workspaceId, request);
        if (!isCurrent()) return null;
        const latest = decisionResponseToSnapshotEnvelope(response);
        assertSnapshotScope(latest, projectId, workspaceId, request.transitionId);
        if (!isFinalSnapshot(latest)) throw new Error(recoveryMessage);
        finish(latest);
        const commitId = committedTransitionId(response.transition);
        return commitId && response.workspace ? { commitId, workspace: response.workspace } : null;
      } catch (error) {
        if (!isCurrent()) return null;
        try {
          const latest = await fetchLatestWorkspaceTransitionReviewSnapshot(
            projectId,
            workspaceId,
            request.transitionId
          );
          if (!isCurrent()) return null;
          assertSnapshotScope(latest, projectId, workspaceId, request.transitionId);
          if (isFinalSnapshot(latest)) {
            finish(latest);
            return null;
          }
        } catch {
          // The write may already have succeeded; retain its exact retry identity.
        }
        if (isCurrent())
          setStored({
            scope,
            value: {
              ...state,
              deciding: false,
              loading: false,
              error: `${error instanceof Error ? error.message : 'Unable to decide this change.'} ${recoveryMessage}`,
              recovery: recoverySummary(request),
            },
          });
        return null;
      } finally {
        if (isCurrent()) deciding.current = false;
      }
    },
    [projectId, scope, state, workspaceId]
  );

  const retryDecision = useCallback(async () => {
    const request = pendingDecision.current;
    return request ? decide(request.outcome, request.decisionReason) : null;
  }, [decide]);

  return { decide, load, overrideReason, setOverrideReason, state, retryDecision };
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

function assertSnapshotScope(
  data: WorkspaceTransitionReviewSnapshotResponse,
  projectId: string,
  workspaceId: string,
  transitionId: string
) {
  if (
    data.project_id !== projectId ||
    data.workspace_id !== workspaceId ||
    data.transition_id !== transitionId ||
    data.snapshot.projectId !== projectId ||
    data.snapshot.workspaceId !== workspaceId ||
    data.snapshot.transitionId !== transitionId
  )
    throw new Error('The latest result belongs to a different Review. Refresh this Review.');
}

function isFinalSnapshot(data: WorkspaceTransitionReviewSnapshotResponse) {
  const view = data.snapshot.transition;
  return (
    committedTransitionId(view) !== null ||
    (view.mode === 'transition' &&
      view.decision.observation === 'supplied' &&
      view.decision.outcome === 'rejected')
  );
}

function announceCommit(projectId: string, data: WorkspaceTransitionReviewSnapshotResponse) {
  const hash = committedTransitionId(data.snapshot.transition);
  if (hash)
    dispatchCommitCreated({ projectId, hash, branch: data.snapshot.review.precondition.refName });
}

function recoverySummary(request: DecisionRequest): WorkspaceReviewDecisionRecovery {
  return {
    outcome: request.outcome,
    ...(request.decisionReason ? { decisionReason: request.decisionReason } : {}),
  };
}

function recoveryKey(projectId: string, workspaceId: string, transitionId: string) {
  return `t3x:review-decision:${JSON.stringify([projectId, workspaceId, transitionId])}`;
}

function writeDecisionRecovery(
  projectId: string,
  workspaceId: string,
  transitionId: string,
  request: DecisionRequest | null
) {
  try {
    const key = recoveryKey(projectId, workspaceId, transitionId);
    if (request) window.sessionStorage.setItem(key, JSON.stringify(request));
    else window.sessionStorage.removeItem(key);
  } catch {
    // Browsers may disable session storage; the mounted hook still retains the request.
  }
}

function readDecisionRecovery(
  projectId: string,
  workspaceId: string,
  transitionId: string
): DecisionRequest | null {
  try {
    const value = JSON.parse(
      window.sessionStorage.getItem(recoveryKey(projectId, workspaceId, transitionId)) ?? 'null'
    );
    if (
      !value ||
      value.transitionId !== transitionId ||
      !['accepted', 'overridden', 'rejected'].includes(value.outcome) ||
      (value.decisionReason !== undefined && typeof value.decisionReason !== 'string')
    )
      return null;
    const precondition = value.precondition;
    if (
      !precondition ||
      !Number.isInteger(precondition.workspace_revision) ||
      !(precondition.ref_head === null || typeof precondition.ref_head === 'string') ||
      typeof precondition.effect_digest !== 'string' ||
      typeof precondition.proposal_digest !== 'string' ||
      typeof precondition.policy_digest !== 'string' ||
      !Array.isArray(precondition.statement_digests) ||
      !precondition.statement_digests.every((digest: unknown) => typeof digest === 'string')
    )
      return null;
    return {
      transitionId,
      outcome: value.outcome,
      ...(value.decisionReason === undefined ? {} : { decisionReason: value.decisionReason }),
      precondition: {
        workspace_revision: precondition.workspace_revision,
        ref_head: precondition.ref_head,
        effect_digest: precondition.effect_digest,
        proposal_digest: precondition.proposal_digest,
        statement_digests: [...precondition.statement_digests],
        policy_digest: precondition.policy_digest,
      },
    };
  } catch {
    return null;
  }
}
