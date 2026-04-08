/**
 * Tree Extraction Routes
 *
 * LLM-based semantic extraction from conversation turns.
 * Integrates Extractor (Track A) with the delta log (Track C).
 *
 * Endpoints:
 * - POST /v1/extract/trees        - Extract semantic trees (JSON response)
 * - POST /v1/extract/trees/stream - Extract semantic trees (SSE stream)
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { findConversationById } from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { type ErrorCode, errorResponse, zodErrorHook } from '../lib/errors';
import { runExtractionPipeline } from '../lib/extraction-pipeline';
import { assertProjectAccess } from '../lib/project-access';
import { getUserId } from '../lib/usage-tracking';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

export const treeExtractRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================
// Schemas
// ============================================================

const DriftDecisionSchema = z.object({
  choice: z.enum(['keep_old', 'keep_new', 'keep_both_separate', 'keep_both_together']),
  relation: z.string().optional(),
  new_topic: z.string().optional(),
});

const TreeExtractRequest = z.object({
  conversation_id: z.string().min(1),
  turn_hashes: z.array(z.string().min(1)).optional(),
  drift_decision: DriftDecisionSchema.optional(),
  topic_id: z.string().optional(),
  force_extract: z.boolean().optional(),
  source_pin_ids: z.array(z.string().min(1)).optional(),
});

const DeltaResponseSchema = z.object({
  changes: z.array(z.any()),
  new_relations: z.array(z.any()).optional(),
  remove_relations: z.array(z.any()).optional(),
});

const SnapshotResponseSchema = z.object({
  frames: z.array(z.any()),
  relations: z.array(z.any()),
});

const TreeExtractResponse = SuccessResponseSchema(
  z.object({
    delta: DeltaResponseSchema.optional(),
    snapshot: SnapshotResponseSchema.optional(),
    yops_log_id: z.string().optional(),
    status: z.enum(['completed', 'drift_detected', 'skipped']),
    drift: z
      .object({
        relation: z.string().optional(),
        new_topic: z.string().optional(),
        old_topic: z.string().optional(),
      })
      .optional(),
    choices: z.array(z.string()).optional(),
    gate_result: z.any().optional(),
    advisory_questions: z.array(z.any()).optional(),
    reason: z.string().optional(),
  })
);

// ============================================================
// Route Definition
// ============================================================

const extractTreesRoute = createRoute({
  method: 'post',
  path: '/v1/extract/trees',
  tags: ['Extract'],
  summary: 'Extract semantic trees from a conversation using LLM',
  description:
    'Runs Extractor on conversation turns, appends the resulting delta to the delta log, and returns the delta with the updated snapshot.',
  request: {
    body: {
      content: { 'application/json': { schema: TreeExtractRequest } },
    },
  },
  responses: {
    200: {
      description: 'Trees extracted successfully',
      content: { 'application/json': { schema: TreeExtractResponse } },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Conversation not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    503: {
      description: 'LLM provider not configured',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Extraction or server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// ============================================================
// Route Handler
// ============================================================

treeExtractRoutes.openapi(extractTreesRoute, async (c) => {
  const { conversation_id, turn_hashes, drift_decision, topic_id, force_extract, source_pin_ids } =
    c.req.valid('json');

  const db = await getDB();
  const conversation = await findConversationById(db, conversation_id);
  if (!conversation) {
    return errorResponse(c, 'CONVERSATION_NOT_FOUND', `Conversation not found: ${conversation_id}`);
  }
  const accessResult = await assertProjectAccess(c, db, conversation.projectId);
  if (accessResult instanceof Response) return accessResult;

  // Consume pipeline generator, collect final result
  let finalSnapshot: unknown;
  let yopsLogId: string | undefined;
  let gateResult: unknown;
  let advisoryQuestions: unknown[] | undefined;
  const collectedYops: unknown[] = [];
  let status: string = 'completed';
  let drift: unknown;
  let choices: string[] | undefined;
  let reason: string | undefined;

  try {
    const pipeline = runExtractionPipeline({
      conversationId: conversation_id,
      projectId: conversation.projectId,
      turnHashes: turn_hashes,
      driftDecision: drift_decision,
      topicId: topic_id,
      forceExtract: force_extract,
      userId: getUserId(c) ?? undefined,
      sourcePinIds: source_pin_ids,
    });

    for await (const event of pipeline) {
      switch (event.type) {
        case 'yop':
          collectedYops.push(event.data);
          break;
        case 'done':
          finalSnapshot = event.data.snapshot;
          yopsLogId = event.data.yops_log_id as string;
          break;
        case 'gate':
          gateResult = event.data;
          break;
        case 'advisory':
          advisoryQuestions = (event.data as { questions: unknown[] }).questions;
          break;
        case 'drift':
          status = 'drift_detected';
          drift = event.data;
          choices = (event.data as { choices: string[] }).choices;
          break;
        case 'skipped':
          status = 'skipped';
          reason = (event.data as { reason: string }).reason;
          break;
        case 'error': {
          const errData = event.data as { code?: string; message: string };
          if (errData.code === 'LLM_NOT_CONFIGURED') {
            return c.json(
              {
                success: false as const,
                error: {
                  code: 'LLM_NOT_CONFIGURED',
                  message: errData.message,
                },
              },
              503
            );
          }
          return errorResponse(c, (errData.code ?? 'EXTRACTION_FAILED') as ErrorCode, errData.message);
        }
      }
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AllProvidersFailedError') {
      return c.json(
        {
          success: false as const,
          error: {
            code: 'LLM_NOT_CONFIGURED',
            message: 'No LLM provider is configured. Set ANTHROPIC_API_KEY or another provider key.',
          },
        },
        503
      );
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'EXTRACTION_FAILED', message);
  }

  return c.json({
    success: true as const,
    data: {
      status: status as 'completed' | 'drift_detected' | 'skipped',
      delta: collectedYops,
      snapshot: finalSnapshot,
      yops_log_id: yopsLogId,
      gate_result: gateResult,
      advisory_questions: advisoryQuestions,
      ...(drift && { drift }),
      ...(choices && { choices }),
      ...(reason && { reason }),
    },
  }, 200);
});

// ============================================================
// SSE Helper
// ============================================================

// Named SSE events: `event: type\ndata: ...\n\n`
// Intentionally differs from chat endpoint's flat `data: {type: ...}` format.
// The extraction client parser handles this format specifically.
function encodeSseEvent(event: string, payload: string): Uint8Array {
  return new TextEncoder().encode(`event: ${event}\ndata: ${payload}\n\n`);
}

// ============================================================
// SSE Stream Route Handler
// ============================================================

treeExtractRoutes.post('/v1/extract/trees/stream', async (c) => {
  const body = await c.req.json();
  const { conversation_id, turn_hashes, drift_decision, topic_id, force_extract, source_pin_ids } = body;

  // Validate conversation + project access
  const db = await getDB();
  const conversation = await findConversationById(db, conversation_id);
  if (!conversation) {
    return c.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Conversation not found' } },
      404
    );
  }
  const accessResult = await assertProjectAccess(c, db, conversation.projectId);
  if (accessResult instanceof Response) return accessResult;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const pipeline = runExtractionPipeline({
          conversationId: conversation_id,
          projectId: conversation.projectId,
          turnHashes: turn_hashes,
          driftDecision: drift_decision,
          topicId: topic_id,
          forceExtract: force_extract,
          userId: getUserId(c) ?? undefined,
          sourcePinIds: source_pin_ids,
        });

        for await (const event of pipeline) {
          controller.enqueue(encodeSseEvent(event.type, JSON.stringify(event.data)));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        controller.enqueue(encodeSseEvent('error', JSON.stringify({ message })));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
});

export default treeExtractRoutes;
