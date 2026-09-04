import type { ActionCapabilityView, TransitionViewV1 } from '@t3x-dev/core';
import type { ObjectDescriptor, ProtocolValue } from '@t3x-dev/transition';
import type { TransitionInspectionView } from '../transition/inspect';
import {
  normalizedTransitionReviewPrecondition,
  type TransitionReviewPrecondition,
} from '../transition/lifecycle';
import {
  deriveWorkspaceCurrentness,
  type WorkspaceCurrentnessView,
  type WorkspaceInteractionId,
} from '../workspace/contracts';

export const REVIEW_SNAPSHOT_SCHEMA = 't3x.application/review-snapshot/v1' as const;
export const CHANGE_PROJECTION_SCHEMA = 't3x.application/change-projection/v1' as const;

export interface ReviewSnapshotSupersedes {
  readonly snapshotId: string;
  readonly snapshotDigest: string;
}

export interface ReviewSnapshotV1 {
  readonly schema: typeof REVIEW_SNAPSHOT_SCHEMA;
  readonly version: 1;
  readonly snapshotId: string;
  readonly snapshotDigest: string;
  readonly createdAt: string;
  readonly supersedes?: ReviewSnapshotSupersedes;
  readonly projectId: string;
  readonly workspaceId: string;
  readonly transitionId: string;
  readonly request: {
    readonly kind: TransitionInspectionView['requestKind'];
    readonly id: string;
    readonly createdAt: string;
  };
  readonly review: {
    readonly digest: string;
    readonly precondition: TransitionReviewPrecondition;
  };
  readonly objects: {
    readonly base: ObjectDescriptor;
    readonly result: ObjectDescriptor;
    readonly effect: ObjectDescriptor;
    readonly proposal: ObjectDescriptor;
    readonly statements: readonly ObjectDescriptor[];
    readonly decision?: ObjectDescriptor;
    readonly commit?: ObjectDescriptor;
  };
  readonly transition: TransitionViewV1;
}

export type ChangeProjectionStatus =
  | 'reviewing'
  | 'accepted'
  | 'overridden'
  | 'rejected'
  | 'committed';

export type ChangeProjectionStageId = 'draft' | 'review' | 'decision' | 'commit';

export type ChangeProjectionStageStatus =
  | 'pending'
  | 'ready'
  | 'needs_attention'
  | 'done'
  | 'blocked'
  | 'not_applicable';

export interface ChangeProjectionStageSummary {
  readonly id: ChangeProjectionStageId;
  readonly label: string;
  readonly status: ChangeProjectionStageStatus;
  readonly summary: string;
}

export interface ChangeProjectionNextAction {
  readonly id: WorkspaceInteractionId;
  readonly label: string;
  readonly reason: string;
}

export interface ChangeProjectionRevisionComparison {
  readonly base: ObjectDescriptor;
  readonly result: ObjectDescriptor;
  readonly operationCount: number;
  readonly changedPaths: readonly string[];
}

export interface ChangeProjectionExplanation {
  readonly id: 'change_scope' | 'currentness' | 'next_action';
  readonly source: 'derived_projection';
  readonly title: string;
  readonly body: string;
}

export interface ChangeProjectionV1 {
  readonly schema: typeof CHANGE_PROJECTION_SCHEMA;
  readonly version: 1;
  readonly authoritative: false;
  readonly source: {
    readonly kind: 'review_snapshot';
    readonly snapshotId: string;
    readonly snapshotDigest: string;
    readonly snapshotCreatedAt: string;
  };
  readonly projectId: string;
  readonly workspaceId: string;
  readonly transitionId: string;
  readonly title: string;
  readonly status: ChangeProjectionStatus;
  readonly currentness: WorkspaceCurrentnessView;
  readonly stages: readonly ChangeProjectionStageSummary[];
  readonly nextAction?: ChangeProjectionNextAction;
  readonly revisionComparison: ChangeProjectionRevisionComparison;
  readonly explanations: readonly ChangeProjectionExplanation[];
  readonly review: {
    readonly digest: string;
    readonly refName: string;
    readonly refHead: string | null;
    readonly workspaceRevision: number;
    readonly policyDigest: string;
  };
  readonly objects: ReviewSnapshotV1['objects'];
  readonly checks: TransitionViewV1['checks'];
  readonly actions: {
    readonly accept: ActionCapabilityView;
    readonly override: ActionCapabilityView;
    readonly reject: ActionCapabilityView;
    readonly commit: ActionCapabilityView;
    readonly revert: ActionCapabilityView;
  };
}

