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
import type { SemanticContent, YOp } from '@t3x-dev/core';
import { collectResult, extractOpsFromEntries, runOperation, verifyReplay } from '@t3x-dev/core';
import {
  clearManualEditedFlags,
  collectYOpsForCommitRange,
  createCommit,
  getCommit,
  getYOpsForCommit,
  insertRewrite,
  isCommitSuperseded,
  listCommits,
  updateCommitPosition,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { commitOp } from '../ops/commit';
import { buildPipelineContext } from '../ops/context';
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
    trees: z.any(),
    relations: z.any().optional(),
  }),
  branch: z.string().optional(),
  parents: z.array(z.string()).optional(),
  message: z.string().optional(),
  author: AuthorSchema.optional(),
  provenance: ProvenanceSchema.optional(),
  yops_log_ids: z.array(z.string()).optional(),
  sources: z
    .array(
      z.object({
        type: z.enum(['conversation', 'import', 'leaf']),
        id: z.string(),
        title: z.string().optional(),
      })
    )
    .optional(),
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
  provenance: ProvenanceSchema.nullable(),
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

  try {
    const ctx = await buildPipelineContext(c, body.project_id);
    const commit = await collectResult(
      runOperation(commitOp, {
        project_id: body.project_id,
        // biome-ignore lint/suspicious/noExplicitAny: content schema validated by Zod
        content: body.content as any,
        branch: body.branch,
        parents: body.parents,
        message: body.message,
        author: body.author,
        provenance: body.provenance,
        yops_log_ids: body.yops_log_ids,
        sources: body.sources,
      }, ctx),
    );

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
      content: { 'application/json': { schema: SuccessResponseSchema(z.any()) } },
      description: 'Position updated',
    },
    404: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Commit not found',
    },
  },
});

commitRoutes.openapi(updatePositionRoute, async (c) => {
  // biome-ignore lint/suspicious/noExplicitAny: generic error handler
  const { hash } = c.req.valid('param') as any;
  // biome-ignore lint/suspicious/noExplicitAny: generic error handler
  const { position_x, position_y } = c.req.valid('json') as any;
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
      content: { 'application/json': { schema: SuccessResponseSchema(z.any()) } },
      description: 'History chain',
    },
    404: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Commit not found',
    },
  },
});

