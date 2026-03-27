/**
 * Search Routes
 *
 * Search endpoint stub. Tree-based search pending implementation.
 * Search now operates on tree-based semantic content.
 *
 * TODO: Implement tree-based search using commit content.trees
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { ErrorResponseSchema } from '../schemas/common';

export const searchRoutes = new OpenAPIHono({ defaultHook: zodErrorHook });

// ── Schemas ──────────────────────────────────────────────────

const SearchRequestSchema = z.object({
  project_id: z.string().min(1).openapi({ description: 'Project to search in' }),
  query: z.string().min(1).max(500).openapi({ description: 'Search query text' }),
  mode: z.enum(['hybrid', 'keyword', 'semantic']).default('hybrid').openapi({
    description: 'Search mode (currently not implemented)',
  }),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .openapi({ description: 'Maximum results to return' }),
});

const SearchResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    results: z.array(z.unknown()),
    total: z.number(),
    mode: z.enum(['hybrid', 'keyword', 'semantic']),
    query_time_ms: z.number(),
  }),
});

// ── POST /v1/search ──────────────────────────────────────────

const searchRoute = createRoute({
  method: 'post',
  path: '/v1/search',
  tags: ['Search'],
  summary: 'Search nodes in a project (stub — pending tree-based implementation)',
  request: {
    body: {
      content: {
        'application/json': { schema: SearchRequestSchema },
      },
    },
  },
  responses: {
    200: {
      description: 'Search results',
      content: { 'application/json': { schema: SearchResponseSchema } },
    },
    501: {
      description: 'Not implemented',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

searchRoutes.openapi(searchRoute, async (c) => {
  // Return empty results — sentence_vectors table removed, tree-based search pending
  return c.json(
    {
      success: true as const,
      data: {
        results: [],
        total: 0,
        mode: 'keyword' as const,
        query_time_ms: 0,
      },
    },
    200
  );
});