export class ReviewSnapshotPolicyRequiredError extends Error {
  readonly code = 'REVIEW_SNAPSHOT_POLICY_REQUIRED';

  constructor() {
    super('ReviewSnapshot requires a server-selected policy digest');
    this.name = 'ReviewSnapshotPolicyRequiredError';
  }
}

export class ReviewSnapshotStaleError extends Error {
  readonly code = 'REVIEW_SNAPSHOT_STALE';

  constructor(readonly reasons: readonly string[]) {
    super(`ReviewSnapshot is stale: ${reasons.join(', ')}`);
    this.name = 'ReviewSnapshotStaleError';
  }
}

function comparePortable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedStrings(values: readonly string[]): string[] {
  return [...values].sort(comparePortable);
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const orderedLeft = sortedStrings(left);
  const orderedRight = sortedStrings(right);
  return orderedLeft.every((value, index) => value === orderedRight[index]);
}

function reviewPreconditionFromInspection(
  inspection: TransitionInspectionView
): TransitionReviewPrecondition {
  if (inspection.precondition.policyDigest === null) {
    throw new ReviewSnapshotPolicyRequiredError();
  }
  return {
    workspaceRevision: inspection.precondition.workspaceRevision,
    refName: inspection.precondition.refName,
    refHead: inspection.precondition.refHead,
    effectDigest: inspection.precondition.effectDigest,
    proposalDigest: inspection.precondition.proposalDigest,
    statementDigests: sortedStrings(inspection.precondition.statementDigests),
    policyDigest: inspection.precondition.policyDigest,
  };
}

function snapshotIdFromDigest(digest: string): string {
  const suffix = digest.startsWith('sha256:') ? digest.slice('sha256:'.length) : digest;
  return `rvs_${suffix.slice(0, 32)}`;
}

function descriptorPayload(descriptor: ObjectDescriptor): ProtocolValue {
  return {
    kind: descriptor.kind,
    schema: descriptor.schema,
    digest: descriptor.digest,
  };
}

function reviewSnapshotPayload(input: {
  createdAt: string;
  supersedes?: ReviewSnapshotSupersedes;
  inspection: TransitionInspectionView;
  reviewDigest: string;
  precondition: TransitionReviewPrecondition;
}): ProtocolValue {
  return {
    schema: REVIEW_SNAPSHOT_SCHEMA,
    version: 1,
    created_at: input.createdAt,
    ...(input.supersedes === undefined
      ? {}
      : {
          supersedes: {
            snapshot_id: input.supersedes.snapshotId,
            snapshot_digest: input.supersedes.snapshotDigest,
          },
        }),
    project_id: input.inspection.projectId,
    workspace_id: input.inspection.workspaceId,
    transition_id: input.inspection.transitionId,
    request: {
      kind: input.inspection.requestKind,
      id: input.inspection.requestId,
      created_at: input.inspection.createdAt,
    },
    review: {
      digest: input.reviewDigest,
      precondition: normalizedTransitionReviewPrecondition(input.precondition),
    },
    objects: {
      base: descriptorPayload(input.inspection.transition.change.base),
      result: descriptorPayload(input.inspection.transition.change.result),
      effect: descriptorPayload(input.inspection.transition.audit.effect),
      proposal: descriptorPayload(input.inspection.transition.audit.proposal),
      statements: input.inspection.transition.audit.statements.map((statement) =>
        descriptorPayload(statement.statement)
      ),
      ...(input.inspection.transition.audit.decision === undefined
        ? {}
        : { decision: descriptorPayload(input.inspection.transition.audit.decision) }),
      ...(input.inspection.transition.audit.commit === undefined
        ? {}
        : { commit: descriptorPayload(input.inspection.transition.audit.commit) }),
    },
  };
}

