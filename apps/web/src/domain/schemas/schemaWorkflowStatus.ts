import type {
  StudioPreview,
  WorkspaceAuthoringView,
  WorkspaceTransitionReviewSnapshotEnvelope,
} from '@t3x-dev/api-client';
import { canonicalJson } from '@t3x-dev/yops';

/** Presentation only. Adoption still requires the server's exact Review precondition. */
export function schemaWorkflowStatus({
  draft,
  preview,
  latest,
  hasDefinition,
}: {
  draft?: WorkspaceAuthoringView;
  preview?: StudioPreview;
  latest?: WorkspaceTransitionReviewSnapshotEnvelope | null;
  hasDefinition: boolean;
}) {
  const candidateChanged = Boolean(
    hasDefinition &&
      preview?.workspace &&
      (preview.workspace.binding === null ||
        preview.workspace.changes.length > 0 ||
        preview.workspace.canBind ||
        preview.impact?.content.ready === false)
  );
  const hasChanges = candidateChanged || draft?.hasChanges === true;
  const snapshot = latest?.snapshot;
  const precondition = snapshot?.review.precondition;
  const sameBase = Boolean(
    draft &&
      precondition &&
      precondition.refName === draft.basis.refName &&
      precondition.refHead === draft.basis.refHead
  );
  const frozen = latest?.schema_review;
  const sameContent = Boolean(
    sameBase &&
      frozen &&
      draft?.current !== undefined &&
      preview &&
      frozen.draft.status === 'bound' &&
      frozen.draft.schemaHash === preview.schemaHash &&
      canonicalJson(frozen.draftContent) === canonicalJson(draft.current)
  );
  const sameRevision = Boolean(
    frozen &&
      sameBase &&
      !candidateChanged &&
      precondition?.workspaceRevision === draft?.workspaceRevision
  );
  const transition = snapshot?.transition;
  const hasRejection = Boolean(
    transition?.mode === 'transition' &&
      transition.decision.observation === 'supplied' &&
      transition.decision.outcome === 'rejected'
  );
  // An old rejection can describe unchanged content; an undecided old snapshot
  // cannot authorize a newer revision, even when the content matches.
  const matchesReview = sameRevision || (hasRejection && sameContent);
  const rejected = matchesReview && hasRejection;
  return { hasChanges, matchesReview, rejected, hasNewChanges: hasChanges && !matchesReview };
}
