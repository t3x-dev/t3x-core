/**
 * Frame Answer Routes (Step 8)
 *
 * Processes user answers to advisory questions and drift choices.
 * Generates and applies delta corrections to the YAML tree.
 *
 * Endpoint:
 * - POST /v1/extract/frames/answer
 *
 * @see https://github.com/t3x-dev/t3x-core/issues/622
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  applyAnswer,
  buildDraft,
  type UserAnswer,
} from '@t3x-dev/core';
import {
  findConversationById,
  insertDeltaLogEntry,
  listDeltaLogByConversation,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { toDeltaLogEntries } from '../lib/delta-log-utils';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { assertProjectAccess } from '../lib/project-access';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

export const frameAnswerRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================
// Schemas
// ============================================================

const AnswerSchema = z.object({
  question_id: z.string().min(1),
  drift_choice: z.enum(['keep_old', 'keep_new', 'keep_both_separate', 'keep_both_together']).optional(),
  answer_text: z.string().optional(),
  selected_value: z.any().optional(),
});

const FrameAnswerRequest = z.object({
  conversation_id: z.string().min(1),
  answers: z.array(AnswerSchema).min(1),
  /** Question metadata — needed to route advisory answers to correct handler */
  question_context: z.object({
    type: z.enum(['vagueness', 'structural']).optional(),
    frame_id: z.string().optional(),
    slot_key: z.string().optional(),
  }).optional(),
});

const FrameAnswerResponse = SuccessResponseSchema(
  z.object({
    delta: z.any().optional(),
    snapshot: z.any().optional(),
    delta_log_id: z.string().optional(),
    new_project_id: z.string().optional(),
    applied: z.boolean(),
    errors: z.array(z.string()).optional(),
  })
);

// ============================================================
// Route Definition
// ============================================================

const answerRoute = createRoute({
  method: 'post',
  path: '/v1/extract/frames/answer',
  tags: ['Extract'],
  summary: 'Apply user answers to advisory questions or drift choices',
  description:
    'Processes user answers from drift detection or ambiguity detection, generates correction deltas, and applies them to the YAML tree.',
  request: {
    body: {
      content: { 'application/json': { schema: FrameAnswerRequest } },
    },
  },
  responses: {
    200: {
      description: 'Answer applied successfully',
      content: { 'application/json': { schema: FrameAnswerResponse } },
    },
    400: {
      description: 'Invalid request or answer',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Conversation not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    422: {
      description: 'Answer delta failed validation',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// ============================================================
// Route Handler
// ============================================================

frameAnswerRoutes.openapi(answerRoute, async (c) => {
  const { conversation_id, answers, question_context } = c.req.valid('json');

  try {
    const db = await getDB();

    // 1. Validate conversation
    const conversation = await findConversationById(db, conversation_id);
    if (!conversation) {
      return errorResponse(c, 'CONVERSATION_NOT_FOUND', `Conversation not found: ${conversation_id}`);
    }

    const accessResult = await assertProjectAccess(c, db, conversation.projectId);
    if (accessResult instanceof Response) return accessResult;

    // 2. Build current snapshot from delta log
    const deltaRecords = await listDeltaLogByConversation(db, conversation_id);
    const currentSnapshot = buildDraft(toDeltaLogEntries(deltaRecords));

    // 3. Process the first answer (single answer per request for now)
    const answer: UserAnswer = answers[0];

    const result = applyAnswer(
      currentSnapshot,
      answer,
      question_context?.type,
      question_context?.frame_id,
      question_context?.slot_key
    );

    if (!result.applied) {
      // Check if this is an API-orchestration case (drift choice 3/4)
      const needsOrchestration = result.errors?.some((e) => e.includes('API-layer orchestration'));
      if (needsOrchestration) {
        // TODO: implement drift choice 3 (new project) and choice 4 (same project + extract)
        // For now, return the intent for the frontend to handle
        return errorResponse(c, 'NOT_IMPLEMENTED', `Drift choice '${answer.drift_choice}' is not yet implemented in the API layer`);
      }

      return c.json({
        success: true as const,
        data: {
          applied: false,
          errors: result.errors,
        },
      }, 200);
    }

    // 4. Persist the delta
    let deltaLogId: string | undefined;
    if (result.delta && result.delta.changes.length > 0) {
      const record = await insertDeltaLogEntry(db, {
        conversationId: conversation_id,
        projectId: conversation.projectId,
        source: answer.drift_choice ? 'collapse' : 'answer',
        delta: result.delta,
        pipelineState: 'completed',
      });
      deltaLogId = record.id;
    }

    // 5. Return result
    return c.json({
      success: true as const,
      data: {
        applied: true,
        delta: result.delta,
        snapshot: result.snapshot,
        delta_log_id: deltaLogId,
      },
    }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'ANSWER_FAILED', message);
  }
});

export default frameAnswerRoutes;