export function buildReviewSnapshot(input: {
  inspection: TransitionInspectionView;
  createdAt: string;
  supersedes?: ReviewSnapshotSupersedes;
  digestCanonicalRequest: (value: ProtocolValue) => string;
}): ReviewSnapshotV1 {
  const precondition = reviewPreconditionFromInspection(input.inspection);
  const reviewDigest = input.digestCanonicalRequest(
    normalizedTransitionReviewPrecondition(precondition)
  );
  const payload = reviewSnapshotPayload({
    createdAt: input.createdAt,
    ...(input.supersedes === undefined ? {} : { supersedes: input.supersedes }),
    inspection: input.inspection,
    reviewDigest,
    precondition,
  });
  const snapshotDigest = input.digestCanonicalRequest(payload);

  return {
    schema: REVIEW_SNAPSHOT_SCHEMA,
    version: 1,
    snapshotId: snapshotIdFromDigest(snapshotDigest),
    snapshotDigest,
    createdAt: input.createdAt,
    ...(input.supersedes === undefined ? {} : { supersedes: { ...input.supersedes } }),
    projectId: input.inspection.projectId,
    workspaceId: input.inspection.workspaceId,
    transitionId: input.inspection.transitionId,
    request: {
      kind: input.inspection.requestKind,
      id: input.inspection.requestId,
      createdAt: input.inspection.createdAt,
    },
    review: {
      digest: reviewDigest,
      precondition,
    },
    objects: {
      base: { ...input.inspection.transition.change.base },
      result: { ...input.inspection.transition.change.result },
      effect: { ...input.inspection.transition.audit.effect },
      proposal: { ...input.inspection.transition.audit.proposal },
      statements: input.inspection.transition.audit.statements.map((statement) => ({
        ...statement.statement,
      })),
      ...(input.inspection.transition.audit.decision === undefined
        ? {}
        : { decision: { ...input.inspection.transition.audit.decision } }),
      ...(input.inspection.transition.audit.commit === undefined
        ? {}
        : { commit: { ...input.inspection.transition.audit.commit } }),
    },
    transition: structuredClone(input.inspection.transition),
  };
}

export function assertReviewSnapshotCurrent(input: {
  snapshot: ReviewSnapshotV1;
  inspection: TransitionInspectionView;
}): void {
  const current = reviewPreconditionFromInspection(input.inspection);
  const pinned = input.snapshot.review.precondition;
  const reasons: string[] = [];
  if (pinned.workspaceRevision !== current.workspaceRevision) reasons.push('workspace_revision');
  if (pinned.refName !== current.refName) reasons.push('ref_name');
  if (pinned.refHead !== current.refHead) reasons.push('ref_head');
  if (pinned.effectDigest !== current.effectDigest) reasons.push('effect_digest');
  if (pinned.proposalDigest !== current.proposalDigest) reasons.push('proposal_digest');
  if (pinned.policyDigest !== current.policyDigest) reasons.push('policy_digest');
  if (!sameStringSet(pinned.statementDigests, current.statementDigests)) {
    reasons.push('statement_digests');
  }
  if (reasons.length > 0) throw new ReviewSnapshotStaleError(reasons);
}

function projectionTitle(snapshot: ReviewSnapshotV1): string {
  const intent = snapshot.transition.claims.intent;
  if ('value' in intent && intent.value.trim().length > 0) return intent.value;
  return `Transition ${snapshot.transitionId}`;
}

function projectionStatus(snapshot: ReviewSnapshotV1): ChangeProjectionStatus {
  if (snapshot.transition.history.observation === 'committed') return 'committed';
  if (snapshot.transition.decision.observation === 'not_supplied') return 'reviewing';
  return snapshot.transition.decision.outcome;
}

function snapshotFingerprint(snapshot: ReviewSnapshotV1) {
  const precondition = snapshot.review.precondition;
  return {
    draftRevision: precondition.workspaceRevision,
    refHead: precondition.refHead,
    effectDigest: precondition.effectDigest,
    proposalDigest: precondition.proposalDigest,
    statementDigests: [...precondition.statementDigests],
    policyDigest: precondition.policyDigest,
  };
}

function projectionCurrentness(snapshot: ReviewSnapshotV1): WorkspaceCurrentnessView {
  const fingerprint = snapshotFingerprint(snapshot);
  const decisionOutcome =
    snapshot.transition.decision.observation === 'supplied'
      ? snapshot.transition.decision.outcome
      : undefined;
  return deriveWorkspaceCurrentness({
    snapshot: {
      ...fingerprint,
      ...(decisionOutcome === undefined ? {} : { decisionOutcome }),
    },
    current: fingerprint,
  });
}