commitRoutes.openapi(getHistoryRoute, async (c) => {
  // biome-ignore lint/suspicious/noExplicitAny: generic error handler
  const { hash } = c.req.valid('param') as any;
  // biome-ignore lint/suspicious/noExplicitAny: generic error handler
  const { limit } = c.req.valid('query') as any;
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

// ============================================================
// GET /v1/commits/:hash/operations — Get operations that produced a commit
// ============================================================

const getCommitOperationsRoute = createRoute({
  method: 'get',
  path: '/v1/commits/{hash}/operations',
  tags: ['Commits'],
  summary: 'Get operations that produced a commit',
  request: {
    params: HashParamSchema,
  },
  responses: {
    200: {
      description: 'Commit operations',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.object({
              commit_hash: z.string(),
              operations: z.array(
                z.object({
                  id: z.string(),
                  source: z.string(),
                  turn_hash: z.string().nullable(),
                  yops: z.unknown(),
                  model: z.string().nullable(),
                  created_at: z.string(),
                })
              ),
            })
          ),
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

commitRoutes.openapi(getCommitOperationsRoute, async (c) => {
  const { hash } = c.req.valid('param');
  const db = await getDB();
  const decodedHash = decodeURIComponent(hash);

  try {
    const commit = await getCommit(db, decodedHash);
    if (!commit) {
      return errorResponse(c, 'COMMIT_NOT_FOUND', `Commit not found: ${decodedHash}`);
    }

    const operations = await getYOpsForCommit(db, commit.yops_log_ids);

    return c.json(
      {
        success: true as const,
        data: {
          commit_hash: commit.hash,
          operations: operations.map((op) => ({
            id: op.id,
            source: op.source,
            turn_hash: op.turnHash ?? null,
            yops: op.yops,
            model: op.model ?? null,
            created_at: op.createdAt.toISOString(),
          })),
        },
      },
      200
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get commit operations';
    return errorResponse(c, 'GET_FAILED', message);
  }
});

// ============================================================
// POST /v1/branches/:branch/squash — Squash consecutive commits
// ============================================================

const squashRoute = createRoute({
  method: 'post',
  path: '/v1/branches/{branch}/squash',
  tags: ['Commits'],
  summary: 'Squash consecutive commits by replaying their YOps',
  request: {
    params: z.object({ branch: z.string() }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            project_id: z.string(),
            commit_hashes: z.array(z.string()).min(2),
            message: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Squash successful',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.object({
              commit: z.unknown(),
              superseded: z.array(z.string()),
              ops_replayed: z.number(),
            })
          ),
        },
      },
    },
    400: {
      description: 'Invalid input',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    409: {
      description: 'Replay mismatch',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

commitRoutes.openapi(squashRoute, async (c) => {
  const { branch } = c.req.valid('param');
  const { project_id, commit_hashes, message } = c.req.valid('json');
  const db = await getDB();

  try {
    // 1. Fetch all commits and validate
    const commitMap = new Map<string, NonNullable<Awaited<ReturnType<typeof getCommit>>>>();
    for (const hash of commit_hashes) {
      const commit = await getCommit(db, hash);
      if (!commit) {
        return errorResponse(c, 'COMMIT_NOT_FOUND', `Commit not found: ${hash}`);
      }
      if (commit.branch !== branch) {
        return errorResponse(
          c,
          'INVALID_REQUEST',
          `Commit ${hash} is on branch '${commit.branch}', not '${branch}'`
        );
      }
      if (commit.project_id !== project_id) {
        return errorResponse(c, 'INVALID_REQUEST', `Commit ${hash} belongs to different project`);
      }
      commitMap.set(hash, commit);
    }

    // 1b. Check none are already superseded
    for (const hash of commit_hashes) {
      if (await isCommitSuperseded(db, project_id, hash)) {
        return errorResponse(
          c,
          'INVALID_REQUEST',
          `Commit ${hash} is already superseded by a previous rewrite`
        );
      }
    }

    // 2. Validate consecutive chain
    for (let i = 1; i < commit_hashes.length; i++) {
      const current = commitMap.get(commit_hashes[i])!;
      if (!current.parents.includes(commit_hashes[i - 1])) {
        return errorResponse(
          c,
          'INVALID_REQUEST',
          `Commits are not consecutive: ${commit_hashes[i]} does not have ${commit_hashes[i - 1]} as parent`
        );
      }
    }

    // 3. Find base content
    const firstCommit = commitMap.get(commit_hashes[0])!;
    let baseContent: SemanticContent = { trees: [], relations: [] };
    if (firstCommit.parents.length > 0) {
      const baseCommit = await getCommit(db, firstCommit.parents[0]);
      if (baseCommit) {
        baseContent = baseCommit.content;
      }
    }

    // 4. Collect and extract ops
    let allYopsLogIds: string[];
    try {
      allYopsLogIds = await collectYOpsForCommitRange(db, commit_hashes);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return errorResponse(c, 'INVALID_REQUEST', msg);
    }

    const yopsEntries = await getYOpsForCommit(db, allYopsLogIds);

    let ops: YOp[];
    try {
      ops = extractOpsFromEntries(yopsEntries.map((e) => ({ id: e.id, yops: e.yops })));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return errorResponse(c, 'CONFLICT', `Failed to parse YOps: ${msg}`);
    }

    // 5. Verify replay matches last commit's snapshot
    const lastCommit = commitMap.get(commit_hashes[commit_hashes.length - 1])!;
    const verification = verifyReplay(baseContent, ops, lastCommit.content);

    if (!verification.match) {
      return errorResponse(
        c,
        'CONFLICT',
        'Replayed content does not match commit snapshot — pipeline bug detected',
        verification.mismatch ?? undefined
      );
    }

    // 6. Create squashed commit
    const newCommit = await createCommit(db, {
      parents: firstCommit.parents,
      author: { type: 'human', name: 'api' },
      content: verification.replayedContent,
      project_id,
      message: message ?? `Squash ${commit_hashes.length} commits`,
      branch,
      provenance: { method: 'squash', source_commits: commit_hashes },
      yops_log_ids: allYopsLogIds,
    });

    // 7. Record rewrite
    await insertRewrite(db, {
      projectId: project_id,
      branch,
      operation: 'squash',
      sourceHashes: commit_hashes,
      resultHash: newCommit.hash,
      baseHash: firstCommit.parents[0] ?? null,
      opsReplayed: verification.opsApplied,
      yopsLogIds: allYopsLogIds,
      author: { type: 'human', name: 'api' },
    });

    return c.json(
      {
        success: true as const,
        data: {
          commit: newCommit,
          superseded: commit_hashes,
          ops_replayed: verification.opsApplied,
        },
      },
      200
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Squash failed';
    return errorResponse(c, 'INTERNAL_ERROR', msg);
  }
});
