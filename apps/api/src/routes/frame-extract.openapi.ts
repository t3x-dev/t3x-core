/**
 * Frame Extraction Routes
 *
 * LLM-based frame semantic extraction from conversation turns.
 * Integrates FrameExtractor (Track A) with the delta log (Track C).
 *
 * Endpoints:
 * - POST /v1/extract/frames - Extract semantic frames from a conversation
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { buildDraft, type FrameExtractionTurn, FrameExtractor, fuzzyLocate } from '@t3x-dev/core';
import {
  findConversationById,
  findTurnsByConversation,
  insertDeltaLogEntry,
  listDeltaLogByConversation,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { toDeltaLogEntries } from '../lib/delta-log-utils';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { getProviderRegistry } from '../lib/provider-registry';
import { getUserId, recordUsageFireAndForget, wrapWithUsageTracking } from '../lib/usage-tracking';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

export const frameExtractRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================
// Schemas
// ============================================================

const FrameExtractRequest = z.object({
  conversation_id: z.string().min(1),
  turn_hashes: z.array(z.string().min(1)).optional(),
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

const FrameExtractResponse = SuccessResponseSchema(
  z.object({
    delta: DeltaResponseSchema,
    snapshot: SnapshotResponseSchema,
    delta_log_id: z.string(),
  })
);

// ============================================================
// Route Definition
// ============================================================

const extractFramesRoute = createRoute({
  method: 'post',
  path: '/v1/extract/frames',
  tags: ['Extract'],
  summary: 'Extract semantic frames from a conversation using LLM',
  description:
    'Runs FrameExtractor on conversation turns, appends the resulting delta to the delta log, and returns the delta with the updated snapshot.',
  request: {
    body: {
      content: { 'application/json': { schema: FrameExtractRequest } },
    },
  },
  responses: {
    200: {
      description: 'Frames extracted successfully',
      content: { 'application/json': { schema: FrameExtractResponse } },
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

frameExtractRoutes.openapi(extractFramesRoute, async (c) => {
  const { conversation_id, turn_hashes } = c.req.valid('json');

  try {
    const db = await getDB();

    // 1. Validate conversation exists and get project_id
    const conversation = await findConversationById(db, conversation_id);
    if (!conversation) {
      return errorResponse(
        c,
        'CONVERSATION_NOT_FOUND',
        `Conversation not found: ${conversation_id}`
      );
    }

    // 2. Fetch conversation turns
    const allTurns = await findTurnsByConversation(db, {
      conversationId: conversation_id,
      limit: 500,
    });

    if (allTurns.length === 0) {
      return errorResponse(c, 'CONVERSATION_NOT_FOUND', 'No turns found for this conversation');
    }

    // Filter to specific turn hashes if provided
    const selectedTurns = turn_hashes
      ? allTurns.filter((t) => turn_hashes.includes(t.turnHash))
      : allTurns;

    if (selectedTurns.length === 0) {
      return errorResponse(c, 'INVALID_REQUEST', 'None of the specified turn_hashes were found');
    }

    // 3. Fetch existing delta log and build current snapshot
    const deltaRecords = await listDeltaLogByConversation(db, conversation_id);
    const currentSnapshot = buildDraft(toDeltaLogEntries(deltaRecords));

    // 4. Convert turns to FrameExtractionTurn format (include turn_hash for source tracking)
    const extractionTurns: FrameExtractionTurn[] = selectedTurns.map((t) => ({
      role: t.role as FrameExtractionTurn['role'],
      content: t.content,
      turn_hash: t.turnHash,
    }));

    // 5. Call FrameExtractor via provider registry with fallback (usage tracked)
    const reg = await getProviderRegistry();
    const trackedUsage = { inputTokens: 0, outputTokens: 0 };
    let trackedModel = 'unknown';
    const result = await reg.tryWithFallback('generation', (provider) => {
      const { provider: tracked, usage } = wrapWithUsageTracking(provider);
      trackedUsage.inputTokens = 0;
      trackedUsage.outputTokens = 0;
      trackedModel = tracked.id;
      const extractor = new FrameExtractor(tracked);
      return extractor.extract({
        turns: extractionTurns,
        snapshot: currentSnapshot.frames.length > 0 ? currentSnapshot : undefined,
      }).then((r) => {
        trackedUsage.inputTokens = usage.inputTokens;
        trackedUsage.outputTokens = usage.outputTokens;
        return r;
      });
    });

    // 6. Check extraction result
    if (!result.ok) {
      return errorResponse(c, 'EXTRACTION_FAILED', result.error);
    }

    // Record usage (fire-and-forget)
    if (trackedUsage.inputTokens || trackedUsage.outputTokens) {
      recordUsageFireAndForget(db, {
        user_id: getUserId(c) ?? undefined,
        project_id: conversation.projectId,
        endpoint: 'extract_frames',
        model: trackedModel,
        input_tokens: trackedUsage.inputTokens,
        output_tokens: trackedUsage.outputTokens,
      });
    }

    // 6b. Resolve slot quotes into character offsets using fuzzyLocate
    // Build a map of turn tag → turn content for quote matching
    const turnContentMap = new Map<string, { content: string; turnHash: string }>();
    selectedTurns.forEach((t, i) => {
      const tag = `T${i + 1}`;
      turnContentMap.set(tag, { content: t.content, turnHash: t.turnHash });
      // Also map by hash prefix for "T3:abc12345" format
      if (t.turnHash) {
        turnContentMap.set(`T${i + 1}:${t.turnHash.slice(0, 8)}`, { content: t.content, turnHash: t.turnHash });
      }
    });

    for (const change of result.delta.changes) {
      if (change.action === 'add' && change.frame) {
        const frame = change.frame;
        const slotQuotes = (frame as Record<string, unknown>).slot_quotes as Record<string, string> | undefined;
        if (slotQuotes && frame.source) {
          const turnInfo = turnContentMap.get(frame.source);
          if (turnInfo) {
            const slotSources: Record<string, { turn: string; turn_hash?: string; start_char: number; end_char: number; quote?: string }> = {};
            for (const [slotKey, quote] of Object.entries(slotQuotes)) {
              if (typeof quote !== 'string') continue;
              const located = fuzzyLocate(turnInfo.content, quote);
              if (located) {
                slotSources[slotKey] = {
                  turn: frame.source,
                  turn_hash: turnInfo.turnHash,
                  start_char: located.start,
                  end_char: located.end,
                  quote,
                };
              }
            }
            if (Object.keys(slotSources).length > 0) {
              frame.slot_sources = slotSources;
            }
          }
        }
        // Clean up slot_quotes from the frame (internal LLM output, not persisted)
        delete (frame as Record<string, unknown>).slot_quotes;
      }
      // Handle update changes with slot_quotes too
      if (change.action === 'update') {
        const slotQuotes = (change as Record<string, unknown>).slot_quotes as Record<string, string> | undefined;
        if (slotQuotes) {
          // Find the frame's source from snapshot
          const existingFrame = currentSnapshot.frames.find((f) => f.id === change.target);
          const source = existingFrame?.source;
          if (source) {
            const turnInfo = turnContentMap.get(source);
            if (turnInfo) {
              const slotSources: Record<string, { turn: string; turn_hash?: string; start_char: number; end_char: number; quote?: string }> = {};
              for (const [slotKey, quote] of Object.entries(slotQuotes)) {
                if (typeof quote !== 'string') continue;
                // Try matching in all turns (update may reference a different turn)
                for (const [tag, info] of turnContentMap) {
                  const located = fuzzyLocate(info.content, quote);
                  if (located) {
                    slotSources[slotKey] = {
                      turn: tag,
                      turn_hash: info.turnHash,
                      start_char: located.start,
                      end_char: located.end,
                      quote,
                    };
                    break;
                  }
                }
              }
              // Attach slot_sources to the change for the frontend
              if (Object.keys(slotSources).length > 0) {
                (change as Record<string, unknown>).slot_sources = slotSources;
              }
            }
          }
          delete (change as Record<string, unknown>).slot_quotes;
        }
      }
    }

    // 7. Insert delta into delta log
    const record = await insertDeltaLogEntry(db, {
      conversationId: conversation_id,
      projectId: conversation.projectId,
      source: 'llm_extraction',
      delta: result.delta,
    });

    // 8. Return delta + updated snapshot + delta_log_id
    return c.json(
      {
        success: true as const,
        data: {
          delta: result.delta,
          snapshot: result.snapshot,
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

export default frameExtractRoutes;
