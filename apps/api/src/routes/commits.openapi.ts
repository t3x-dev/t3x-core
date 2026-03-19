/**
 * Frame-Based Commits Routes with OpenAPI
 *
 * REST API endpoints for frame-based commits with OpenAPI documentation.
 * Frame-based commits store semantic content as frames + relations.
 *
 * Endpoints:
 * - POST   /v1/commits               - Create a new commit
 * - GET    /v1/commits/:hash         - Get commit by hash
 * - GET    /v1/projects/:projectId/commits - List commits by project
 *
 * @see packages/core/src/commit/types.ts
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  createCommit,
  getCommit,
  getCommitsByHashes,
  listCommits,
  updateCommitPosition,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import {
  ErrorResponseSchema,
  HashParamSchema,
  PaginationQuerySchema,
  SuccessResponseSchema,
} from '../schemas/common';

export const commitRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================
// Schemas
// ============================================================

const AuthorSchema = z.object({
  type: z.enum(['human', 'agent', 'system']),
  id: z.string().optional(),
  name: z.string().optional(),
});

const SourceSchema = z.object({
  type: z.enum(['conversation', 'import', 'leaf']),
  id: z.string(),
  title: z.string().optional(),
});

const ProvenanceSchema = z.object({
  method: z.enum(['llm_extraction', 'human_curation', 'import', 'merge']),
  model: z.string().optional(),
  extracted_at: z.string().optional(),
});

const CreateCommitRequestSchema = z.object({
  project_id: z.string().min(1),
  content: z.object({
    frames: z.any(),
    relations: z.any().optional(),
  }),
  branch: z.string().optional(),
  parents: z.array(z.string()).optional(),
  message: z.string().optional(),
  author: AuthorSchema,
  sources: z.array(SourceSchema).optional(),
  provenance: ProvenanceSchema.optional(),
});

const CommitResponseSchema = z.object({
  hash: z.string(),
  schema: z.string(),
  parents: z.array(z.string()),
  author: AuthorSchema,
  committed_at: z.string(),
  content: z.any(),
  project_id: z.string(),
  message: z.string().nullable(),
  branch: z.string(),
  sources: z.array(SourceSchema).nullable(),
  provenance: ProvenanceSchema.nullable(),
  position_x: z.number().optional(),
  position_y: z.number().optional(),
});

// ============================================================
// POST /v1/commits — Create a new frame-based commit
// ============================================================

const createCommitRoute = createRoute({
  method: 'post',
  path: '/v1/commits',
  tags: ['Commits'],
  summary: 'Create a new frame-based commit',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateCommitRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Commit created successfully',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.object({ commit: CommitResponseSchema })),
        },
      },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Internal server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

commitRoutes.openapi(createCommitRoute, async (c) => {
  const body = c.req.valid('json');
  const db = await getDB();

  try {
    const commit = await createCommit(db, {
      project_id: body.project_id,
      content: body.content,
      branch: body.branch,
      parents: body.parents,
      message: body.message,
      author: body.author,
      sources: body.sources,
      provenance: body.provenance,
    });

    return c.json({ success: true as const, data: { commit } }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create commit';
    return errorResponse(c, 'CREATE_FAILED', message);
  }
});

// ============================================================
// GET /v1/commits/:hash — Get commit by hash
// ============================================================

const getCommitRoute = createRoute({
  method: 'get',
  path: '/v1/commits/{hash}',
  tags: ['Commits'],
  summary: 'Get a commit by hash',
  request: {
    params: HashParamSchema,
  },
  responses: {
    200: {
      description: 'Commit found',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.object({ commit: CommitResponseSchema })),
        },
      },
    },
    404: {
      description: 'Commit not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Internal server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

commitRoutes.openapi(getCommitRoute, async (c) => {
  const { hash } = c.req.valid('param');
  const db = await getDB();

  try {
    const commit = await getCommit(db, hash);
    if (!commit) {
      return errorResponse(c, 'COMMIT_NOT_FOUND', `Commit not found: ${hash}`);
    }
    return c.json({ success: true as const, data: { commit } }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get commit';
    return errorResponse(c, 'GET_FAILED', message);
  }
});

// ============================================================
// GET /v1/projects/:projectId/commits — List commits for a project
// ============================================================

const listCommitsRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/commits',
  tags: ['Commits'],
  summary: 'List commits for a project',
  request: {
    params: z.object({
      projectId: z.string().min(1),
    }),
    query: PaginationQuerySchema.extend({
      branch: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: 'Commits listed successfully',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.object({ commits: z.array(CommitResponseSchema) })),
        },
      },
    },
    500: {
      description: 'Internal server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

commitRoutes.openapi(listCommitsRoute, async (c) => {
  const { projectId } = c.req.valid('param');
  const { branch, limit, offset } = c.req.valid('query');
  const db = await getDB();

  try {
    const commits = await listCommits(db, {
      projectId,
      branch,
      limit,
      offset,
    });

    return c.json({ success: true as const, data: { commits } }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list commits';
    return errorResponse(c, 'LIST_FAILED', message);
  }
});

// ============================================================
// PATCH /v1/commits/:hash/position — Update canvas position
// ============================================================

const updatePositionRoute = createRoute({
  method: 'patch',
  path: '/v1/commits/{hash}/position',
  request: {
    params: HashParamSchema,
    body: {
      content: {
        'application/json': {
          schema: z.object({
            position_x: z.number(),
            position_y: z.number(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: SuccessResponseSchema } },
      description: 'Position updated',
    },
    404: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Commit not found',
    },
  },
});

commitRoutes.openapi(updatePositionRoute, async (c) => {
  const { hash } = c.req.valid('param');
  const { position_x, position_y } = c.req.valid('json');
  const db = await getDB();
  const decodedHash = decodeURIComponent(hash);

  const updated = await updateCommitPosition(db, decodedHash, position_x, position_y);
  if (!updated) {
    return errorResponse(c, 'COMMIT_NOT_FOUND', `Commit ${decodedHash} not found`);
  }

  return c.json({ success: true as const, data: updated }, 200);
});

// ============================================================
// GET /v1/commits/:hash/history — Get commit ancestor chain
// ============================================================

const getHistoryRoute = createRoute({
  method: 'get',
  path: '/v1/commits/{hash}/history',
  request: {
    params: HashParamSchema,
    query: z.object({ limit: z.coerce.number().int().min(1).max(500).default(50) }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: SuccessResponseSchema } },
      description: 'History chain',
    },
    404: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Commit not found',
    },
  },
});

commitRoutes.openapi(getHistoryRoute, async (c) => {
  const { hash } = c.req.valid('param');
  const { limit } = c.req.valid('query');
  const db = await getDB();
  const decodedHash = decodeURIComponent(hash);

  const visited = new Set<string>();
  const queue = [decodedHash];
  const commits = [];

  while (queue.length > 0 && commits.length < limit) {
    const currentHash = queue.shift()!;
    if (visited.has(currentHash)) continue;
    visited.add(currentHash);

    const commit = await getCommit(db, currentHash);
    if (!commit) continue;
    commits.push(commit);

    for (const parentHash of commit.parents) {
      if (!visited.has(parentHash)) queue.push(parentHash);
    }
  }

  if (commits.length === 0) {
    return errorResponse(c, 'COMMIT_NOT_FOUND', `Commit ${decodedHash} not found`);
  }

  return c.json(
    { success: true as const, data: { commits, truncated: commits.length >= limit } },
    200
  );
});
