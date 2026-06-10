/**
 * Search Routes
 *
 * Search operates on tree-based state content via the project state index.
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { searchKnowledgeNodes } from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { ErrorResponseSchema } from '../schemas/common';

export const searchRoutes = new OpenAPIHono({ defaultHook: zodErrorHook });

// ── Schemas ──────────────────────────────────────────────────

const SearchRequestSchema = z.object({
  project_id: z.string().min(1).openapi({ description: 'Project to search in' }),
  query: z.string().min(1).max(500).openapi({ description: 'Search query text' }),
  mode: z.enum(['hybrid', 'keyword', 'semantic']).default('hybrid').openapi({
    description: 'Requested search mode',
  }),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .openapi({ description: 'Maximum results to return' }),
});

const SearchNodeSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  label: z.string(),
  type: z.string(),
  summary: z.string().nullable(),
  member_count: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});

const SearchResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    mode: z.enum(['hybrid', 'keyword', 'semantic']),
    nodes: z.array(SearchNodeSchema),
    count: z.number(),
  }),
});

// ── POST /v1/search ──────────────────────────────────────────

const searchRoute = createRoute({
  method: 'post',
  path: '/v1/search',
  tags: ['Search'],
  summary: 'Search nodes in a project',
  request: {
    body: {
      content: {
        'application/json': { schema: SearchRequestSchema },
      },
    },
  },
  responses: {
    200: {
      description: 'Tree-based search results',
      content: { 'application/json': { schema: SearchResponseSchema } },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Search failed',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

searchRoutes.openapi(searchRoute, async (c) => {
  const { project_id, query, mode, limit } = c.req.valid('json');

  try {
    const db = await getDB();
    const nodes = await searchKnowledgeNodes(db, project_id, query, { limit });

    return c.json(
      {
        success: true as const,
        data: {
          mode,
          nodes,
          count: nodes.length,
        },
      },
      200
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'SEARCH_FAILED', message);
  }
});
