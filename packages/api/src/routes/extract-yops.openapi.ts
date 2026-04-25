/**
 * POST /v1/extract-yops
 *
 * New-architecture extraction endpoint. Takes turns, calls the LLM via
 * provider registry, parses the output as YOp[], returns { ops }.
 *
 * Does NOT persist to yops_log. Does NOT do drift detection. Those are
 * client concerns in the new architecture — this endpoint is a pure LLM
 * wrapper.
 *
 * Retry policy: the v2 pipeline (`extractAndApply`) owns retry semantics
 * server-side — if the model emits invalid structure or unverifiable
 * quotes, the pipeline raises an `ExtractionFailure` and the client
 * decides whether to call again with the same turns. There is no
 * surgical-retry payload on this endpoint; an earlier `failing_ops`
 * field was advertised in the schema but never wired to the handler,
 * so it has been removed to keep the contract honest.
 */

/** biome-ignore-all lint/suspicious/noExplicitAny: extract-yops route queries provider registry through a dynamic runtime surface pending shared provider interfaces */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { extractAndApply } from '@t3x-dev/core';
import { findConversationById, listYOpsLogByConversation } from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorJson, errorResponse, zodErrorHook } from '../lib/errors';
import { getUserId } from '../lib/project-access';
import { resolveProviderAndModel } from '../lib/provider-resolver';
import { replayYOpsLog, toYOpsLogEntries } from '../lib/yops-log-utils';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

export const extractYopsRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ── Request schema ──

const TurnInput = z.object({
  turn_hash: z.string().min(1),
  role: z.enum(['user', 'assistant', 'system', 'tool']).optional(),
  content: z.string(),
});

const ExtractYopsRequest = z.object({
  conversation_id: z.string().min(1),
  turns: z.array(TurnInput),
  provider: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
});

// Response schema — ops is opaque YOp[]; OpenAPI uses z.any() for the payload.
const ExtractYopsResponse = z.object({
  ops: z.array(z.any()),
});

function mapExtractionFailureToApiError(failure: {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}): {
  code: 'EXTRACTION_FAILED' | 'RATE_LIMITED' | 'AUTH_ERROR';
  status?: 400 | 401 | 429;
  details: Record<string, unknown>;
} {
  const statusCode =
    typeof failure.details?.statusCode === 'number' ? failure.details.statusCode : undefined;

  if (failure.code === 'transport' && statusCode === 429) {
    return {
      code: 'RATE_LIMITED',
      status: 429,
      details: { failure_code: failure.code, ...failure.details },
    };
  }

  if (failure.code === 'transport' && (statusCode === 401 || statusCode === 403)) {
    return {
      code: 'AUTH_ERROR',
      status: 401,
      details: { failure_code: failure.code, ...failure.details },
    };
  }

  return {
    code: 'EXTRACTION_FAILED',
    status: 400,
    details: { failure_code: failure.code, ...failure.details },
  };
}

// ── Route ──

const route = createRoute({
  method: 'post',
  path: '/v1/extract-yops',
  tags: ['Extraction'],
  summary: 'Produce YOps from turns via LLM (client-driven retry loop)',
  description:
    'Calls the LLM with the provided turns and returns parsed YOp[]. Does not persist to the yops_log — the caller is responsible for saving and validating. Retry semantics are owned by the v2 pipeline server-side; clients re-send the same turns to retry.',
  request: {
    body: {
      content: { 'application/json': { schema: ExtractYopsRequest } },
    },
  },
  responses: {
    200: {
      description: 'YOps successfully produced',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(ExtractYopsResponse),
        },
      },
    },
    404: {
      description: 'Conversation not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// ── Handler ──

extractYopsRoutes.openapi(route, async (c) => {
  const {
    conversation_id,
    turns,
    provider: requestedProvider,
    model: requestedModel,
  } = c.req.valid('json');

  try {
    const db = await getDB();

    // Verify conversation exists
    const conversation = await findConversationById(db, conversation_id);
    if (!conversation) {
      return errorResponse(
        c,
        'CONVERSATION_NOT_FOUND',
        `Conversation not found: ${conversation_id}`
      );
    }

    // Short-circuit: empty turns → no LLM call needed
    if (turns.length === 0) {
      return c.json({ success: true as const, data: { ops: [] } }, 200);
    }

    // Load existing yops log and replay to get the current snapshot.
    const yopsRecords = await listYOpsLogByConversation(db, conversation_id);
    const replayedSnapshot = replayYOpsLog(toYOpsLogEntries(yopsRecords));
    const mode = replayedSnapshot.trees.length > 0 ? 'incremental' : 'bootstrap';

    // Call the LLM via the unified provider/model selection chain.
    try {
      const resolution = await resolveProviderAndModel({
        db,
        requestedProvider,
        requestedModel,
        conversationId: conversation_id,
        userId: getUserId(c),
        unavailableMessage: 'No configured extraction provider is available',
      });
      if (!resolution.ok) {
        return errorResponse(c, 'EXTRACTION_FAILED', resolution.message);
      }

      const pipelineResult = await extractAndApply({
        turns: turns.map((turn) => ({
          turn_hash: turn.turn_hash,
          role: turn.role ?? 'user',
          content: turn.content,
        })),
        mode,
        providerId: resolution.providerId,
        provider: resolution.provider,
        model: resolution.model,
        snapshot: replayedSnapshot.trees.length > 0 ? replayedSnapshot : undefined,
      });

      if (!pipelineResult.ok) {
        const apiFailure = mapExtractionFailureToApiError(pipelineResult.failure);
        return errorJson(
          c,
          apiFailure.code,
          pipelineResult.failure.message,
          apiFailure.status,
          apiFailure.details
        );
      }

      return c.json({ success: true as const, data: { ops: pipelineResult.compiled.ops } }, 200);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'LLM provider error';
      return errorResponse(c, 'EXTRACTION_FAILED', message);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'EXTRACTION_FAILED', message);
  }
});

export default extractYopsRoutes;
