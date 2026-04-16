/**
 * Extract Incremental Route
 *
 * POST /v1/extract/incremental
 *
 * Adapter endpoint that bridges the legacy SemanticPoint-shaped contract
 * (still consumed by the commit wizard in apps/web) to the current
 * tree-based extraction pipeline. Post-sentence-shim removal (2026-03)
 * the old handler was deleted, but the client contract and the
 * `IncrementalExtract{Request,Response}` schemas are still in use.
 *
 * Flow:
 *   1. Validate draft + conversation exist and belong to project.
 *   2. Run `runExtractionPipeline(conversation_id, forceExtract)` — the
 *      same generator used by `/v1/extract` — and collect the final
 *      snapshot.
 *   3. Flatten the produced trees into SemanticPoint-shaped entries in
 *      the `ready` zone (the tree pipeline does not have a review
 *      phase; ambiguity is surfaced via drift/advisory events, not
 *      per-point zones).
 *   4. Persist the flattened points + cursor onto the draft so the
 *      workspace can re-open the same state.
 *   5. Return `{ ready_points, review_points, cursor, stats }`.
 *
 * This handler deliberately does NOT reintroduce the sentence shim
 * pipeline — it is a thin converter over the current tree pipeline.
 */

import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import type { SemanticContent, TreeNode } from '@t3x-dev/core';
import { flattenTrees } from '@t3x-dev/core';
import { findConversationById, findDraftById, updateDraft } from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { type PipelineEvent, runExtractionPipeline } from '../lib/extraction-pipeline';
import { ErrorResponseSchema } from '../schemas/common';
import { IncrementalExtractRequest, IncrementalExtractResponse } from '../schemas/contracts';

export const extractIncrementalRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

interface EnrichedTreeNode extends TreeNode {
  source?: string;
  slot_quotes?: Record<string, string>;
  children: EnrichedTreeNode[];
}

interface SemanticPointOut {
  id: string;
  text: string;
  extraction_mode: 'deterministic' | 'llm_extracted' | 'manual';
  inference_type?: 'direct' | 'paraphrase' | 'cross_turn' | 'implicit';
  status: 'inherited' | 'auto_landed' | 'reviewed' | 'modified' | 'reinforced' | 'undone';
  zone: 'ready' | 'review';
  routing_reason?: string;
  inherited_from?: string;
  evidence: Array<{
    conversation_id: string;
    turn_hash: string;
    quoted_text: string;
    start_char: number;
    end_char: number;
    match_score: number;
    role: 'primary' | 'supporting';
    relevance: string;
    enabled: boolean;
  }>;
  low_coverage?: boolean;
  position: number;
  staged: boolean;
}

/** Pick a short display text for a flattened tree node. */
function buildPointText(node: EnrichedTreeNode): string {
  const slots = node.slots ?? {};
  const parts: string[] = [];
  for (const [key, val] of Object.entries(slots)) {
    if (typeof val === 'string' && val.trim()) {
      parts.push(`${key}: ${val.trim()}`);
    } else if (val !== null && val !== undefined && typeof val !== 'object') {
      parts.push(`${key}: ${String(val)}`);
    }
  }
  if (parts.length > 0) return `${node.key} — ${parts.join('; ')}`;
  return node.key;
}

/** Convert a SemanticContent snapshot into SemanticPoints (all `ready`). */
function contentToPoints(content: SemanticContent, conversationId: string): SemanticPointOut[] {
  const points: SemanticPointOut[] = [];
  let position = 0;

  const walk = (node: EnrichedTreeNode, parentPath: string) => {
    const path = parentPath ? `${parentPath}/${node.key}` : node.key;
    const text = buildPointText(node);
    if (text.trim().length > 0) {
      const quote = node.source
        ? Object.values(node.slot_quotes ?? {}).find(
            (v): v is string => typeof v === 'string' && v.length > 0
          )
        : undefined;
      points.push({
        id: `sp_${path.replace(/[^A-Za-z0-9_]/g, '_')}`,
        text,
        extraction_mode: 'llm_extracted',
        status: 'auto_landed',
        zone: 'ready',
        inherited_from: undefined,
        evidence: quote
          ? [
              {
                conversation_id: conversationId,
                turn_hash: node.source ?? '',
                quoted_text: quote,
                start_char: 0,
                end_char: quote.length,
                match_score: 1,
                role: 'primary',
                relevance: 'auto',
                enabled: true,
              },
            ]
          : [],
        position,
        staged: false,
      });
      position += 1;
    }
    for (const child of node.children ?? []) {
      walk(child, path);
    }
  };

  for (const tree of content.trees) walk(tree as EnrichedTreeNode, '');
  return points;
}

// ═══════════════════════════════════════════════════════════════════════════
// Route Definition
// ═══════════════════════════════════════════════════════════════════════════

