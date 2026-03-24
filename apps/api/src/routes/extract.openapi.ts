/**
 * Extract Route — Integration Layer "Extract" Verb
 *
 * Composite endpoint that takes raw text, creates a conversation + turn,
 * runs sentence extraction, stores results as a draft, and optionally
 * detects drift from previous extractions.
 *
 * Endpoints:
 * - POST /v1/extract — Extract semantic sentences from raw text
 */

import type { z } from '@hono/zod-openapi';
import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
  findConversationById,
  findProjectById,
  findTurnsByConversation,
  insertConversation,
  insertDraft,
  insertTurn,
  updateDraft,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { webhookDispatcher } from '../lib/webhook-dispatcher';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';
import {
  ExtractRequest,
  ExtractResponse,
  type ExtractSentence,
} from '../schemas/integration-contracts';

export const extractRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================
// Helpers
// ============================================================

/**
 * Split text into sentences using a simple regex heuristic.
 *
 * This is the pragmatic extraction approach (Option B). A full Ring-based
 * pipeline can be wired in later without changing the API contract.
 */
function extractSentencesFromText(
  text: string,
  conversationId: string,
  turnHash: string
): z.infer<typeof ExtractSentence>[] {
  const sentences: z.infer<typeof ExtractSentence>[] = [];
  const sentenceRegex = /[^.!?。！？]+[.!?。！？]+[\s]*/g;

  let match: RegExpExecArray | null;
  let idx = 0;
  let lastEnd = 0;

  while ((match = sentenceRegex.exec(text)) !== null) {
    const sentence = match[0].trim();
    if (sentence.length > 0) {
      sentences.push({
        id: `s_${idx++}`,
        text: sentence,
        confidence: 1.0,
        source_ref: {
          conversation_id: conversationId,
          turn_hash: turnHash,
          start_char: match.index,
          end_char: match.index + sentence.length,
        },
      });
      lastEnd = match.index + match[0].length;
    }
  }

  // Handle remaining text (no sentence-ending punctuation)
  if (lastEnd < text.length) {
    const remaining = text.slice(lastEnd).trim();
    if (remaining.length > 0) {
      sentences.push({
        id: `s_${idx}`,
        text: remaining,
        confidence: 1.0,
        source_ref: {
          conversation_id: conversationId,
          turn_hash: turnHash,
          start_char: lastEnd,
          end_char: text.length,
        },
      });
    }
  }

  return sentences;
}

/**
 * Serialize sentences to a YAML string.
 */
function sentencesToYaml(sentences: z.infer<typeof ExtractSentence>[]): string {
  if (sentences.length === 0) return 'sentences: []\n';

  const items = sentences
    .map((s) => {
      const escapedText = s.text.replace(/"/g, '\\"');
      let entry = `  - id: ${s.id}\n    text: "${escapedText}"\n    confidence: ${s.confidence}`;
      if (s.source_ref) {
        entry += '\n    source_ref:';
        entry += `\n      conversation_id: ${s.source_ref.conversation_id}`;
        entry += `\n      turn_hash: ${s.source_ref.turn_hash}`;
        entry += `\n      start_char: ${s.source_ref.start_char}`;
        entry += `\n      end_char: ${s.source_ref.end_char}`;
      }
      return entry;
    })
    .join('\n');

  return `sentences:\n${items}\n`;
}

/**
 * Detect drift between previous and current extractions.
 *
 * Drift occurs when a sentence's text in the new extraction is similar to
 * but different from a sentence in the previous extraction. Uses simple
 * Jaccard word overlap to find matching pairs, then reports changed text.
 */
function detectDrift(
  previousSentences: z.infer<typeof ExtractSentence>[],
  currentSentences: z.infer<typeof ExtractSentence>[]
): z.infer<typeof import('../schemas/integration-contracts').DriftItem>[] {
  const drift: { sentence_id: string; before: string; after: string }[] = [];

  for (const current of currentSentences) {
    const currentWords = new Set(current.text.toLowerCase().split(/\s+/));

    let bestMatch: (typeof previousSentences)[0] | null = null;
    let bestJaccard = 0;

    for (const prev of previousSentences) {
      const prevWords = new Set(prev.text.toLowerCase().split(/\s+/));
      const intersection = new Set([...currentWords].filter((w) => prevWords.has(w)));
      const union = new Set([...currentWords, ...prevWords]);
      const jaccard = union.size > 0 ? intersection.size / union.size : 0;

      if (jaccard > bestJaccard) {
        bestJaccard = jaccard;
        bestMatch = prev;
      }
    }

    // Similar enough to be the "same" sentence (Jaccard >= 0.3) but text changed
    if (bestMatch && bestJaccard >= 0.3 && bestMatch.text !== current.text) {
      drift.push({
        sentence_id: current.id,
        before: bestMatch.text,
        after: current.text,
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
  summary: 'Extract semantic sentences from raw text',
  description:
    'Composite endpoint: creates a conversation and turn from raw text, ' +
    'extracts sentences, stores them as a draft, and optionally detects drift ' +
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
      description: 'Extraction result with sentences and draft',
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

    // Step 2: Create or reuse conversation
    let conversationId: string;
    const previousSentences: z.infer<typeof ExtractSentence>[] = [];

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

      // Collect previous sentences for drift detection
      // Extract sentences from all existing turns in the conversation
      const existingTurns = await findTurnsByConversation(db, {
        conversationId,
        limit: 1000,
      });
      for (const turn of existingTurns) {
        const turnSentences = extractSentencesFromText(turn.content, conversationId, turn.turnHash);
        previousSentences.push(...turnSentences);
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

    // Step 4: Run extraction (sentence splitting)
    const sentences = extractSentencesFromText(text, conversationId, turn.turnHash);

    // Step 5: Create a draft with extracted sentences
    const draft = await insertDraft(db, {
      project_id,
      title: source ? `Extract: ${source}` : 'API extraction',
    });

    // Store sentences into the draft
    await updateDraft(db, draft.id, { sentences: sentences }, draft.revision);

    // Step 6: Detect drift (incremental mode only)
    let drift: { sentence_id: string; before: string; after: string }[] | undefined;
    if (conversation_id && previousSentences.length > 0) {
      const driftItems = detectDrift(previousSentences, sentences);
      if (driftItems.length > 0) {
        drift = driftItems;
      }
    }

    // Step 7: Fire webhooks
    webhookDispatcher.dispatch(
      'draft.ready',
      {
        project_id,
        draft_id: draft.id,
        conversation_id: conversationId,
        sentence_count: sentences.length,
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

    // Step 8: Build response
    const result: z.infer<typeof ExtractResponse> = {
      conversation_id: conversationId,
      draft_id: draft.id,
      sentences,
      yaml: sentencesToYaml(sentences),
      drift,
    };

    return c.json({ success: true as const, data: result }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'EXTRACTION_FAILED', message);
  }
});
