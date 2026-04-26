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
import { extractAndApply, PRESETS, type PresetName } from '@t3x-dev/core';
import { findConversationById } from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorJson, errorResponse, zodErrorHook } from '../lib/errors';
import { getUserId } from '../lib/project-access';
import { resolveProviderAndModel } from '../lib/provider-resolver';
import { replayCommittedBaseline } from '../lib/yops-log-utils';
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
  /**
   * Extraction style preset. Drives a granularity-aware system prompt
   * (concise: hard 6-item budget + single-tree shape; detailed: capture
   * nuance under existing paths). Omitted = no style guidance, which
   * keeps the historical "balanced-ish, no budget" prompt.
   *
   * Only the preset names are accepted on the wire; custom configs go
   * through `extractAndApply` directly. Mapping uses `PRESETS[name]`
   * from `@t3x-dev/core`.
   */
  preset: z.enum(['concise', 'balanced', 'detailed']).optional(),
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
    preset,
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

    // Snapshot is the **committed baseline** only — the immutable
    // semantic content this conversation has under any prior commit.
    // Active draft entries (uncommitted yops_log rows) deliberately
    // never enter the prompt: re-extract is a *full recompute* of the
    // suggestion, not an "add more on top of the previous draft" step.
    const baselineSnapshot = await replayCommittedBaseline(db, conversation_id);
    const mode = baselineSnapshot.trees.length > 0 ? 'incremental' : 'bootstrap';

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

      // Map the wire-level preset name to the full ExtractionStyleConfig
      // the core pipeline expects. Omitted preset → undefined → core
      // emits the historical no-style prompt.
      const style = preset ? PRESETS[preset as PresetName] : undefined;

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
        snapshot: baselineSnapshot.trees.length > 0 ? baselineSnapshot : undefined,
        style,
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
