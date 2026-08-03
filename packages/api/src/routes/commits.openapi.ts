/**
 * Frame-Based Commits Routes with OpenAPI
 *
 * REST API endpoints for frame-based commits with OpenAPI documentation.
 * Frame-based commits store state content as frames + relations.
 *
 * Endpoints:
 * - POST   /v1/commits               - Create a new commit
 * - GET    /v1/commits/:hash         - Get commit by hash
 * - GET    /v1/projects/:projectId/commits - List commits by project
 * - GET    /v1/projects/:projectId/commit-history - List V1/V2 history projections
 *
 * @see packages/core/src/commit/types.ts
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Commit, SemanticContent, YOp } from '@t3x-dev/core';
import { extractOpsFromEntries, validateTree, verifyReplay } from '@t3x-dev/core';
import {
  collectYOpsForCommitRange,
  createCommit,
  ensureMainBranch,
  findConversationById,
  getCommit,
  getTransitionViewForCommit,
  getYOpsForCommit,
  insertRewrite,
  isCommitSuperseded,
  listCommitHistory,
  listCommits,
  markConversationCommitted,
  TransitionHeadConflictError,
  TransitionProjectionAuthorizationInvalidError,
  updateCommitMessage,
  updateCommitPosition,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { assertProjectAccess, getUserId } from '../lib/project-access';
import {
  commitRepositoryYOpsState,
  createRepositoryYOpsStateFromSemanticContent,
  RepositoryStateDomainUnsupportedError,
} from '../lib/repository-state-transition';
import { findUncommittedYOpsIds, mapSupersededError } from '../lib/yops-commit-link';
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

const _SourceSchema = z.object({
  type: z.enum(['conversation', 'import', 'leaf']),
  id: z.string(),
  title: z.string().optional(),
});

const ProvenanceSchema = z.object({
  method: z.enum(['llm_extraction', 'human_curation', 'import', 'merge']),
  model: z.string().optional(),
  extracted_at: z.string().optional(),
  schema_ref: z
    .object({
      name: z.string().min(1),
      version: z.string().optional(),
      hash: z.string().optional(),
    })
    .optional(),
});

const CreateCommitRequestSchema = z.object({
  project_id: z.string().min(1),
  source_conversation_id: z.string().optional(),
  content: z.object({
    trees: z.any(),
    relations: z.any().optional(),
  }),
  branch: z.string().optional(),
  expected_head: z.string().nullable(),
  message: z.string().optional(),
});

type TxRunner = { transaction: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown> };

class SourceConversationAlreadyCommittedError extends Error {
  constructor(readonly conversationId: string) {
    super(`Conversation ${conversationId} has already been committed`);
    this.name = 'SourceConversationAlreadyCommittedError';
  }
}

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

const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const CommitDescriptorSchema = z.object({
  kind: z.literal('commit'),
  schema: z.literal('t3x/commit/v2'),
  digest: DigestSchema,
});
const CommitV2ObjectSchema = z.object({
  schema: z.literal('t3x/commit/v2'),
  parents: z.array(CommitDescriptorSchema),
  decision: z.object({
    kind: z.literal('statement'),
    schema: z.literal('t3x/statement/v1'),
    digest: DigestSchema,
  }),
  result: z.object({
    kind: z.literal('state'),
    schema: z.literal('t3x/state/v1'),
    digest: DigestSchema,
  }),
});
const CreatedCommitV2ResponseSchema = z.object({
  digest: DigestSchema,
  ref_name: z.string(),
  object: CommitV2ObjectSchema,
});

const DescriptorBaseSchema = z.object({
  digest: z.string(),
});

const CommitHistoryProjectionSchema = z.discriminatedUnion('format', [
  z.object({
    format: z.literal('legacy_v1'),
    id: z.string(),
    schema: z.enum(['t3x/commit', 't3x/commit/1']),
    parents: z.array(z.string()),
    recordedAt: z.string(),
    result: z.object({ mode: z.literal('legacy_content'), content: z.any() }),
    assurance: z.object({
      mode: z.literal('legacy_unavailable'),
      unavailable: z.array(z.enum(['proposal', 'evidence', 'replay', 'validation', 'decision'])),
    }),
  }),
  z.object({
    format: z.literal('transition_v2'),
    id: z.string(),
    schema: z.literal('t3x/commit/v2'),
    parents: z.array(z.string()),
    recordedAt: z.string(),
    result: z.object({
      mode: z.literal('state_descriptor'),
      descriptor: DescriptorBaseSchema.extend({
        kind: z.literal('state'),
        schema: z.literal('t3x/state/v1'),
      }),
    }),
    assurance: z.object({
      mode: z.literal('decision_bound'),
      decision: DescriptorBaseSchema.extend({
        kind: z.literal('statement'),
        schema: z.literal('t3x/statement/v1'),
      }),
    }),
  }),
]);

// ============================================================
// POST /v1/commits — Commit an exact structured State through Transition
// ============================================================

const createCommitRoute = createRoute({
  method: 'post',
  path: '/v1/commits',
  tags: ['Commits'],
  summary: 'Commit structured repository state',
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
      description: 'CommitV2 created successfully',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.object({ commit: CreatedCommitV2ResponseSchema })),
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
    const db = await getDB();
    const access = await assertProjectAccess(c, db, body.project_id);
    if (access instanceof Response) return access;
    const sourceConversationId = body.source_conversation_id;
    let yopsLogIds: string[] = [];
    let inheritedParentHash: string | null = null;
    if (sourceConversationId) {
      const sourceConversation = await findConversationById(db, sourceConversationId);
      if (!sourceConversation) {
        return errorResponse(c, 'NOT_FOUND', `Conversation ${sourceConversationId} not found`);
      }
      if (sourceConversation.projectId !== body.project_id) {
        return errorResponse(
          c,
          'INVALID_REQUEST',
          'source_conversation_id does not belong to the specified project'
        );
      }
      if (sourceConversation.committedAs) {
        return errorResponse(
          c,
          'ALREADY_COMMITTED',
          `Conversation ${sourceConversationId} has already been committed`
        );
      }
      inheritedParentHash = sourceConversation.parentCommitHash;
      yopsLogIds = await findUncommittedYOpsIds(db, sourceConversationId, body.project_id);
    }
    const targetBranch = body.branch ?? 'main';
    if (targetBranch === 'main') await ensureMainBranch(db, body.project_id);
    const expectedHead = body.expected_head;
    if (inheritedParentHash !== null && inheritedParentHash !== expectedHead) {
      return errorResponse(
        c,
        'BRANCH_NOT_HEAD',
        'The source conversation parent does not match the target ref head'
      );
    }
    const content = {
      trees: Array.isArray(body.content.trees) ? body.content.trees : [],
      relations: Array.isArray(body.content.relations) ? body.content.relations : [],
    } as SemanticContent;
    const validation = validateTree(content);
    if (!validation.valid) {
      return errorResponse(
        c,
        'VALIDATION_FAILED',
        validation.warnings
          .filter((warning) => warning.severity === 'error')
          .map((warning) => `${warning.rule}: ${warning.message}`)
          .join('; ')
      );
    }
    const target = createRepositoryYOpsStateFromSemanticContent(content);
    const userId = getUserId(c);
    let created: Awaited<ReturnType<typeof commitRepositoryYOpsState>> | undefined;
    await (db as unknown as TxRunner).transaction(async (rawTx) => {
      const tx = rawTx as typeof db;
      created = await commitRepositoryYOpsState({
        db: tx,
        projectId: body.project_id,
        refName: targetBranch,
        expectedHead,
        target,
        actor: {
          kind: 'human',
          id: userId ? `user:${userId}` : 'human:local-user',
        },
        ...(body.message?.trim() ? { intent: body.message.trim() } : {}),
        ...(yopsLogIds.length === 0 ? {} : { yopsLogIds }),
      });
      if (sourceConversationId) {
        const marked = await markConversationCommitted(tx, sourceConversationId, created.commitDigest);
        if (!marked) throw new SourceConversationAlreadyCommittedError(sourceConversationId);
      }
    });
    if (created === undefined) throw new Error('CommitV2 transaction did not return a commit');

    return c.json(
      {
        success: true as const,
        data: {
          commit: {
            digest: created.commitDigest,
            ref_name: targetBranch,
            object: created.commit,
          },
        },
      },
      200
    );
  } catch (err) {
    if (err instanceof SourceConversationAlreadyCommittedError) {
      return errorResponse(c, 'ALREADY_COMMITTED', err.message);
    }
    if (err instanceof TransitionHeadConflictError) {
      return errorResponse(c, 'BRANCH_NOT_HEAD', err.message);
    }
    if (err instanceof RepositoryStateDomainUnsupportedError) {
      return errorResponse(c, 'SEMANTIC_NOT_SUPPORTED', err.message);
    }
    // Suggestion-vs-baseline: surface concurrent-supersede races as
    // 409 retryable conflict, not opaque 500. Same boundary as the
    // draft / autopilot / drafts-workflow commit routes.
    const conflict = mapSupersededError(c, err);
    if (conflict) return conflict;
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
    if (commit.project_id) {
      const accessResult = await assertProjectAccess(c, db, commit.project_id);
      if (accessResult instanceof Response) return accessResult;
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
    const accessResult = await assertProjectAccess(c, db, projectId);
    if (accessResult instanceof Response) return accessResult;

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
// GET /v1/projects/:projectId/commit-history — Mixed V1/V2 read projection
// ============================================================

const listCommitHistoryRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/commit-history',
  tags: ['Commits'],
  summary: 'List discriminated CommitV1 and CommitV2 history projections',
  request: {
    params: z.object({ projectId: z.string().min(1) }),
    query: PaginationQuerySchema,
  },
  responses: {
    200: {
      description: 'Mixed commit history listed successfully',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.object({ history: z.array(CommitHistoryProjectionSchema) })
          ),
        },
      },
    },
    500: {
      description: 'Internal server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

commitRoutes.openapi(listCommitHistoryRoute, async (c) => {
  const { projectId } = c.req.valid('param');
  const { limit, offset } = c.req.valid('query');
  const db = await getDB();
  try {
    const accessResult = await assertProjectAccess(c, db, projectId);
    if (accessResult instanceof Response) return accessResult;
    const history = await listCommitHistory(db, projectId, { limit, offset });
    return c.json({ success: true as const, data: { history } }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list commit history';
    return errorResponse(c, 'LIST_FAILED', message);
  }
});

// ============================================================
// GET /v1/projects/:projectId/commits/:commitId/transition-view
// ============================================================

const getTransitionViewRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/commits/{commitId}/transition-view',
  tags: ['Commits'],
  summary: 'Resolve a verified task-oriented Transition view for one commit',
  request: {
    params: z.object({
      projectId: z.string().min(1),
      commitId: z.string().min(1),
    }),
    query: z.object({ ref: z.string().min(1) }),
  },
  responses: {
    200: {
      description: 'Server-derived TransitionViewV1',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.object({
              transition: z
                .unknown()
                .openapi({ description: 'Shared @t3x-dev/core TransitionViewV1 contract' }),
            })
          ),
        },
      },
    },
    404: {
      description: 'Commit not found in the project',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    409: {
      description: 'Stored Transition graph or authorization facts do not verify',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Internal server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

commitRoutes.openapi(getTransitionViewRoute, async (c) => {
  const { projectId, commitId } = c.req.valid('param');
  const { ref } = c.req.valid('query');
  const db = await getDB();

  try {
    const accessResult = await assertProjectAccess(c, db, projectId);
    if (accessResult instanceof Response) return accessResult;
    const transition = await getTransitionViewForCommit(db, {
      projectId,
      refName: ref,
      commitId: decodeURIComponent(commitId),
    });
    if (transition === null) {
      return errorResponse(c, 'COMMIT_NOT_FOUND', `Commit ${commitId} not found`);
    }
    return c.json({ success: true as const, data: { transition } }, 200);
  } catch (err) {
    if (
      err instanceof TransitionProjectionAuthorizationInvalidError ||
      (typeof err === 'object' && err !== null && 'code' in err)
    ) {
      return errorResponse(
        c,
        'TRANSITION_VIEW_UNAVAILABLE',
        'The stored Transition graph or its repository authorization did not verify'
      );
    }
    const message = err instanceof Error ? err.message : 'Failed to resolve Transition view';
    return errorResponse(c, 'GET_FAILED', message);
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
// PATCH /v1/commits/:hash/message — Update commit message
// ============================================================

const updateMessageRoute = createRoute({
  method: 'patch',
  path: '/v1/commits/{hash}/message',
  request: {
    params: HashParamSchema,
    body: {
      content: {
        'application/json': {
          schema: z.object({
            message: z.string().min(1).max(200),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: SuccessResponseSchema(z.any()) } },
      description: 'Message updated',
    },
    404: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Commit not found',
    },
  },
});

commitRoutes.openapi(updateMessageRoute, async (c) => {
  // biome-ignore lint/suspicious/noExplicitAny: generic error handler
  const { hash } = c.req.valid('param') as any;
  // biome-ignore lint/suspicious/noExplicitAny: generic error handler
  const { message } = c.req.valid('json') as any;
  const db = await getDB();
  const decodedHash = decodeURIComponent(hash);

  const updated = await updateCommitMessage(db, decodedHash, message);
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
  const queued = new Set(queue);
  const commits = [];

  while (queue.length > 0 && commits.length < limit) {
    const currentHash = queue.shift()!;
    if (visited.has(currentHash)) continue;
    visited.add(currentHash);

    const commit = await getCommit(db, currentHash);
    if (!commit) continue;
    commits.push(commit);

    for (const parentHash of commit.parents) {
      if (!visited.has(parentHash) && !queued.has(parentHash)) {
        queued.add(parentHash);
        queue.push(parentHash);
      }
    }
  }

  if (commits.length === 0) {
    return errorResponse(c, 'COMMIT_NOT_FOUND', `Commit ${decodedHash} not found`);
  }

  return c.json({ success: true as const, data: { commits, truncated: queue.length > 0 } }, 200);
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
