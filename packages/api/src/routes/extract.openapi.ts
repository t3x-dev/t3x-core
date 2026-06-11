/**
 * Extract Route — Integration Layer "Extract" Verb
 *
 * Composite endpoint that takes raw text, creates a conversation + turn,
 * runs the canonical extraction pipeline, and stores the result as a draft.
 *
 * Endpoints:
 * - POST /v1/extract — Extract structured state trees from raw text
 */

import type { z } from '@hono/zod-openapi';
import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { collectResult, runOperation, serializeForPrompt } from '@t3x-dev/core';
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
import { getUserId } from '../lib/project-access';
import { webhookDispatcher } from '../lib/webhook-dispatcher';
import { buildPipelineContext } from '../ops/context';
import { extractOp } from '../ops/extract';
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
  summary: 'Extract structured state trees from raw text',
  description:
    'Main entry point for the T3X workflow. Takes raw text and produces a structured state tree.\n\n' +
    '**What it does:**\n' +
    '1. Creates a conversation + turn from the raw text\n' +
    '2. Runs the LLM extraction pipeline (structure-aware, evidence-backed)\n' +
    '3. Stores the result as a draft\n\n' +
    '**After extraction:** Use `GET /v1/drafts/{draft_id}` to see the extracted tree, ' +
    'then `POST /v1/drafts/{draft_id}/apply-yops` to edit it, ' +
    'then `POST /v1/drafts/{draft_id}/commit` to save it.\n\n' +
    '**Extraction modes:** concise (~30% coverage), balanced (~70-80%), detailed (~95%). ' +
    "Set via project's `extraction_style` or pass `style` in the request body.",
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
      const conversation = await findConversationById(db, conversation_id);
      if (!conversation || conversation.projectId !== project_id) {
        return errorResponse(c, 'NOT_FOUND', `Conversation ${conversation_id} not found`);
      }
      conversationId = conversation.conversationId;
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

    // Step 4: Run the canonical extraction pipeline
    const ctx = await buildPipelineContext(c, project_id);
    const extraction = await collectResult(
      runOperation(
        extractOp,
        {
          conversationId,
          turnHashes: [turn.turnHash],
          userId: getUserId(c),
        },
        ctx
      )
    );

    if (!extraction.ok) {
      if (extraction.kind === 'conversation_not_found') {
        return errorResponse(c, 'NOT_FOUND', extraction.message);
      }
      if (extraction.kind === 'invalid_request') {
        return errorResponse(c, 'INVALID_REQUEST', extraction.message);
      }
      return errorResponse(c, 'EXTRACTION_FAILED', extraction.message);
    }

    const snapshot = extraction.snapshot as { trees: TreeNodeResult[]; relations: unknown[] };
    const trees = snapshot.trees;
    const yaml = serializeForPrompt(snapshot as Parameters<typeof serializeForPrompt>[0]);
    const drift: { node_path: string; before: string; after: string }[] | undefined = undefined;

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
