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
import { applyDelta, applyYOps, Compressor, flattenTrees, type NodeWithSignals, type SemanticContent } from '@t3x-dev/core';
import {
  findConversationById,
  insertYOpsLogEntry,
  listYOpsLogByConversation,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { toYOpsLogEntries } from '../lib/yops-log-utils';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { rebuildTreesFromSnapshot } from '../lib/tree-state-sync';
import { assertProjectAccess } from '../lib/project-access';
import { getProviderRegistry } from '../lib/provider-registry';
import { getUserId, recordUsageFireAndForget, wrapWithUsageTracking } from '../lib/usage-tracking';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

export const treeCompressRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================
// Schemas
// ============================================================

const CompressMetadataSchema = z.object({
  compress_summary: z.string(),
  frames_before: z.number(),
  frames_after: z.number(),
  merged_count: z.number(),
  removed_count: z.number(),
  removed_frame_ids: z.array(z.string()),
});

const TreeCompressResponse = SuccessResponseSchema(
  z.object({
    delta: z.object({
      changes: z.array(z.any()),
      remove_relations: z.array(z.any()).optional(),
    }),
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
    'Runs Compressor on conversation nodes, merges redundant frames, removes low-value content, and appends the compress delta to the delta log.',
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

// ============================================================
// Helper: Compute Frame Signals
// ============================================================

/**
 * Scan yops log to compute engagement signals for each node.
 * - has_manual_edit: true if any 'manual' yops entry touched this node
 * - last_touched: number of entries since last mention (0 = last entry)
 * - mention_count: how many entries referenced this node
 */
function computeNodeSignals(
  frameIds: string[],
  yopsEntries: Array<{
    source: string;
    yops: unknown;
  }>
): Map<string, { has_manual_edit: boolean; last_touched: number; mention_count: number }> {
  const signals = new Map<
    string,
    { has_manual_edit: boolean; last_touched: number; mention_count: number }
  >();

  // Initialize all frames
  for (const fid of frameIds) {
    signals.set(fid, {
      has_manual_edit: false,
      last_touched: yopsEntries.length,
      mention_count: 0,
    });
  }

  // Scan yops log from oldest to newest
  for (let i = 0; i < yopsEntries.length; i++) {
    const entry = yopsEntries[i];
    const isManual = entry.source === 'manual';
    const framesMentioned = new Set<string>();

    // Extract changes from yops (may be Delta format with .changes or YOp[] array)
    const yopsData = entry.yops as any;
    const changes: Array<{ action: string; target?: string; frame?: { id: string } }> =
      Array.isArray(yopsData) ? [] : (yopsData?.changes ?? []);

    for (const change of changes) {
      let targetId: string | undefined;
      if (change.action === 'add' && change.frame) {
        targetId = change.frame.id;
      } else if ((change.action === 'update' || change.action === 'remove') && change.target) {
        targetId = change.target;
      }

      if (targetId && signals.has(targetId)) {
        framesMentioned.add(targetId);
        if (isManual) {
          signals.get(targetId)!.has_manual_edit = true;
        }
      }
    }

    // Update last_touched and mention_count
    for (const fid of Array.from(framesMentioned)) {
      const sig = signals.get(fid)!;
      sig.last_touched = yopsEntries.length - i - 1; // Distance from end
      sig.mention_count += 1;
    }
  }

  return signals;
}

// ============================================================
// Route Handler
// ============================================================

treeCompressRoutes.openapi(compressTreesRoute, async (c) => {
  const { conversationId } = c.req.valid('param');

  try {
    const db = await getDB();

    // 1. Validate conversation exists and get project_id
    const conversation = await findConversationById(db, conversationId);
    if (!conversation) {
      return errorResponse(
        c,
        'CONVERSATION_NOT_FOUND',
        `Conversation not found: ${conversationId}`
      );
    }

    // 1b. Verify project access
    const accessResult = await assertProjectAccess(c, db, conversation.projectId);
    if (accessResult instanceof Response) return accessResult;

    // 2. Fetch existing yops log and build current snapshot
    const yopsRecords = await listYOpsLogByConversation(db, conversationId);
    const yopsEntries = toYOpsLogEntries(yopsRecords);
    const emptySnapshot: SemanticContent = { trees: [], relations: [] };
    const currentSnapshot = yopsEntries.reduce(
      (snap, entry) => applyDelta(snap, entry.yops as any),
      emptySnapshot
    );
    const currentFlat = flattenTrees(currentSnapshot.trees);

    // 3. Require at least 2 nodes to compress
    if (currentFlat.length < 2) {
      return errorResponse(
        c,
        'INVALID_REQUEST',
        `Not enough nodes to compress (need >= 2, have ${currentFlat.length})`
      );
    }

    // 4. Compute engagement signals for all nodes
    const nodeIds = currentFlat.map((f) => f.id);
    const signalsMap = computeNodeSignals(nodeIds, yopsEntries);

    // 5. Attach signals to nodes
    const nodesWithSignals: NodeWithSignals[] = currentFlat.map((f) => {
      const sig = signalsMap.get(f.id) ?? {
        has_manual_edit: false,
        last_touched: 0,
        mention_count: 1,
      };
      return {
        ...f,
        has_manual_edit: sig.has_manual_edit,
        last_touched: sig.last_touched,
        mention_count: sig.mention_count,
      };
    });

    // 6. Call Compressor via provider registry with fallback (usage tracked)
    const reg = await getProviderRegistry();
    const trackedUsage = { inputTokens: 0, outputTokens: 0 };
    let trackedModel = 'unknown';
    // biome-ignore lint/suspicious/noExplicitAny: compress result type
    const result: any = await reg.tryWithFallback('generation', (provider) => {
      // biome-ignore lint/suspicious/noExplicitAny: generic error handler
      const { provider: tracked, usage } = wrapWithUsageTracking(provider as any);
      trackedUsage.inputTokens = 0;
      trackedUsage.outputTokens = 0;
      trackedModel = tracked.id;
      const compressor = new Compressor(tracked);
      return compressor
        .compress({
          frames: nodesWithSignals,
          relations: currentSnapshot.relations,
        })
        .then((r: any) => {
          trackedUsage.inputTokens = usage.inputTokens;
          trackedUsage.outputTokens = usage.outputTokens;
          return r;
        });
    });

    // 7. Check compression result
    if (!result.ok) {
      return errorResponse(c, 'EXTRACTION_FAILED', result.error || 'Compression failed');
    }

    // 8. Skip if nothing was compressed (empty yops)
    if (result.yops.length === 0) {
      return errorResponse(
        c,
        'INVALID_REQUEST',
        'No frames were compressed (yops is empty). All frames may be protected or already optimal.'
      );
    }

    // Record usage (fire-and-forget)
    if (trackedUsage.inputTokens || trackedUsage.outputTokens) {
      recordUsageFireAndForget(db, {
        user_id: getUserId(c) ?? undefined,
        project_id: conversation.projectId,
        endpoint: 'compress_frames',
        model: trackedModel,
        input_tokens: trackedUsage.inputTokens,
        output_tokens: trackedUsage.outputTokens,
      });
    }

    // 9. Apply YOps to get compressed snapshot, then write yops_log + sync trees atomically
    const compressedResult = applyYOps(currentSnapshot, result.yops);
    const compressedSnapshot: SemanticContent = compressedResult.ok
      ? { trees: compressedResult.trees, relations: compressedResult.relations }
      : currentSnapshot; // fallback: keep current if apply fails

    const record = await (db as any).transaction(async (tx: any) => {
      const rec = await insertYOpsLogEntry(tx, {
        conversationId,
        projectId: conversation.projectId,
        source: 'compress',
        yops: result.yops,
        pipelineState: 'completed',
        metadata: result.metadata,
      });
      await rebuildTreesFromSnapshot(tx, conversationId, conversation.projectId, compressedSnapshot);
      return rec;
    });

    // 10. Return yops + metadata + yops_log_id
    return c.json(
      {
        success: true as const,
        data: {
          delta: result.yops,
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
