/**
 * Extract Route — Integration Layer "Extract" Verb
 *
 * Composite endpoint that takes raw text, creates a conversation + turn,
 * runs tree extraction, stores results as a draft, and optionally
 * detects drift from previous extractions.
 *
 * Endpoints:
 * - POST /v1/extract — Extract semantic trees from raw text
 */

import type { z } from '@hono/zod-openapi';
import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import type { ExtractionTurn, SemanticContent, TreeNode } from '@t3x-dev/core';
import { DEFAULT_STYLE, Extractor, serializeForPrompt } from '@t3x-dev/core';
import {
  findAutoDraftsByConversation,
  findConversationById,
  findProjectById,
  findTurnsByConversation,
  insertAutoDraft,
  insertConversation,
  insertDraft,
  insertTurn,
  updateDraft,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { getLLMProvider } from '../lib/provider-registry';
import { webhookDispatcher } from '../lib/webhook-dispatcher';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';
import {
  ExtractRequest,
  ExtractResponse,
  type ExtractTree,
} from '../schemas/integration-contracts';

export const extractRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================
// Helpers
// ============================================================

/** TreeNode shape used in the integration layer */
type TreeNodeResult = z.infer<typeof ExtractTree>;

/**
 * Split text into tree nodes using a simple regex heuristic.
 *
 * Each text segment becomes a TreeNode with key 's_N' and slots: { text: '...' }.
 * This is the pragmatic extraction approach (Option B). A full Ring-based
 * pipeline can be wired in later without changing the API contract.
 */
function extractTreesFromText(
  text: string,
  _conversationId: string,
  _turnHash: string
): TreeNodeResult[] {
  const trees: TreeNodeResult[] = [];
  const segmentRegex = /[^.!?。！？]+[.!?。！？]+[\s]*/g;

  let match: RegExpExecArray | null;
  let idx = 0;
  let lastEnd = 0;

  while ((match = segmentRegex.exec(text)) !== null) {
    const segment = match[0].trim();
    if (segment.length > 0) {
      trees.push({
        key: `s_${idx++}`,
        slots: { text: segment },
        children: [],
        confidence: 1.0,
      });
      lastEnd = match.index + match[0].length;
    }
  }

  // Handle remaining text (no segment-ending punctuation)
  if (lastEnd < text.length) {
    const remaining = text.slice(lastEnd).trim();
    if (remaining.length > 0) {
      trees.push({
        key: `s_${idx}`,
        slots: { text: remaining },
        children: [],
        confidence: 1.0,
      });
    }
  }

  return trees;
}

/**
 * Serialize trees to a YAML string.
 */
function treesToYaml(trees: TreeNodeResult[]): string {
  if (trees.length === 0) return 'trees: []\n';

  const items = trees
    .map((t: any) => {
      const slotText = typeof t.slots?.text === 'string' ? t.slots.text : '';
      const escapedText = slotText.replace(/"/g, '\\"');
      let entry = `  - key: ${t.key}\n    slots:\n      text: "${escapedText}"`;
      if (t.confidence !== undefined) {
        entry += `\n    confidence: ${t.confidence}`;
      }
      return entry;
    })
    .join('\n');

  return `trees:\n${items}\n`;
}

/**
 * Detect drift between previous and current extractions.
 *
 * Drift occurs when a tree node's text in the new extraction is similar to
 * but different from a node in the previous extraction. Uses simple
 * Jaccard word overlap to find matching pairs, then reports changed text.
 */
function detectDrift(
  previousTrees: TreeNodeResult[],
  currentTrees: TreeNodeResult[]
): { node_path: string; before: string; after: string }[] {
  const drift: { node_path: string; before: string; after: string }[] = [];

  for (const current of currentTrees) {
    const currentText = String((current as any).slots?.text ?? '');
    const currentWords = new Set(currentText.toLowerCase().split(/\s+/));

    let bestMatch: TreeNodeResult | null = null;
    let bestJaccard = 0;

    for (const prev of previousTrees) {
      const prevText = String((prev as any).slots?.text ?? '');
      const prevWords = new Set(prevText.toLowerCase().split(/\s+/));
      const intersection = new Set([...currentWords].filter((w) => prevWords.has(w)));
      const union = new Set([...currentWords, ...prevWords]);
      const jaccard = union.size > 0 ? intersection.size / union.size : 0;

      if (jaccard > bestJaccard) {
        bestJaccard = jaccard;
        bestMatch = prev;
      }
    }

    // Similar enough to be the "same" node (Jaccard >= 0.3) but text changed
    const bestMatchText = bestMatch ? String((bestMatch as any).slots?.text ?? '') : '';
    if (bestMatch && bestJaccard >= 0.3 && bestMatchText !== currentText) {
      drift.push({
        node_path: String((current as any).key),
        before: bestMatchText,
        after: currentText,
      });
    }
  }

  return drift;
}

// ============================================================
// Route Definition
// ============================================================

const postExtractRoute = createRoute({
  method: 'post',
  path: '/v1/extract',
  tags: ['Integration'],
  summary: 'Extract semantic trees from raw text',
  description:
    'Composite endpoint: creates a conversation and turn from raw text, ' +
    'extracts trees, stores them as a draft, and optionally detects drift ' +
    'from previous extractions in incremental mode.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: ExtractRequest,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Extraction result with trees and draft',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(ExtractResponse),
        },
      },
    },
    404: {
      description: 'Project or conversation not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

// ============================================================
// LLM Extraction (with regex fallback)
// ============================================================

/**
 * Try LLM-based semantic extraction via Extractor.
 * Returns TreeNode[] on success, null on failure (caller should fallback to regex).
 *
 * When `options` is provided with allTurns + snapshot, uses incremental mode:
 * the LLM sees the full conversation history and existing tree, and produces
 * targeted updates (set/add/drop) rather than extracting from scratch.
 */
async function extractWithLLM(
  text: string,
  turnHash: string,
  options?: {
    allTurns?: ExtractionTurn[];
    snapshot?: SemanticContent;
    processedTurnCount?: number;
  }
): Promise<{ trees: TreeNode[]; yaml: string } | null> {
  try {
    const provider = await getLLMProvider();
    if (!provider) return null;

    const extractor = new Extractor(provider);

    // Build ExtractionInput — incremental when snapshot provided, one-shot otherwise
    const turns: ExtractionTurn[] = options?.allTurns ?? [
      { role: 'user', content: text, turn_hash: turnHash },
    ];

    const result = await extractor.extract(
      {
        turns,
        snapshot: options?.snapshot,
        processedTurnCount: options?.processedTurnCount,
      },
      DEFAULT_STYLE
    );

    if (!result.ok) {
      console.warn('[extract] LLM extraction failed:', result.error);
      return null;
    }

    const yaml = serializeForPrompt(result.snapshot);
    return { trees: result.snapshot.trees, yaml };
  } catch (err) {
    console.warn('[extract] LLM extraction error:', err instanceof Error ? err.message : err);
    return null;
  }
}

// ============================================================
// Route Handler
// ============================================================

extractRoutes.openapi(postExtractRoute, async (c) => {
  const { project_id, text, conversation_id, source } = c.req.valid('json');

  try {
    const db = await getDB();

    // Step 1: Verify project exists
    const project = await findProjectById(db, project_id);
    if (!project) {
      return errorResponse(c, 'NOT_FOUND', `Project ${project_id} not found`);
    }

    // Step 2: Create or reuse conversation, load incremental context
    let conversationId: string;
    let previousTrees: TreeNodeResult[] = [];
    let existingSnapshot: SemanticContent | undefined;
    let allTurns: ExtractionTurn[] = [];
    let processedTurnCount = 0;
    let autoDraftId: string | undefined;
    let autoDraftRevision: number | undefined;

    if (conversation_id) {
      // Incremental mode: verify conversation exists and belongs to project
      const conversation = await findConversationById(db, conversation_id);
      if (!conversation) {
        return errorResponse(c, 'NOT_FOUND', `Conversation ${conversation_id} not found`);
      }
      if (conversation.projectId !== project_id) {
        return errorResponse(
          c,
          'NOT_FOUND',
          `Conversation ${conversation_id} not found in project ${project_id}`
        );
      }
      conversationId = conversation_id;

      // Load previous auto-draft (stores LLM-extracted trees from prior calls)
      const autoDrafts = await findAutoDraftsByConversation(db, project_id, conversation_id);
      const autoDraft = autoDrafts[0]; // Most recent

      if (autoDraft) {
        // Convert stored nodes back to SemanticContent snapshot
        const storedTrees = (autoDraft.nodes ?? []) as TreeNode[];
        existingSnapshot = { trees: storedTrees, relations: [] };
        previousTrees = storedTrees as TreeNodeResult[];
        autoDraftId = autoDraft.id;
        autoDraftRevision = autoDraft.revision;
      }

      // Build ExtractionTurn[] from existing turns (for LLM context)
      const existingTurns = await findTurnsByConversation(db, {
        conversationId,
        limit: 1000,
      });
      processedTurnCount = existingTurns.length;

      for (const t of existingTurns) {
        allTurns.push({
          role: t.role as ExtractionTurn['role'],
          content: t.content,
          turn_hash: t.turnHash,
        });
      }
    } else {
      // One-shot mode: create a new conversation
      const title = source ? `API extract: ${source}` : 'API extract';
      const conversation = await insertConversation(db, {
        projectId: project_id,
        title,
      });
      conversationId = conversation.conversationId;
    }

    // Step 3: Insert turn from raw text
    const turn = await insertTurn(db, {
      projectId: project_id,
      conversationId,
      role: 'user',
      content: text,
    });

    // Append new turn to allTurns for LLM context
    allTurns.push({ role: 'user', content: text, turn_hash: turn.turnHash });

    // Step 4: Run extraction — try LLM first, fallback to regex
    let trees: TreeNodeResult[];
    let yaml: string;
    const incrementalOpts =
      existingSnapshot || allTurns.length > 1
        ? { allTurns, snapshot: existingSnapshot, processedTurnCount }
        : undefined;

    const llmResult = await extractWithLLM(text, turn.turnHash, incrementalOpts);
    if (llmResult) {
      // LLM extraction succeeded — map TreeNode[] to API tree format
      trees = llmResult.trees as TreeNodeResult[];
      yaml = llmResult.yaml;
    } else {
      // Fallback to regex segmentation
      trees = extractTreesFromText(text, conversationId, turn.turnHash);
      yaml = treesToYaml(trees);
      _debugExtraction = 'regex_fallback';
    }

    // Step 5: Save/update auto-draft for future incremental calls
    if (autoDraftId && autoDraftRevision !== undefined) {
      // Update existing auto-draft with merged trees
      await updateDraft(db, autoDraftId, { nodes: trees }, autoDraftRevision);
    } else {
      // Create new auto-draft (for both one-shot and first incremental call)
      await insertAutoDraft(db, {
        project_id,
        conversation_id: conversationId,
        title: source ? `Auto: ${source}` : 'Auto extraction',
        nodes: trees,
      });
    }

    // Step 6: Create a user-facing draft with extracted trees
    const draft = await insertDraft(db, {
      project_id,
      title: source ? `Extract: ${source}` : 'API extraction',
    });

    // Store trees into the draft
    await updateDraft(db, draft.id, { nodes: trees }, draft.revision);

    // Step 7: Detect drift (incremental mode only)
    let drift: { node_path: string; before: string; after: string }[] | undefined;
    if (conversation_id && previousTrees.length > 0) {
      const driftItems = detectDrift(previousTrees, trees);
      if (driftItems.length > 0) {
        drift = driftItems;
      }
    }

    // Step 8: Fire webhooks
    webhookDispatcher.dispatch(
      'draft.ready',
      {
        project_id,
        draft_id: draft.id,
        conversation_id: conversationId,
        tree_count: trees.length,
      },
      project_id
    );

    if (drift && drift.length > 0) {
      webhookDispatcher.dispatch(
        'extraction.drift',
        {
          project_id,
          conversation_id: conversationId,
          drift_count: drift.length,
          drift,
        },
        project_id
      );
    }

    // Step 9: Build response
    const result: z.infer<typeof ExtractResponse> = {
      conversation_id: conversationId,
      draft_id: draft.id,
      trees,
      yaml,
      drift,
    };

    return c.json({ success: true as const, data: result }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'EXTRACTION_FAILED', message);
  }
});
