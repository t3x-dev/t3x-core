/**
 * Drafts Special Routes
 *
 * Special / less-common operations for Draft management.
 * - POST /v1/drafts/auto            - Create auto-draft from conversation
 * - POST /v1/drafts/:id/promote     - Promote auto-draft to editing
 * - POST /v1/drafts/:id/review-action - Perform review action on semantic point
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { SemanticPoint } from '@t3x-dev/core';
import {
  ConflictError,
  findConversationById,
  findDraftV3ById,
  insertAutoDraftV3,
  insertExtractionFeedback,
  promoteDraftV3,
  updateDraftV3,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { getUserId, recordUsageFireAndForget } from '../lib/usage-tracking';
import { ErrorResponseSchema, IdParamSchema, SuccessResponseSchema } from '../schemas/common';
import { DraftResponse, ReviewActionRequest, ReviewActionResponse } from '../schemas/v4-contracts';
import { toApiDraft } from './drafts-crud.openapi';
import { extractSentencesFromConversation } from './extract.openapi';

export const draftsSpecialRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================
// Route Definitions
// ============================================================

// POST /v1/drafts/auto
const createAutoDraftRoute = createRoute({
  method: 'post',
  path: '/v1/drafts/auto',
  tags: ['Drafts'],
  summary: 'Create auto-draft from conversation (Upgrade #7)',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            project_id: z.string().min(1),
            conversation_id: z.string().min(1),
            parent_commit_hash: z.string().optional(),
            target_branch: z.string().optional(),
            options: z
              .object({
                max_sentences: z.number().int().min(1).max(100).optional(),
              })
              .optional(),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Auto-draft created',
      content: { 'application/json': { schema: SuccessResponseSchema(DraftResponse) } },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    503: {
      description: 'LLM provider not configured',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

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

// POST /v1/drafts/auto
draftsSpecialRoutes.openapi(createAutoDraftRoute, async (c) => {
  const body = c.req.valid('json');

  try {
    const db = await getDB();

    // 0. Validate that conversation_id belongs to the given project_id
    const conversation = await findConversationById(db, body.conversation_id);
    if (!conversation) {
      return errorResponse(
        c,
        'CONVERSATION_NOT_FOUND',
        `Conversation not found: ${body.conversation_id}`
      );
    }
    if (conversation.projectId !== body.project_id) {
      return errorResponse(
        c,
        'INVALID_REQUEST',
        `Conversation ${body.conversation_id} does not belong to project ${body.project_id}`
      );
    }

    // 1. Extract sentences from conversation
    const result = await extractSentencesFromConversation(body.conversation_id, body.options);

    // Record usage (fire-and-forget)
    if (result.usage) {
      recordUsageFireAndForget(db, {
        user_id: getUserId(c) ?? undefined,
        project_id: body.project_id,
        endpoint: 'draft_auto_extract',
        model: result.model,
        input_tokens: result.usage.inputTokens,
        output_tokens: result.usage.outputTokens,
      });
    }

    if (result.sentences.length === 0) {
      return errorResponse(c, 'INVALID_REQUEST', 'No sentences extracted from conversation');
    }

    // 2. Create auto-draft
    const draft = await insertAutoDraftV3(db, {
      project_id: body.project_id,
      conversation_id: body.conversation_id,
      title: `Auto-draft from ${body.conversation_id.slice(0, 16)}`,
      sentences: result.sentences,
      parent_commit_hash: body.parent_commit_hash,
      target_branch: body.target_branch,
    });

    return c.json({ success: true as const, data: toApiDraft(draft) }, 201);
  } catch (err) {
    if (err instanceof Error && err.name === 'AllProvidersFailedError') {
      return c.json(
        {
          success: false as const,
          error: {
            code: 'LLM_NOT_CONFIGURED',
            message:
              'No LLM provider is configured. Set ANTHROPIC_API_KEY or another provider key.',
          },
        },
        503
      );
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'CREATE_FAILED', message);
  }
});

// POST /v1/drafts/:id/promote
draftsSpecialRoutes.openapi(promoteDraftRoute, async (c) => {
  const { id } = c.req.valid('param');

  try {
    const db = await getDB();
    const promoted = await promoteDraftV3(db, id);

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
    const draft = await findDraftV3ById(db, draftId);
    if (!draft) return errorResponse(c, 'NOT_FOUND', 'Draft not found');

    const sps = [...((draft.semantic_points ?? []) as SemanticPoint[])];
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

    await updateDraftV3(db, draftId, { semantic_points: sps }, draft.revision);

    // Record sentence modification audit trail — fire-and-forget
    try {
      const { insertSentenceModification } = await import('@t3x-dev/storage');
      await insertSentenceModification(db, {
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
        confidence: sp.confidence,
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
