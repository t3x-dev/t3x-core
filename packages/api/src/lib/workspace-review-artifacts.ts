import {
  buildReviewSnapshot,
  buildTransitionDecisionCommand,
  type ChangeProjectionV1,
  projectChangeFromReviewSnapshot,
  type ReviewSnapshotV1,
  type TransitionInspectionView,
} from '@t3x-dev/application';
import {
  type AnyDB,
  listTransitionCommandResults,
  type StoredTransitionReviewSnapshot,
  saveTransitionReviewSnapshot,
} from '@t3x-dev/storage';
import { type ProtocolValue, parseDecisionStatement } from '@t3x-dev/transition';
import { canonicalTransitionRequest } from './transition-control-plane/materialize';

export interface WorkspaceReviewArtifacts {
  reviewSnapshot: ReviewSnapshotV1;
  changeProjection: ChangeProjectionV1;
}

function digestCanonicalSnapshotPayload(value: ProtocolValue): string {
  return canonicalTransitionRequest(value).digest;
}

export function buildWorkspaceReviewArtifacts(input: {
  inspection: TransitionInspectionView;
  createdAt: string;
}): WorkspaceReviewArtifacts {
  const reviewSnapshot = buildReviewSnapshot({
    inspection: input.inspection,
    createdAt: input.createdAt,
    digestCanonicalRequest: digestCanonicalSnapshotPayload,
  });
  return {
    reviewSnapshot,
    changeProjection: projectChangeFromReviewSnapshot(reviewSnapshot),
  };
}

export async function persistWorkspaceReviewArtifacts(
  db: AnyDB,
  artifacts: WorkspaceReviewArtifacts
): Promise<void> {
  await saveTransitionReviewSnapshot(db, {
    projectId: artifacts.reviewSnapshot.projectId,
    workspaceId: artifacts.reviewSnapshot.workspaceId,
    transitionId: artifacts.reviewSnapshot.transitionId,
    snapshot: artifacts.reviewSnapshot as unknown as Record<string, unknown>,
    changeProjection: artifacts.changeProjection as unknown as Record<string, unknown>,
  });
}

export function reviewSnapshotCreatedAt(inspection: TransitionInspectionView): string {
  if (inspection.transition.history.observation === 'committed') {
    return inspection.transition.history.commit.recordedAt;
  }
  if (inspection.transition.decision.observation === 'supplied') {
    return inspection.transition.decision.decidedAt;
  }
  return inspection.createdAt;
}

/** A generic Decision/Commit can have a receipt without a successor Workspace snapshot. */
export async function readWorkspaceReviewOutcome(
  db: AnyDB,
  record: StoredTransitionReviewSnapshot
) {
  if (
    record.changeProjection.status === 'committed' ||
    record.changeProjection.status === 'rejected'
  ) {
    return undefined;
  }
  const snapshot = record.snapshot as unknown as ReviewSnapshotV1;
  const results = await listTransitionCommandResults(db, record.projectId, record.transitionId);
  const commitsByDecision = new Map<string, string>();
  for (const { result, resultDigest } of results) {
    if (
      result.schema === 't3x/commit/v2' &&
      result.result.digest === snapshot.objects.result.digest
    ) {
      commitsByDecision.set(result.decision.digest, resultDigest);
    }
  }
  let latestDecision;
  for (const { requestDigest, resultDigest, result } of results) {
    if (result.schema !== 't3x/statement/v1' || result.predicateType !== 't3x.decision/v1')
      continue;
    const { outcome, rationale } = parseDecisionStatement(result).predicate;
    const command = buildTransitionDecisionCommand({
      outcome,
      rationale: rationale.mode === 'authored' ? rationale.value : undefined,
      precondition: snapshot.review.precondition,
      digestCanonicalRequest: digestCanonicalSnapshotPayload,
    });
    if (command.requestDigest !== requestDigest || command.reviewDigest !== record.reviewDigest)
      continue;
    const decision = { decision_digest: resultDigest, outcome };
    const commit = commitsByDecision.get(resultDigest);
    if (commit) return { ...decision, commit_digest: commit };
    latestDecision ??= decision;
  }
  return latestDecision;
}
