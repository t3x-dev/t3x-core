/**
 * Extract Route — Integration Layer "Extract" Verb
 *
 * Composite endpoint that takes raw text, creates a conversation + turn,
 * runs the canonical extraction pipeline, and stores the result as a draft.
 *
 * Endpoints:
 * - POST /v1/extract — Extract structured state trees from raw text
 */

import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { extractLegacyTextToDraft, LegacyExtractError } from '../lib/legacy-extract';
import { assertProjectAccess, getUserId } from '../lib/project-access';
import { buildPipelineContext } from '../ops/context';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';
import { ExtractRequest, ExtractResponse } from '../schemas/integration-contracts';

export const extractRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

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

    // Step 1: Verify both project existence and caller access before any writes.
    const access = await assertProjectAccess(c, db, project_id);
    if (access instanceof Response) return access;

    const ctx = await buildPipelineContext(c, project_id);
    const result = await extractLegacyTextToDraft({
      db,
      context: ctx,
      projectId: project_id,
      text,
      conversationId: conversation_id,
      source,
      userId: getUserId(c),
    });

    return c.json({ success: true as const, data: result }, 200);
  } catch (err) {
    if (err instanceof LegacyExtractError) {
      if (err.kind === 'conversation_not_found') {
        return errorResponse(c, 'NOT_FOUND', err.message);
      }
      if (err.kind === 'invalid_request') {
        return errorResponse(c, 'INVALID_REQUEST', err.message);
      }
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'EXTRACTION_FAILED', message);
  }
});