function projectionStages(snapshot: ReviewSnapshotV1): ChangeProjectionStageSummary[] {
  const status = projectionStatus(snapshot);
  const decisionOutcome =
    snapshot.transition.decision.observation === 'supplied'
      ? snapshot.transition.decision.outcome
      : undefined;
  const decisionSupplied = decisionOutcome !== undefined;
  const decisionAllowed = [
    snapshot.transition.capabilities.accept,
    snapshot.transition.capabilities.override,
    snapshot.transition.capabilities.reject,
  ].some((capability) => capability.disposition === 'allowed');
  const failedCheck = hasFailedCheck(snapshot.transition.checks);
  return [
    {
      id: 'draft',
      label: 'CAS Draft',
      status: 'done',
      summary: 'Draft content was bound into this immutable ReviewSnapshot.',
    },
    {
      id: 'review',
      label: 'Check',
      status: failedCheck ? 'needs_attention' : 'done',
      summary: failedCheck
        ? 'At least one check needs a human accept/reject/override decision.'
        : 'Replay and policy-visible statements were projected into the review.',
    },
    {
      id: 'decision',
      label: 'Decision',
      status: decisionSupplied ? 'done' : decisionAllowed ? 'ready' : 'blocked',
      summary: decisionSupplied
        ? `Decision recorded as ${decisionOutcome}.`
        : decisionAllowed
          ? 'A permitted decision action is available.'
          : 'No decision action is currently permitted by the projected policy.',
    },
    {
      id: 'commit',
      label: 'Commit receipt',
      status:
        status === 'committed'
          ? 'done'
          : status === 'rejected'
            ? 'not_applicable'
            : decisionSupplied
              ? 'ready'
              : 'pending',
      summary:
        status === 'committed'
          ? 'CommitV2 advanced the branch and produced a receipt.'
          : status === 'rejected'
            ? 'Rejected decisions remain auditable without advancing history.'
            : decisionSupplied
              ? 'An accepted or overridden decision can create an exact commit.'
              : 'Commit is only available after an accepted or overridden decision.',
    },
  ];
}

function projectionNextAction(snapshot: ReviewSnapshotV1): ChangeProjectionNextAction | undefined {
  const status = projectionStatus(snapshot);
  if (status === 'committed') {
    return {
      id: 'receipt.copy',
      label: 'Copy receipt',
      reason: 'The change has a commit receipt and immutable audit trail.',
    };
  }
  if (status === 'rejected') {
    return {
      id: 'review.edit_in_compose',
      label: 'Edit in Workspace',
      reason:
        'The rejected decision did not advance history; revise the draft before reviewing again.',
    };
  }
  if (snapshot.transition.decision.observation === 'supplied') {
    return {
      id: 'commit.exact',
      label: 'Create exact commit',
      reason:
        'The decision is recorded; commit can advance the branch if the precondition still holds.',
    };
  }
  if (snapshot.transition.capabilities.accept.disposition === 'allowed') {
    return {
      id: 'review.accept',
      label: 'Approve and save',
      reason: 'Policy permits accepting this verified review.',
    };
  }
  if (snapshot.transition.capabilities.override.disposition === 'allowed') {
    return {
      id: 'review.override',
      label: 'Continue with override',
      reason: 'Policy permits an explicit override with a reason.',
    };
  }
  if (snapshot.transition.capabilities.reject.disposition === 'allowed') {
    return {
      id: 'review.reject',
      label: 'Reject change',
      reason: 'Policy permits recording a rejection without advancing history.',
    };
  }
  return {
    id: 'review.retry',
    label: 'Review again',
    reason: 'The current projection does not expose a permitted decision action.',
  };
}

function projectionRevisionComparison(
  snapshot: ReviewSnapshotV1
): ChangeProjectionRevisionComparison {
  return {
    base: { ...snapshot.objects.base },
    result: { ...snapshot.objects.result },
    operationCount: snapshot.transition.change.operations.length,
    changedPaths: snapshot.transition.change.operations.map(operationPath),
  };
}

