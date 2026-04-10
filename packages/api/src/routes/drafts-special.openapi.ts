/**
 * Drafts Special Routes
 *
 * Special / less-common operations for Draft management.
 * - POST /v1/drafts/auto            - Create auto-draft from conversation
 * - POST /v1/drafts/:id/promote     - Promote auto-draft to editing
 * - POST /v1/drafts/:id/review-action - Perform review action on semantic point
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  ConflictError,
  findDraftById,
  insertExtractionFeedback,
  promoteDraft,
  updateDraft,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { ErrorResponseSchema, IdParamSchema, SuccessResponseSchema } from '../schemas/common';
import { DraftResponse, ReviewActionRequest, ReviewActionResponse } from '../schemas/contracts';
import { toApiDraft } from './drafts-crud.openapi';

export const draftsSpecialRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================
// Route Definitions
// ============================================================

// POST /v1/drafts/:id/promote
const promoteDraftRoute = createRoute({
  method: 'post',
  path: '/v1/drafts/{id}/promote',
  tags: ['Drafts'],
  summary: 'Promote auto-draft to editing status (Upgrade #7)',
  request: { params: IdParamSchema },
  responses: {
    200: {
      description: 'Draft promoted to editing',
      content: { 'application/json': { schema: SuccessResponseSchema(DraftResponse) } },
    },
    400: {
      description: 'Draft not in auto status',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Draft not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// POST /v1/drafts/:id/review-action
const reviewActionRoute = createRoute({
  method: 'post',
  path: '/v1/drafts/{id}/review-action',
  tags: ['Drafts'],
  summary: 'Perform a review action on a semantic point',
  request: {
    params: IdParamSchema,
    body: {
      content: { 'application/json': { schema: ReviewActionRequest } },
    },
  },
  responses: {
    200: {
      description: 'Action applied',
      content: { 'application/json': { schema: ReviewActionResponse } },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Draft or semantic point not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    409: {
      description: 'Conflict',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// ============================================================
// Route Handlers
// ============================================================

// POST /v1/drafts/:id/promote
draftsSpecialRoutes.openapi(promoteDraftRoute, async (c) => {
  const { id } = c.req.valid('param');

  try {
    const db = await getDB();
    const promoted = await promoteDraft(db, id);

    return c.json({ success: true as const, data: toApiDraft(promoted) }, 200);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message.includes('not found')) {
        return errorResponse(c, 'NOT_FOUND', err.message);
      }
      if (err.message.includes('Cannot promote')) {
        return errorResponse(c, 'INVALID_REQUEST', err.message);
      }
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'PROMOTE_FAILED', message);
  }
});

// POST /v1/drafts/:id/review-action
draftsSpecialRoutes.openapi(reviewActionRoute, async (c) => {
  const { id: draftId } = c.req.valid('param');
  const { sp_id, action, edited_text } = c.req.valid('json');

  try {
    const db = await getDB();
    const draft = await findDraftById(db, draftId);
    if (!draft) return errorResponse(c, 'NOT_FOUND', 'Draft not found');

    // SemanticPoint type is no longer exported; use structural typing
    const sps = [...((draft.semantic_points ?? []) as Array<{
      id: string;
      text: string;
      zone: string;
      status: string;
      staged: boolean;
      inference_type?: string;
      low_coverage?: boolean;
      [key: string]: unknown;
    }>)];
    const idx = sps.findIndex((sp) => sp.id === sp_id);
    if (idx === -1) return errorResponse(c, 'NOT_FOUND', 'Semantic point not found');

    const sp = sps[idx];

    switch (action) {
      case 'accept':
        // Move from review to ready, mark as reviewed
        sps[idx] = { ...sp, zone: 'ready', status: 'reviewed', staged: true };
        break;

      case 'accept_change':
        sps[idx] = { ...sp, zone: 'ready', status: 'modified', staged: true };
        break;

      case 'dismiss':
        // Remove from list
        sps.splice(idx, 1);
        break;

      case 'undo':
        // Mark as undone (in ready zone)
        sps[idx] = { ...sp, status: 'undone', staged: false };
        break;

      case 'edit':
        if (!edited_text) {
          return errorResponse(c, 'INVALID_REQUEST', 'edited_text required for edit action');
        }
        sps[idx] = { ...sp, text: edited_text, zone: 'ready', status: 'reviewed', staged: true };
        break;
    }

    await updateDraft(db, draftId, { semantic_points: sps }, draft.revision);

    // Record node modification audit trail — fire-and-forget
    try {
      const { insertNodeModification } = await import('@t3x-dev/storage');
      await insertNodeModification(db, {
        draft_id: draftId,
        sp_id: sp_id,
        action: action === 'accept_change' ? 'accept' : action === 'dismiss' ? 'delete' : action,
        previous_text: sp.text,
        new_text: action === 'edit' ? edited_text : undefined,
        actor: 'user',
      });
    } catch {
      // Audit is non-blocking — don't fail the main action
    }

    // Record extraction feedback (L4 anchoring) — fire-and-forget
    // Map UI actions to feedback action types
    const feedbackAction: 'accept' | 'reject' | 'edit' | 'undo' =
      action === 'accept_change' ? 'accept' : action === 'dismiss' ? 'reject' : action;
    try {
      await insertExtractionFeedback(db, {
        id: `ef_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        project_id: draft.project_id,
        draft_id: draftId,
        sp_id: sp_id,
        action: feedbackAction,
        original_text: sp.text,
        inference_type: sp.inference_type,
        zone: sp.zone,
        low_coverage: sp.low_coverage,
        edited_text: edited_text,
      });
    } catch {
      // Feedback recording is non-critical
    }

    return c.json(
      {
        success: true as const,
        data: { semantic_points: sps },
      },
      200
    );
  } catch (err) {
    if (err instanceof ConflictError) {
      return c.json(
        {
          success: false as const,
          error: { code: 'CONFLICT', message: err.message },
        },
        409
      );
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'REVIEW_ACTION_FAILED', message);
  }
});
