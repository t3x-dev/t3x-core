/**
 * Extract Routes
 *
 * LLM-based semantic extraction from conversation turns.
 *
 * Endpoints:
 * - POST /v1/extract/sentences - Extract structured knowledge sentences from a conversation
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  createLLMExtractor,
  type ExtractionCursor,
  generateDraftSentenceId,
  type SemanticPoint,
  type TurnInput,
  validateExtractedSentences,
} from '@t3x-dev/core';
import { findDraftV3ById, findTurnsByConversation, updateDraftV3 } from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { getProviderRegistry } from '../lib/provider-registry';
import { getUserId, recordUsageFireAndForget, wrapWithUsageTracking } from '../lib/usage-tracking';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';
import {
  DraftSentenceSchema,
  IncrementalExtractRequest,
  IncrementalExtractResponse,
} from '../schemas/v4-contracts';

export const extractRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================
// Schemas
// ============================================================

const ExtractSentencesRequest = z.object({
  project_id: z.string().min(1),
  conversation_id: z.string().min(1),
  options: z
    .object({
      max_sentences: z.number().int().min(1).max(100).optional(),
      language: z.string().optional(),
    })
    .optional(),
});

const ExtractStatsSchema = z.object({
  total_turns: z.number(),
  extracted: z.number(),
  with_source_ref: z.number(),
  removed: z.number(),
});

const ExtractSentencesResponse = SuccessResponseSchema(
  z.object({
    sentences: z.array(DraftSentenceSchema),
    model: z.string(),
    stats: ExtractStatsSchema,
  })
);

// ============================================================
// Route Definitions
// ============================================================

const extractSentencesRoute = createRoute({
  method: 'post',
  path: '/v1/extract/sentences',
  tags: ['Extract'],
  summary: 'Extract knowledge sentences from a conversation using LLM',
  request: {
    body: {
      content: { 'application/json': { schema: ExtractSentencesRequest } },
    },
  },
  responses: {
    200: {
      description: 'Sentences extracted',
      content: { 'application/json': { schema: ExtractSentencesResponse } },
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
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// ============================================================
// Shared extraction logic (reused by drafts/:id/extract)
// ============================================================

export interface ExtractionOutput {
  sentences: Array<{
    id: string;
    text: string;
    origin: { type: 'extracted'; segment_id: string; confidence: number };
    source?: {
      conversation_id: string;
      turn_hash: string;
      role: string;
      start_char: number;
      end_char: number;
    };
    position: number;
    included: boolean;
  }>;
  model: string;
  stats: {
    total_turns: number;
    extracted: number;
    with_source_ref: number;
    removed: number;
  };
  usage?: { inputTokens: number; outputTokens: number };
}

export async function extractSentencesFromConversation(
  conversationId: string,
  options?: { max_sentences?: number; language?: string },
  positionOffset = 0
): Promise<ExtractionOutput> {
  const db = await getDB();

  // 1. Fetch turns
  const turns = await findTurnsByConversation(db, {
    conversationId,
    limit: 500,
  });

  if (turns.length === 0) {
    return {
      sentences: [],
      model: 'none',
      stats: { total_turns: 0, extracted: 0, with_source_ref: 0, removed: 0 },
    };
  }

  // 2. Convert to TurnInput
  const turnInputs: TurnInput[] = turns.map((t) => ({
    conversation_id: t.conversationId,
    turn_hash: t.turnHash,
    role: t.role as TurnInput['role'],
    content: t.content,
  }));

  // 3. Get LLM provider via registry fallback (with usage tracking)
  const reg = await getProviderRegistry();
  const trackedUsage = { inputTokens: 0, outputTokens: 0 };
  const result = await reg.tryWithFallback('generation', (provider) => {
    const { provider: tracked, usage } = wrapWithUsageTracking(provider);
    trackedUsage.inputTokens = 0;
    trackedUsage.outputTokens = 0;
    const promise = createLLMExtractor(tracked).extract(turnInputs, {
      maxSentences: options?.max_sentences,
      language: options?.language,
    });
    // Capture usage after extraction completes
    return promise.then((r) => {
      trackedUsage.inputTokens = usage.inputTokens;
      trackedUsage.outputTokens = usage.outputTokens;
      return r;
    });
  });

  // 4. Validate
  const { valid, removed } = validateExtractedSentences(result.sentences, turnInputs);

  // 5. Convert to DraftSentence format
  const draftSentences = valid.map((s, i) => {
    const turn = turnInputs[s.turn_index];
    return {
      id: generateDraftSentenceId(),
      text: s.text,
      origin: {
        type: 'extracted' as const,
        segment_id: `llm_${i}`,
        confidence: s.confidence,
      },
      source: s.source_ref
        ? {
            conversation_id: s.source_ref.conversation_id,
            turn_hash: s.source_ref.turn_hash,
            role: turn?.role ?? 'unknown',
            start_char: s.source_ref.start_char,
            end_char: s.source_ref.end_char,
          }
        : undefined,
      position: positionOffset + i,
      included: true,
    };
  });

  return {
    sentences: draftSentences,
    model: result.model,
    stats: {
      total_turns: turns.length,
      extracted: valid.length,
      with_source_ref: valid.filter((s) => s.source_ref).length,
      removed: removed.length,
    },
    usage: trackedUsage.inputTokens || trackedUsage.outputTokens ? trackedUsage : undefined,
  };
}

// ============================================================
// Route Handlers
// ============================================================

extractRoutes.openapi(extractSentencesRoute, async (c) => {
  const body = c.req.valid('json');

  try {
    const result = await extractSentencesFromConversation(body.conversation_id, body.options);

    if (result.stats.total_turns === 0) {
      return errorResponse(
        c,
        'CONVERSATION_NOT_FOUND',
        `No turns found for conversation: ${body.conversation_id}`
      );
    }

    // Record usage (fire-and-forget)
    if (result.usage) {
      const db = await getDB();
      recordUsageFireAndForget(db, {
        user_id: getUserId(c) ?? undefined,
        project_id: body.project_id,
        endpoint: 'extract_sentences',
        model: result.model,
        input_tokens: result.usage.inputTokens,
        output_tokens: result.usage.outputTokens,
      });
    }

    return c.json(
      {
        success: true as const,
        data: {
          sentences: result.sentences,
          model: result.model,
          stats: result.stats,
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
    return errorResponse(c, 'GENERATION_FAILED', message);
  }
});

// ============================================================
// Extract from Leaf Output (Upgrade #4: lesson feedback loop)
// ============================================================

/**
 * Extract sentences from a leaf's output text.
 * Reuses the LLM extraction pipeline but treats the output as a single "turn".
 */
