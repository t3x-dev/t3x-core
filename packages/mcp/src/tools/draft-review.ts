import { T3xApiError } from '@t3x-dev/api-client';
import { withTransitionApi } from './transition/index.js';
import type { ToolDef, ToolHandler } from './types.js';

export const draftReviewDef: ToolDef = {
  name: 't3x_draft_review',
  description: [
    'Prepare a fixed Review of the complete saved Workspace Draft, or read an existing Review by snapshot ID. Requires the API backend.',
    'For prepare, pass the exact revisions and basis head from the saved Draft. Preparation runs server-side checks and leaves Decision and Commit to separate tools.',
    'For read, pass snapshot_id. The snapshot provides fixed operations, checks, evidence, and Decision preconditions.',
  ].join('\n'),
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['prepare', 'read'] },
      project_id: { type: 'string' },
      workspace_id: { type: 'string' },
      request_id: { type: 'string', description: 'Caller request ID for an exact prepare retry.' },
      expected_workspace_revision: { type: 'integer', minimum: 1 },
      expected_revision: {
        type: 'integer',
        minimum: 0,
        description: 'Draft composition revision.',
      },
      expected_ref_head: {
        type: ['string', 'null'],
        description: 'Draft basis head; null for an empty ref.',
      },
      reason: { type: 'string', maxLength: 2000 },
      snapshot_id: { type: 'string', description: 'Exact saved Review snapshot ID to read.' },
    },
    required: ['action', 'project_id', 'workspace_id'],
  },
};

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export const draftReviewHandler: ToolHandler = async (args) =>
  withTransitionApi(async ({ workspaces }) => {
    const {
      action,
      project_id: projectId,
      workspace_id: workspaceId,
      snapshot_id: snapshotId,
    } = args;
    if (!nonempty(projectId) || !nonempty(workspaceId)) {
      throw new T3xApiError('INVALID_ARGUMENT', 'project_id and workspace_id are required.', 400);
    }

    if (action === 'read') {
      if (!nonempty(snapshotId)) {
        throw new T3xApiError('INVALID_ARGUMENT', 'read requires snapshot_id.', 400);
      }
      return workspaces.getReviewSnapshot(projectId, workspaceId, snapshotId);
    }
    if (action !== 'prepare') {
      throw new T3xApiError('INVALID_ARGUMENT', 'action must be prepare or read.', 400);
    }

    const {
      request_id,
      expected_workspace_revision,
      expected_revision,
      expected_ref_head,
      reason,
    } = args;
    if (
      !nonempty(request_id) ||
      typeof expected_workspace_revision !== 'number' ||
      !Number.isSafeInteger(expected_workspace_revision) ||
      expected_workspace_revision < 1 ||
      typeof expected_revision !== 'number' ||
      !Number.isSafeInteger(expected_revision) ||
      expected_revision < 0 ||
      (expected_ref_head !== null && !nonempty(expected_ref_head))
    ) {
      throw new T3xApiError(
        'INVALID_ARGUMENT',
        'prepare requires request_id, expected_workspace_revision, expected_revision, and expected_ref_head.',
        400
      );
    }
    if (reason !== undefined && (!nonempty(reason) || reason.trim().length > 2000)) {
      throw new T3xApiError('INVALID_ARGUMENT', 'reason must be 1 to 2000 characters.', 400);
    }

    const prepared = await workspaces.authoring.prepareReview(projectId, workspaceId, {
      request_id,
      expected_workspace_revision,
      expected_revision,
      expected_ref_head,
      ...(reason === undefined ? {} : { reason }),
    });
    const { transition_id: transitionId, precondition, transition } = prepared.view;
    if (precondition.policy_digest === null) {
      throw new T3xApiError(
        'REVIEW_SNAPSHOT_POLICY_REQUIRED',
        'The Transition has no applicable policy, so no fixed Review snapshot was created.',
        409,
        { transition_id: transitionId, checks: transition.checks }
      );
    }

    const latest = await workspaces.getLatestReviewSnapshot(projectId, workspaceId, {
      transition_id: transitionId,
    });
    const review = await workspaces.getReviewSnapshot(projectId, workspaceId, latest.snapshot_id);
    if (
      review.snapshot_id !== latest.snapshot_id ||
      review.snapshot_digest !== latest.snapshot_digest ||
      review.transition_id !== transitionId ||
      review.review_digest !== precondition.review_digest
    ) {
      throw new T3xApiError(
        'REVIEW_SNAPSHOT_STALE',
        'The saved Review snapshot does not match the prepared Transition precondition.',
        409,
        { transition_id: transitionId }
      );
    }
    return { status: 'prepared', ...prepared, review };
  });
