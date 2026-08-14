/**
 * Relations Routes
 *
 * Relations are now stored inside commit content as `content.relations`.
 * This route reads them from the commit directly.
 *
 * - GET  /v1/commits/:hash/relations — Get relations for a commit
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { assertRepositoryCommitAccess } from '../lib/project-access';
import { getRepositorySemanticCommit } from '../lib/repository-state-transition';
import { ErrorResponseSchema } from '../schemas/common';

export const relationsRoutes = new OpenAPIHono({ defaultHook: zodErrorHook });

// ── Schemas ──────────────────────────────────────────────────

const RelationSchema = z.object({
  from: z.string(),
  to: z.string(),
  // Commit content can contain schema-defined relation keys such as
  // "depends_on"; this read endpoint preserves them.
  type: z.string().regex(/^[a-z][a-z0-9_]*$/),
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
  request: {
    params: CommitHashParam,
    query: z.object({ project_id: z.string().optional() }),
  },
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
  const { project_id } = c.req.valid('query');
  const decodedHash = decodeURIComponent(hash);
  try {
    const db = await getDB();
    const projectId = await assertRepositoryCommitAccess(c, db, decodedHash, project_id);
    if (projectId instanceof Response) return projectId;

    const commit = await getRepositorySemanticCommit(db, decodedHash, projectId);
    if (!commit) {
      return errorResponse(c, 'COMMIT_NOT_FOUND', `Commit not found: ${decodedHash}`);
    }
    const relations = commit.semanticContent.relations;
    return c.json({ success: true as const, data: { relations } }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'GET_FAILED', message);
  }
});
