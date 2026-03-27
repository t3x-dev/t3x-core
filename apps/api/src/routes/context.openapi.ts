/**
 * Context Route — Integration Layer "Show" Verb
 *
 * Returns the current semantic knowledge (sentences) from the latest
 * commit on a branch.
 *
 * Endpoints:
 * - GET /v1/projects/:id/context — Get current context for a project
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { flattenTrees } from '@t3x-dev/core';
import { getLatestCommit } from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';
import {
  ContextQuery,
  ContextResponse,
  type ExtractSentence,
} from '../schemas/integration-contracts';

export const contextRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================
// Helpers
// ============================================================

/**
 * Convert a Frame to the integration-layer ExtractSentence format.
 *
 * Frames are the internal storage model; sentences are the simplified
 * integration-layer view for external consumers.
 */
function frameToSentence(frame: { id: string; type: string; slots: Record<string, unknown>; confidence?: number }): z.infer<typeof ExtractSentence> {
  // Build a human-readable text from frame type + slots
  const slotEntries = Object.entries(frame.slots)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(', ');
  const text = `[${frame.type}] ${slotEntries}`;

  return {
    id: frame.id,
    text,
    confidence: frame.confidence ?? 1.0,
    // source_ref could be derived from slot_sources but is optional
    source_ref: undefined,
  };
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
        entry += `\n    source_ref:`;
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

// ============================================================
// Route Definition
// ============================================================

const getContextRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/context',
  tags: ['Integration'],
  summary: 'Get current semantic context',
  description:
    'Returns the current semantic knowledge (sentences) from the latest commit on a branch. ' +
    'Optionally returns YAML format for human-readable inspection.',
  request: {
    params: z.object({
      id: z.string().min(1),
    }),
    query: ContextQuery,
  },
  responses: {
    200: {
      description: 'Current context retrieved successfully',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(ContextResponse),
        },
      },
    },
    404: {
      description: 'Project not found',
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

contextRoutes.openapi(getContextRoute, async (c) => {
  const { id: projectId } = c.req.valid('param');
  const { branch, format } = c.req.valid('query');

  try {
    const db = await getDB();

    const commit = await getLatestCommit(db, projectId, branch);

    // No commits on this branch — return empty context
    if (!commit) {
      const emptyResult: z.infer<typeof ContextResponse> = {
        commit_hash: null,
        branch,
        sentences: [],
      };
      if (format === 'yaml') {
        emptyResult.yaml = sentencesToYaml([]);
      }
      return c.json({ success: true as const, data: emptyResult }, 200);
    }

    // Convert frames to integration-layer sentences
    const flat = flattenTrees(commit.content.trees ?? []);
    const sentences = flat.map(frameToSentence);

    const result: z.infer<typeof ContextResponse> = {
      commit_hash: commit.hash,
      branch,
      sentences,
    };

    if (format === 'yaml') {
      result.yaml = sentencesToYaml(sentences);
    }

    return c.json({ success: true as const, data: result }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'GET_FAILED', message);
  }
});
