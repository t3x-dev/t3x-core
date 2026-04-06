/**
 * Relations Routes
 *
 * Relations are now stored inside commit content as `content.relations`.
 * This route reads them from the commit directly.
 *
 * - GET  /v1/commits/:hash/relations — Get relations for a commit
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { getCommitUnified } from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { assertProjectAccess } from '../lib/project-access';
import { ErrorResponseSchema } from '../schemas/common';

export const relationsRoutes = new OpenAPIHono({ defaultHook: zodErrorHook });

// ── Schemas ──────────────────────────────────────────────────

const RelationSchema = z.object({
  from: z.string(),
  to: z.string(),
  type: z.enum([
    'causes',
    'conditions',
    'contrasts',
    'follows',
    'depends',
  ]),
});

const CommitHashParam = z.object({
  hash: z.string().openapi({ description: 'Commit hash (URL-encoded)' }),
});

// ── GET /v1/commits/:hash/relations ───────────────────────

const getRelationsRoute = createRoute({
  method: 'get',
  path: '/v1/commits/{hash}/relations',
  tags: ['Relations'],
  summary: 'Get relations for a commit (read from content.relations)',
  request: { params: CommitHashParam },
  responses: {
    200: {
      description: 'Relations found',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(true),
            data: z.object({ relations: z.array(RelationSchema) }),
          }),
        },
      },
    },
    404: {
      description: 'Commit not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

relationsRoutes.openapi(getRelationsRoute, async (c) => {
  const { hash } = c.req.valid('param');
  const decodedHash = decodeURIComponent(hash);
  try {
    const db = await getDB();
    const commit = await getCommitUnified(db, decodedHash);
    if (!commit) {
      return errorResponse(c, 'COMMIT_NOT_FOUND', `Commit not found: ${decodedHash}`);
    }
    // Verify project ownership
    if (commit.project_id) {
      const accessResult = await assertProjectAccess(c, db, commit.project_id);
      if (accessResult instanceof Response) return accessResult;
    }
    const relations = commit.content?.relations ?? [];
    return c.json({ success: true as const, data: { relations } }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'GET_FAILED', message);
  }
});
