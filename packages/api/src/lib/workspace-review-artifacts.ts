import {
  buildReviewSnapshot,
  type ChangeProjectionV1,
  projectChangeFromReviewSnapshot,
  type ReviewSnapshotV1,
  type TransitionInspectionView,
} from '@t3x-dev/application';
import { type AnyDB, saveTransitionReviewSnapshot } from '@t3x-dev/storage';
import type { ProtocolValue } from '@t3x-dev/transition';
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
