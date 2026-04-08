/**
 * Extract Route — Integration Layer "Extract" Verb
 *
 * Composite endpoint that takes raw text, creates a conversation + turn,
 * runs the extraction pipeline, stores results as a draft, and optionally
 * detects drift from previous extractions.
 *
 * Endpoints:
 * - POST /v1/extract — Extract semantic trees from raw text
 */

import type { z } from '@hono/zod-openapi';
import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { serializeForPrompt } from '@t3x-dev/core';
import {
  findConversationById,
  findProjectById,
  insertConversation,
  insertDraft,
  insertTurn,
  updateDraft,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { type PipelineEvent, runExtractionPipeline } from '../lib/extraction-pipeline';
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

// ============================================================
// Route Definition
// ============================================================

const postExtractRoute = createRoute({
  method: 'post',
  path: '/v1/extract',
  tags: ['Integration'],
  operationId: 'extractSemanticTrees',
  summary: 'Extract semantic trees from raw text',
  description:
    'Main entry point for the T3X workflow. Takes raw text and produces a structured semantic tree.\n\n' +
    '**What it does:**\n' +
    '1. Creates a conversation + turn from the raw text\n' +
    '2. Runs the LLM extraction pipeline (structure-aware, evidence-backed)\n' +
    '3. Stores the result as a draft\n' +
    '4. Detects drift from previous extractions in incremental mode\n\n' +
    '**After extraction:** Use `GET /v1/drafts/{draft_id}` to see the extracted tree, ' +
    'then `POST /v1/drafts/{draft_id}/apply-yops` to edit it, ' +
    'then `POST /v1/drafts/{draft_id}/commit` to save it.\n\n' +
    '**Extraction modes:** concise (~30% coverage), balanced (~70-80%), detailed (~95%). ' +
    'Set via project\'s `extraction_style` or pass `style` in the request body.',
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

    // Step 4: Run the extraction pipeline
    const events: PipelineEvent[] = [];
    for await (const event of runExtractionPipeline({
      conversationId,
      projectId: project_id,
      turnHashes: [turn.turnHash],
      forceExtract: true, // Skip session/readiness gates for API calls
    })) {
      events.push(event);
    }

    // Check for pipeline errors
    const errorEvent = events.find((e) => e.type === 'error');
    if (errorEvent) {
      const code = String(errorEvent.data.code ?? 'EXTRACTION_FAILED');
      const message = String(errorEvent.data.message ?? 'Pipeline extraction failed');
      return errorResponse(c, code, message);
    }

    // Get final snapshot from the done event
    const doneEvent = events.find((e) => e.type === 'done');
    if (!doneEvent || !doneEvent.data.snapshot) {
      return errorResponse(c, 'EXTRACTION_FAILED', 'Pipeline did not produce a result');
    }

    const snapshot = doneEvent.data.snapshot as { trees: TreeNodeResult[]; relations: unknown[] };
    const trees = snapshot.trees;
    const yaml = serializeForPrompt(snapshot as Parameters<typeof serializeForPrompt>[0]);

    // Check for drift events from the pipeline
    const driftEvent = events.find((e) => e.type === 'drift');
    let drift: { node_path: string; before: string; after: string }[] | undefined;
    if (driftEvent) {
      // Map pipeline drift info to API response format
      drift = [
        {
          node_path: String(driftEvent.data.old_topic ?? ''),
          before: String(driftEvent.data.old_topic ?? ''),
          after: String(driftEvent.data.new_topic ?? ''),
        },
      ];
    }

    // Step 5: Create a user-facing draft with extracted trees
    const draft = await insertDraft(db, {
      project_id,
      title: source ? `Extract: ${source}` : 'API extraction',
    });

    // Store trees into the draft
    await updateDraft(db, draft.id, { nodes: trees }, draft.revision);

    // Step 6: Fire webhooks
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

    // Step 7: Build response
    const result: z.infer<typeof ExtractResponse> = {
      conversation_id: conversationId,
      draft_id: draft.id,
      trees,
      yaml,
      drift,
      extraction_mode: 'llm',
    };

    return c.json({ success: true as const, data: result }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'EXTRACTION_FAILED', message);
  }
});