export async function extractSentencesFromLeafOutput(
  leafId: string,
  output: string,
  options?: { max_sentences?: number }
): Promise<ExtractionOutput> {
  // Treat the leaf output as a single turn input
  const turnInputs: TurnInput[] = [
    {
      conversation_id: `leaf:${leafId}`,
      turn_hash: `leaf_output:${leafId}`,
      role: 'assistant' as const,
      content: output,
    },
  ];

  const reg = await getProviderRegistry();
  const trackedUsage = { inputTokens: 0, outputTokens: 0 };
  const result = await reg.tryWithFallback('generation', (provider) => {
    const { provider: tracked, usage } = wrapWithUsageTracking(provider);
    trackedUsage.inputTokens = 0;
    trackedUsage.outputTokens = 0;
    return createLLMExtractor(tracked)
      .extract(turnInputs, {
        maxSentences: options?.max_sentences ?? 20,
      })
      .then((r) => {
        trackedUsage.inputTokens = usage.inputTokens;
        trackedUsage.outputTokens = usage.outputTokens;
        return r;
      });
  });

  const { valid, removed } = validateExtractedSentences(result.sentences, turnInputs);

  const draftSentences = valid.map((s, i) => ({
    id: generateDraftSentenceId(),
    text: s.text,
    origin: {
      type: 'extracted' as const,
      segment_id: `leaf_${i}`,
      confidence: s.confidence,
    },
    source: s.source_ref
      ? {
          conversation_id: s.source_ref.conversation_id,
          turn_hash: s.source_ref.turn_hash,
          role: 'assistant',
          start_char: s.source_ref.start_char,
          end_char: s.source_ref.end_char,
        }
      : undefined,
    position: i,
    included: true,
  }));

  return {
    sentences: draftSentences,
    model: result.model,
    stats: {
      total_turns: 1,
      extracted: valid.length,
      with_source_ref: valid.filter((s) => s.source_ref).length,
      removed: removed.length,
    },
    usage: trackedUsage.inputTokens || trackedUsage.outputTokens ? trackedUsage : undefined,
  };
}

