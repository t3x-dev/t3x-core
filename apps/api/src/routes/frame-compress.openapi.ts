/**
 * Frame Compression Routes
 *
 * LLM-based frame compression to merge redundant frames and remove low-value content.
 * Integrates FrameCompressor (Track A) with the delta log (Track C).
 *
 * Endpoints:
 * - POST /v1/conversations/{conversationId}/compress - Compress frames in a conversation
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  buildDraft,
  type FrameWithSignals,
  FrameCompressor,
} from '@t3x-dev/core';
import {
  findConversationById,
  insertDeltaLogEntry,
  listDeltaLogByConversation,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { toDeltaLogEntries } from '../lib/delta-log-utils';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { syncDeltaToFrames } from '../lib/frame-state-sync';
import { assertProjectAccess } from '../lib/project-access';
import { getProviderRegistry } from '../lib/provider-registry';
import { getUserId, recordUsageFireAndForget, wrapWithUsageTracking } from '../lib/usage-tracking';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

export const frameCompressRoutes = new OpenAPIHono({
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

const FrameCompressResponse = SuccessResponseSchema(
  z.object({
    delta: z.object({
      changes: z.array(z.any()),
      remove_relations: z.array(z.any()).optional(),
    }),
    metadata: CompressMetadataSchema,
    delta_log_id: z.string(),
  })
);

// ============================================================
// Route Definition
// ============================================================

const compressFramesRoute = createRoute({
  method: 'post',
  path: '/v1/conversations/{conversationId}/compress',
  tags: ['Extract'],
  summary: 'Compress semantic frames in a conversation using LLM',
  description:
    'Runs FrameCompressor on conversation frames, merges redundant frames, removes low-value content, and appends the compress delta to the delta log.',
  request: {
    params: z.object({
      conversationId: z.string().min(1),
    }),
  },
  responses: {
    200: {
      description: 'Frames compressed successfully',
      content: { 'application/json': { schema: FrameCompressResponse } },
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
 * Scan delta log to compute engagement signals for each frame.
 * - has_manual_edit: true if any 'manual' delta touched this frame
 * - last_touched: number of delta entries since last mention (0 = last delta)
 * - mention_count: how many deltas referenced this frame
 */
function computeFrameSignals(
  frameIds: string[],
  deltaEntries: Array<{ source: string; delta: { changes: Array<{ action: string; target?: string; frame?: { id: string } }> } }>
): Map<string, { has_manual_edit: boolean; last_touched: number; mention_count: number }> {
  const signals = new Map<string, { has_manual_edit: boolean; last_touched: number; mention_count: number }>();

  // Initialize all frames
  for (const fid of frameIds) {
    signals.set(fid, { has_manual_edit: false, last_touched: deltaEntries.length, mention_count: 0 });
  }

  // Scan delta log from oldest to newest
  for (let i = 0; i < deltaEntries.length; i++) {
    const entry = deltaEntries[i];
    const isManual = entry.source === 'manual';
    const framesMentioned = new Set<string>();

    for (const change of entry.delta.changes) {
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
      sig.last_touched = deltaEntries.length - i - 1; // Distance from end
      sig.mention_count += 1;
    }
  }

  return signals;
}

// ============================================================
// Route Handler
// ============================================================

frameCompressRoutes.openapi(compressFramesRoute, async (c) => {
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

    // 2. Fetch existing delta log and build current snapshot
    const deltaRecords = await listDeltaLogByConversation(db, conversationId);
    const deltaEntries = toDeltaLogEntries(deltaRecords);
    const currentSnapshot = buildDraft(deltaEntries);

    // 3. Require at least 2 frames to compress
    if (currentSnapshot.frames.length < 2) {
      return errorResponse(
        c,
        'INVALID_REQUEST',
        `Not enough frames to compress (need >= 2, have ${currentSnapshot.frames.length})`
      );
    }

    // 4. Compute engagement signals for all frames
    const frameIds = currentSnapshot.frames.map((f) => f.id);
    const signalsMap = computeFrameSignals(frameIds, deltaEntries);

    // 5. Attach signals to frames
    const framesWithSignals: FrameWithSignals[] = currentSnapshot.frames.map((f) => {
      const sig = signalsMap.get(f.id) ?? { has_manual_edit: false, last_touched: 0, mention_count: 1 };
      return {
        ...f,
        has_manual_edit: sig.has_manual_edit,
        last_touched: sig.last_touched,
        mention_count: sig.mention_count,
      };
    });

    // 6. Call FrameCompressor via provider registry with fallback (usage tracked)
    const reg = await getProviderRegistry();
    const trackedUsage = { inputTokens: 0, outputTokens: 0 };
    let trackedModel = 'unknown';
    const result = await reg.tryWithFallback('generation', (provider) => {
      // biome-ignore lint/suspicious/noExplicitAny: generic error handler
      const { provider: tracked, usage } = wrapWithUsageTracking(provider as any);
      trackedUsage.inputTokens = 0;
      trackedUsage.outputTokens = 0;
      trackedModel = tracked.id;
      const compressor = new FrameCompressor(tracked);
      return compressor
        .compress({
          frames: framesWithSignals,
          relations: currentSnapshot.relations,
        })
        .then((r) => {
          trackedUsage.inputTokens = usage.inputTokens;
          trackedUsage.outputTokens = usage.outputTokens;
          return r;
        });
    });

    // 7. Check compression result
    if (!result.ok) {
      return errorResponse(c, 'EXTRACTION_FAILED', result.error || 'Compression failed');
    }

    // 8. Skip if nothing was compressed (empty changes)
    if (result.delta.changes.length === 0) {
      return errorResponse(
        c,
        'INVALID_REQUEST',
        'No frames were compressed (delta is empty). All frames may be protected or already optimal.'
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

    // 9. Write delta_log + sync frames atomically
    const record = await (db as any).transaction(async (tx: any) => {
      const rec = await insertDeltaLogEntry(tx, {
        conversationId,
        projectId: conversation.projectId,
        source: 'compress',
        delta: result.delta,
        pipelineState: 'completed',
        metadata: result.metadata,
      });
      await syncDeltaToFrames(tx, conversationId, conversation.projectId, result.delta, 'compress');
      return rec;
    });

    // 10. Return delta + metadata + delta_log_id
    return c.json(
      {
        success: true as const,
        data: {
          delta: result.delta,
          metadata: result.metadata,
          delta_log_id: record.id,
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

export default frameCompressRoutes;
