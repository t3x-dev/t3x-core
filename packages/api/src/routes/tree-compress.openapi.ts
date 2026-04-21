/**
 * Tree Compression Routes
 *
 * LLM-based tree compression to merge redundant frames and remove low-value content.
 * Integrates Compressor (Track A) with the delta log (Track C).
 *
 * Endpoints:
 * - POST /v1/conversations/{conversationId}/compress - Compress trees in a conversation
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { insertYOpsLogEntry } from '@t3x-dev/storage';
import { runApiCompressionV2 } from '../lib/compression-v2';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { assertProjectAccess } from '../lib/project-access';
import { rebuildTreesFromSnapshot } from '../lib/tree-state-sync';
import { getUserId, recordUsageFireAndForget } from '../lib/usage-tracking';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

export const treeCompressRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================
// Schemas
// ============================================================

const CompressMetadataSchema = z.object({
  compress_summary: z.string(),
  nodes_before: z.number(),
  nodes_after: z.number(),
  merged_count: z.number(),
  removed_count: z.number(),
  removed_node_ids: z.array(z.string()),
});

const TreeCompressResponse = SuccessResponseSchema(
  z.object({
    delta: z.array(z.any()),
    snapshot: z.any(),
    metadata: CompressMetadataSchema,
    yops_log_id: z.string(),
  })
);

// ============================================================
// Route Definition
// ============================================================

const compressTreesRoute = createRoute({
  method: 'post',
  path: '/v1/conversations/{conversationId}/compress',
  tags: ['Extract'],
  summary: 'Compress semantic trees in a conversation using LLM',
  description:
    'Runs the v2 compression pipeline on conversation nodes, merges redundant frames, removes low-value content, and appends the compress YOps to the yops-log.',
  request: {
    params: z.object({
      conversationId: z.string().min(1),
    }),
  },
  responses: {
    200: {
      description: 'Trees compressed successfully',
      content: { 'application/json': { schema: TreeCompressResponse } },
    },
    400: {
      description: 'Invalid request or not enough frames to compress',
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
      description: 'Compression or server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

treeCompressRoutes.openapi(compressTreesRoute, async (c) => {
  const { conversationId } = c.req.valid('param');

  try {
    const db = await getDB();

    const result = await runApiCompressionV2({ db, conversationId });

    if (!result.ok) {
      if (result.kind === 'conversation_not_found') {
        return errorResponse(c, 'CONVERSATION_NOT_FOUND', result.message);
      }
      if (result.projectId) {
        const accessResult = await assertProjectAccess(c, db, result.projectId);
        if (accessResult instanceof Response) return accessResult;
      }
      if (result.kind === 'insufficient_nodes' || result.kind === 'empty_result') {
        return errorResponse(c, 'INVALID_REQUEST', result.message);
      }
      if (result.kind === 'provider_unavailable') {
        return c.json(
          {
            success: false as const,
            error: {
              code: 'LLM_NOT_CONFIGURED',
              message: result.message,
            },
          },
          503
        );
      }
      return errorResponse(c, 'EXTRACTION_FAILED', result.message);
    }

    const accessResult = await assertProjectAccess(c, db, result.projectId);
    if (accessResult instanceof Response) return accessResult;

    if (result.usage.inputTokens || result.usage.outputTokens) {
      recordUsageFireAndForget(db, {
        user_id: getUserId(c) ?? undefined,
        project_id: result.projectId,
        endpoint: 'compress_frames',
        model: result.model,
        input_tokens: result.usage.inputTokens,
        output_tokens: result.usage.outputTokens,
      });
    }

    // biome-ignore lint/suspicious/noExplicitAny: Drizzle transaction typing
    const record = await (db as any).transaction(async (tx: any) => {
      const rec = await insertYOpsLogEntry(tx, {
        conversationId,
        projectId: result.projectId,
        source: 'compress',
        yops: result.ops,
        pipelineState: 'completed',
        metadata: result.metadata,
      });
      await rebuildTreesFromSnapshot(tx, conversationId, result.projectId, result.snapshot);
      return rec;
    });

    return c.json(
      {
        success: true as const,
        data: {
          delta: result.ops,
          snapshot: result.snapshot,
          metadata: result.metadata,
          yops_log_id: record.id,
        },
      },
      200
    );
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
    return errorResponse(c, 'EXTRACTION_FAILED', message);
  }
});

export default treeCompressRoutes;