// ============================================================
// POST /v1/extract/incremental - Incremental LLM extraction
// ============================================================

const incrementalExtractRoute = createRoute({
  method: 'post',
  path: '/v1/extract/incremental',
  tags: ['Extract'],
  summary: 'Run incremental LLM extraction on a conversation for a draft',
  request: {
    body: {
      content: { 'application/json': { schema: IncrementalExtractRequest } },
    },
  },
  responses: {
    200: {
      description: 'Extraction completed',
      content: { 'application/json': { schema: IncrementalExtractResponse } },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Draft not found',
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

extractRoutes.openapi(incrementalExtractRoute, async (c) => {
  const { project_id, conversation_id, draft_id } = c.req.valid('json');

  try {
    const db = await getDB();

    // 1. Load draft
    const draft = await findDraftV3ById(db, draft_id);
    if (!draft) return errorResponse(c, 'NOT_FOUND', 'Draft not found');

    // Validate project_id matches draft
    if (draft.project_id !== project_id) {
      return errorResponse(c, 'INVALID_REQUEST', 'Draft does not belong to the specified project');
    }

    // 2. Load conversation turns
    const turns = await findTurnsByConversation(db, {
      conversationId: conversation_id,
      limit: 500,
    });

    if (turns.length === 0) {
      return errorResponse(c, 'CONVERSATION_NOT_FOUND', 'No turns found');
    }

    const turnInputs: TurnInput[] = turns.map((t) => ({
      conversation_id: t.conversationId,
      turn_hash: t.turnHash,
      role: t.role as TurnInput['role'],
      content: t.content,
    }));

    // 3. Get LLM provider (with usage tracking)
    const reg = await getProviderRegistry();
    const trackedUsage = { inputTokens: 0, outputTokens: 0 };
    let trackedModel = 'unknown';
    const result = await reg.tryWithFallback('generation', (provider) => {
      const { provider: tracked, usage } = wrapWithUsageTracking(provider);
      trackedUsage.inputTokens = 0;
      trackedUsage.outputTokens = 0;
      trackedModel = tracked.id;
      const extractor = createLLMExtractor(tracked);
      const existingSPs = (draft.semantic_points ?? []) as SemanticPoint[];
      const cursor = (draft.extraction_cursor ?? { cursors: {} }) as ExtractionCursor;
      return extractor.extractIncremental(turnInputs, existingSPs, cursor).then((r) => {
        trackedUsage.inputTokens = usage.inputTokens;
        trackedUsage.outputTokens = usage.outputTokens;
        return r;
      });
    });

    // Record usage (fire-and-forget)
    if (trackedUsage.inputTokens || trackedUsage.outputTokens) {
      recordUsageFireAndForget(db, {
        user_id: getUserId(c) ?? undefined,
        project_id,
        endpoint: 'extract_incremental',
        model: trackedModel,
        input_tokens: trackedUsage.inputTokens,
        output_tokens: trackedUsage.outputTokens,
      });
    }

    // 4. Merge results into draft
    const existingSPs = (draft.semantic_points ?? []) as SemanticPoint[];
    const allSPs = [...existingSPs, ...result.readyPoints, ...result.reviewPoints];

    await updateDraftV3(
      db,
      draft_id,
      {
        semantic_points: allSPs,
        extraction_cursor: result.newCursor,
        extraction_mode: 'llm',
      },
      draft.revision
    );

    return c.json(
      {
        success: true as const,
        data: {
          ready_points: result.readyPoints,
          review_points: result.reviewPoints,
          cursor: result.newCursor,
          stats: result.stats,
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

export default extractRoutes;
