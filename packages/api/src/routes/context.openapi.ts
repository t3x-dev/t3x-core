/**
 * Context Route — Integration Layer "Show" Verb
 *
 * Returns the current semantic knowledge (trees) from the latest
 * commit on a branch.
 *
 * Endpoints:
 * - GET /v1/projects/:id/context — Get current context for a project
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { serializeForPrompt } from '@t3x-dev/core';
import { getLatestCommit } from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';
import { ContextQuery, ContextResponse } from '../schemas/integration-contracts';

export const contextRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================
// Route Definition
// ============================================================

const getContextRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/context',
  tags: ['Integration'],
  summary: 'Get current semantic context',
  description:
    'Returns the current semantic knowledge (trees) from the latest commit on a branch. ' +
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
        trees: [],
      };
      if (format === 'yaml') {
        emptyResult.yaml = 'trees: []\n';
      }
      return c.json({ success: true as const, data: emptyResult }, 200);
    }

    // Return trees directly from the commit
    const trees = commit.content.trees ?? [];

    const result: z.infer<typeof ContextResponse> = {
      commit_hash: commit.hash,
      branch,
      trees,
    };

    if (format === 'yaml') {
      result.yaml = serializeForPrompt(commit.content);
    }

    return c.json({ success: true as const, data: result }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'GET_FAILED', message);
  }
});