const incrementalExtractRoute = createRoute({
  method: 'post',
  path: '/v1/extract/incremental',
  tags: ['Extract'],
  summary: 'Run incremental LLM extraction on a conversation for a draft',
  description:
    'Adapter over the current tree extraction pipeline — returns the extracted snapshot as `SemanticPoint[]` in the `ready_points` array. `review_points` is always empty under the current pipeline (ambiguity is surfaced via drift/advisory events rather than per-point zones).',
  request: {
    body: {
      content: { 'application/json': { schema: IncrementalExtractRequest } },
    },
  },
  responses: {
    200: {
      description: 'Extraction completed',
      content: {
        'application/json': { schema: IncrementalExtractResponse },
      },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Draft, project, or conversation not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// Handler
// ═══════════════════════════════════════════════════════════════════════════

extractIncrementalRoutes.openapi(incrementalExtractRoute, async (c) => {
  const { project_id, conversation_id, draft_id } = c.req.valid('json');

  try {
    const db = await getDB();

    // 1. Validate draft
    const draft = await findDraftById(db, draft_id);
    if (!draft) return errorResponse(c, 'NOT_FOUND', 'Draft not found');
    if (draft.project_id !== project_id) {
      return errorResponse(c, 'INVALID_REQUEST', 'Draft does not belong to the specified project');
    }

    // 2. Validate conversation
    const conv = await findConversationById(db, conversation_id);
    if (!conv) return errorResponse(c, 'NOT_FOUND', 'Conversation not found');
    if (conv.projectId !== project_id) {
      return errorResponse(
        c,
        'INVALID_REQUEST',
        'Conversation does not belong to the specified project'
      );
    }

    // 3. Run the extraction pipeline (forceExtract → skip readiness/session gates)
    const events: PipelineEvent[] = [];
    for await (const event of runExtractionPipeline({
      conversationId: conversation_id,
      projectId: project_id,
      forceExtract: true,
    })) {
      events.push(event);
    }

    const errorEvent = events.find((e) => e.type === 'error');
    if (errorEvent) {
      const code = String(errorEvent.data.code ?? 'EXTRACTION_FAILED');
      const message = String(errorEvent.data.message ?? 'Extraction failed');
      if (code === 'LLM_NOT_CONFIGURED') {
        return c.json(
          {
            success: false as const,
            error: {
              code,
              message,
            },
          },
          503
        );
      }
      if (code === 'CONVERSATION_NOT_FOUND') {
        return errorResponse(c, 'NOT_FOUND', message);
      }
      return errorResponse(c, code, message);
    }

    const doneEvent = events.find((e) => e.type === 'done');
    if (!doneEvent || !doneEvent.data.snapshot) {
      // Pipeline could also 'skip' (readiness blocked, no extractable content).
      // Treat skip as an empty successful extraction.
      const skipEvent = events.find((e) => e.type === 'skipped');
      if (skipEvent) {
        const emptyCursor = {
          cursors: {} as Record<string, { last_processed_turn: string; processed_at: string }>,
        };
        await updateDraft(
          db,
          draft_id,
          {
            semantic_points: [],
            extraction_cursor: emptyCursor,
            extraction_mode: 'llm',
          },
          draft.revision
        );
        return c.json(
          {
            success: true as const,
            data: {
              ready_points: [],
              review_points: [],
              cursor: emptyCursor,
              stats: {
                total_turns: 0,
                new_turns: 0,
                proposals: 0,
                auto_landed: 0,
                needs_review: 0,
                rejected: 0,
              },
            },
          },
          200
        );
      }
      return errorResponse(c, 'EXTRACTION_FAILED', 'Pipeline did not produce a result');
    }

    const snapshot = doneEvent.data.snapshot as SemanticContent;
    const deltaYops = Array.isArray(doneEvent.data.delta)
      ? (doneEvent.data.delta as unknown[])
      : [];

    // 4. Convert snapshot → SemanticPoints (all ready under the tree pipeline)
    const readyPoints = contentToPoints(snapshot, conversation_id);
    const reviewPoints: SemanticPointOut[] = [];

    // 5. Build cursor — record "last processed turn" for this conversation.
    //    Derive from the latest turn_hash we can see in the snapshot's node
    //    sources; fall back to snapshot creation time.
    const flat = flattenTrees(snapshot.trees);
    const lastTurnHash = (snapshot.trees as EnrichedTreeNode[])
      .flatMap(function collect(t: EnrichedTreeNode): string[] {
        const own = t.source ? [t.source] : [];
        const kids = (t.children ?? []).flatMap(collect);
        return [...own, ...kids];
      })
      .filter((s) => typeof s === 'string' && s.length > 0)
      .pop();
    const cursor = {
      cursors: {
        [conversation_id]: {
          last_processed_turn: lastTurnHash ?? '',
          processed_at: new Date().toISOString(),
        },
      },
    };

    // 6. Persist points + cursor onto the draft so the workbench can re-read
    await updateDraft(
      db,
      draft_id,
      {
        semantic_points: [...readyPoints, ...reviewPoints] as unknown[],
        extraction_cursor: cursor,
        extraction_mode: 'llm',
      },
      draft.revision
    );

    // 7. Build stats
    const stats = {
      total_turns: 0, // opaque to this handler; client does not rely on exact count
      new_turns: deltaYops.length,
      proposals: readyPoints.length + reviewPoints.length,
      auto_landed: readyPoints.length,
      needs_review: reviewPoints.length,
      rejected: 0,
    };

    // Derive total_turns from flat node count as a harmless approximation
    // (the legacy field is informational — the client only reads .proposals)
    stats.total_turns = flat.length;

    return c.json(
      {
        success: true as const,
        data: {
          ready_points: readyPoints,
          review_points: reviewPoints,
          cursor,
          stats,
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

export default extractIncrementalRoutes;
