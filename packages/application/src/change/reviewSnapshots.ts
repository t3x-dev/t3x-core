import type { ActionCapabilityView, TransitionViewV1 } from '@t3x-dev/core';
import type { ObjectDescriptor, ProtocolValue } from '@t3x-dev/transition';
import type { TransitionInspectionView } from '../transition/inspect';
import {
  normalizedTransitionReviewPrecondition,
  type TransitionReviewPrecondition,
} from '../transition/lifecycle';

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

export function projectChangeFromReviewSnapshot(snapshot: ReviewSnapshotV1): ChangeProjectionV1 {
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
