/**
 * Search Routes
 *
 * Search now operates on tree-based semantic content. The route is registered
 * but intentionally unavailable until tree-based search is implemented.
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
    501: {
      description: 'Tree-based search is not implemented yet',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

searchRoutes.openapi(searchRoute, async (c) => {
  return errorResponse(c, 'NOT_IMPLEMENTED', 'Search is pending tree-based implementation.');
});