function operationPath(operation: unknown, index: number): string {
  if (typeof operation !== 'object' || operation === null) return `operation:${index + 1}`;
  if (!('path' in operation)) return `operation:${index + 1}`;
  const path = (operation as { path?: unknown }).path;
  if (Array.isArray(path)) return path.map(String).join('/');
  if (typeof path === 'string' && path.trim().length > 0) return path;
  return `operation:${index + 1}`;
}

function projectionExplanations(input: {
  comparison: ChangeProjectionRevisionComparison;
  currentness: WorkspaceCurrentnessView;
  nextAction?: ChangeProjectionNextAction;
}): ChangeProjectionExplanation[] {
  return [
    {
      id: 'change_scope',
      source: 'derived_projection',
      title: 'Revision comparison',
      body: `${input.comparison.operationCount} structured operation${
        input.comparison.operationCount === 1 ? '' : 's'
      } move the base State ${shortDigest(input.comparison.base.digest)} to result State ${shortDigest(
        input.comparison.result.digest
      )}.`,
    },
    {
      id: 'currentness',
      source: 'derived_projection',
      title: 'Currentness',
      body:
        input.currentness.reasons.length === 0
          ? `This projection is ${input.currentness.state}; no stale reason is currently projected.`
          : `This projection is ${input.currentness.state}: ${input.currentness.reasons.join(
              ', '
            )}.`,
    },
    {
      id: 'next_action',
      source: 'derived_projection',
      title: 'Next action',
      body: input.nextAction
        ? `${input.nextAction.label}: ${input.nextAction.reason}`
        : 'No next action is projected.',
    },
  ];
}

function shortDigest(value: string): string {
  const normalized = value.startsWith('sha256:') ? value.slice('sha256:'.length) : value;
  if (normalized.length <= 12) return normalized;
  return `${normalized.slice(0, 12)}…`;
}

function hasFailedCheck(checks: TransitionViewV1['checks']): boolean {
  return Object.values(checks).some((check) => {
    if (typeof check !== 'object' || check === null) return false;
    if (!('outcomes' in check) || !Array.isArray(check.outcomes)) return false;
    return (check.outcomes as readonly string[]).some((outcome) =>
      ['failed', 'invalid', 'denied', 'error'].includes(outcome)
    );
  });
}

export function projectChangeFromReviewSnapshot(snapshot: ReviewSnapshotV1): ChangeProjectionV1 {
  const currentness = projectionCurrentness(snapshot);
  const nextAction = projectionNextAction(snapshot);
  const revisionComparison = projectionRevisionComparison(snapshot);
  return {
    schema: CHANGE_PROJECTION_SCHEMA,
    version: 1,
    authoritative: false,
    source: {
      kind: 'review_snapshot',
      snapshotId: snapshot.snapshotId,
      snapshotDigest: snapshot.snapshotDigest,
      snapshotCreatedAt: snapshot.createdAt,
    },
    projectId: snapshot.projectId,
    workspaceId: snapshot.workspaceId,
    transitionId: snapshot.transitionId,
    title: projectionTitle(snapshot),
    status: projectionStatus(snapshot),
    currentness,
    stages: projectionStages(snapshot),
    nextAction,
    revisionComparison,
    explanations: projectionExplanations({
      comparison: revisionComparison,
      currentness,
      nextAction,
    }),
    review: {
      digest: snapshot.review.digest,
      refName: snapshot.review.precondition.refName,
      refHead: snapshot.review.precondition.refHead,
      workspaceRevision: snapshot.review.precondition.workspaceRevision,
      policyDigest: snapshot.review.precondition.policyDigest,
    },
    objects: structuredClone(snapshot.objects),
    checks: structuredClone(snapshot.transition.checks),
    actions: structuredClone(snapshot.transition.capabilities),
  };
}

export function withChangeProjectionCurrentness(
  projection: ChangeProjectionV1,
  currentness: WorkspaceCurrentnessView
): ChangeProjectionV1 {
  const revisionComparison = (
    projection as { revisionComparison?: ChangeProjectionRevisionComparison }
  ).revisionComparison;
  if (revisionComparison === undefined) {
    return {
      ...projection,
      currentness: { state: currentness.state, reasons: [...currentness.reasons] },
    };
  }
  return {
    ...projection,
    currentness: { state: currentness.state, reasons: [...currentness.reasons] },
    explanations: projectionExplanations({
      comparison: revisionComparison,
      currentness,
      nextAction: projection.nextAction,
    }),
  };
}
