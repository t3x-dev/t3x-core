'use client';

import type { ReviewSnapshotV1, WorkspaceAuthoringView } from '@t3x-dev/api-client';
import { useEffect, useMemo } from 'react';
import { schemaReviewHref } from '@/domain/schemas/schemaNavigation';
import {
  applySchemaContentPreparation,
  previewSchemaContentPreparation,
  previewStudioSelection,
  readStudioSchemaEditCandidate,
} from '@/infrastructure/schemaStudio';
import {
  ensureSchemaAuthoring,
  prepareSchemaWorkspaceReview,
  readLatestSchemaWorkspaceReview,
  readSchemaWorkspaceReviewDraft,
  type SchemaWorkspaceReviewInput,
} from '@/infrastructure/schemaWorkspaceReview';

type ReviewAttempt = {
  key: string;
  input: SchemaWorkspaceReviewInput;
  transitionId?: string;
};

export function useSchemaReviewFlow(projectId: string) {
  const scope = useMemo(
    () => ({
      projectId,
      active: true,
      generation: 0,
      attempts: new Map<string, ReviewAttempt>(),
      pending: new Map<string, Promise<string>>(),
    }),
    [projectId]
  );
  useEffect(() => {
    scope.active = true;
    return () => {
      scope.active = false;
      scope.generation++;
      scope.attempts.clear();
      scope.pending.clear();
    };
  }, [scope]);

  return useMemo(
    () => ({
      readEdit: (workspaceId: string) => readStudioSchemaEditCandidate(projectId, workspaceId),
      ensureAuthoring: (workspaceId: string) => ensureSchemaAuthoring(projectId, workspaceId),
      preview: (input: Parameters<typeof previewStudioSelection>[1]) =>
        previewStudioSelection(projectId, input),
      previewContent: (
        workspaceId: string,
        input: Parameters<typeof previewSchemaContentPreparation>[2]
      ) => previewSchemaContentPreparation(projectId, workspaceId, input),
      prepareContent: (
        workspaceId: string,
        input: Parameters<typeof applySchemaContentPreparation>[2]
      ) => applySchemaContentPreparation(projectId, workspaceId, input),
      review: (workspaceId: string) => {
        const pending = scope.pending.get(workspaceId);
        if (pending) return pending;
        const generation = scope.generation;
        const assertCurrent = () => {
          if (!scope.active || generation !== scope.generation)
            throw new Error('The Schema Review context changed. Open Review again.');
        };
        const run = async () => {
          const draft = await readSchemaWorkspaceReviewDraft(projectId, workspaceId);
          assertCurrent();
          if (draft.hasChanges === false)
            throw new Error('No changes to commit. Schema and content match the Base.');
          if (draft.synchronization?.required)
            throw new Error('The branch changed. Synchronize the Workspace before Review.');
          const key = JSON.stringify([
            draft.workspaceRevision,
            draft.compositionRevision,
            draft.basis.refName,
            draft.basis.refHead,
            draft.basis.baseDigest,
          ]);
          let attempt = scope.attempts.get(workspaceId);
          if (attempt?.key !== key) {
            scope.attempts.delete(workspaceId);
            attempt = undefined;
          }
          if (!attempt?.transitionId) {
            const latest = await readLatestSchemaWorkspaceReview(projectId, workspaceId);
            assertCurrent();
            if (
              latest?.schema_review &&
              matchesDraft(latest.snapshot, projectId, workspaceId, draft)
            )
              return schemaReviewHref(
                projectId,
                workspaceId,
                latest!.snapshot.snapshotId,
                draft.basis.refName
              );
            if (!attempt) {
              attempt = {
                key,
                input: {
                  request_id: crypto.randomUUID(),
                  expected_workspace_revision: draft.workspaceRevision,
                  expected_revision: draft.compositionRevision,
                  expected_ref_head: draft.basis.refHead,
                  reason: 'Review Schema changes and the complete Workspace Draft.',
                },
              };
              scope.attempts.set(workspaceId, attempt);
            }
            const reviewed = await prepareSchemaWorkspaceReview(
              projectId,
              workspaceId,
              attempt.input
            );
            assertCurrent();
            attempt.transitionId = reviewed.view.transition_id;
          }
          const saved = await readLatestSchemaWorkspaceReview(
            projectId,
            workspaceId,
            attempt.transitionId
          );
          assertCurrent();
          if (
            !saved?.schema_review ||
            !matchesDraft(saved.snapshot, projectId, workspaceId, draft) ||
            saved?.snapshot.transitionId !== attempt.transitionId
          )
            throw new Error('The saved Review is unavailable for this Draft. Retry Review.');
          return schemaReviewHref(
            projectId,
            workspaceId,
            saved!.snapshot.snapshotId,
            draft.basis.refName
          );
        };
        const request: Promise<string> = run().finally(() => {
          if (scope.pending.get(workspaceId) === request) scope.pending.delete(workspaceId);
        });
        scope.pending.set(workspaceId, request);
        return request;
      },
    }),
    [projectId, scope]
  );
}

function matchesDraft(
  snapshot: ReviewSnapshotV1 | undefined,
  projectId: string,
  workspaceId: string,
  draft: WorkspaceAuthoringView
) {
  return (
    snapshot?.projectId === projectId &&
    snapshot.workspaceId === workspaceId &&
    snapshot.review.precondition.workspaceRevision === draft.workspaceRevision &&
    snapshot.review.precondition.refName === draft.basis.refName &&
    snapshot.review.precondition.refHead === draft.basis.refHead
  );
}
