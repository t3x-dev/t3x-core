/**
 * Commits V3 Routes with OpenAPI
 *
 * GET  /v1/commits-v3 - List commits v3 (requires project_id query)
 * POST /v1/commits-v3 - Create commit v3
 * GET  /v1/commits-v3/:hash - Get commit v3 by hash
 */

import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { computeCommitV3Hash } from '@t3x-dev/core';
import {
  type CommitV3Output,
  createCommitV3,
  getCommitV3,
  listCommitsV3,
  ParentNotFoundError,
} from '@t3x-dev/storage/pglite';
import { getAuthorFromContext } from '../lib/auth';
import { getDB } from '../lib/db';
import {
  CommitV3Schema,
  CreateCommitV3Schema,
  ListCommitsV3QuerySchema,
  ListCommitsV3ResponseSchema,
} from '../schemas/commits-v3';
import { ErrorResponseSchema, HashParamSchema, SuccessResponseSchema } from '../schemas/common';

export const commitsV3Routes = new OpenAPIHono();

// ============================================================
// Response helpers
// ============================================================

/**
 * Convert storage output to API response format (snake_case)
 */
function toApiCommit(commit: CommitV3Output) {
  return {
    hash: commit.hash,
    schema: commit.schema,
    parents: commit.parents,
    author: commit.author,
    committed_at: commit.committedAt,
    content: commit.content,
    project_id: commit.projectId,
    message: commit.message,
    branch: commit.branch,
    position: commit.position,
    created_at: commit.createdAt,
    updated_at: commit.updatedAt,
  };
}

// ============================================================
// Routes
// ============================================================

// POST /v1/commits-v3 - Create commit
const createCommitV3Route = createRoute({
  method: 'post',
  path: '/v1/commits-v3',
  tags: ['Commits V3'],
  summary: 'Create a new commit v3',
  description: 'Creates a new semantic commit with sentences and optional constraints.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateCommitV3Schema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Commit created successfully',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(CommitV3Schema),
        },
      },
    },
    400: {
      description: 'Invalid request or parent not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
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

commitsV3Routes.openapi(createCommitV3Route, async (c) => {
  const body = c.req.valid('json');

  try {
    const db = await getDB();

    // Build commit data for hashing
    const author = await getAuthorFromContext(c);
    const committedAt = new Date();
    const parents = body.parents ?? [];

    const commitData = {
      schema: 'commit/v3' as const,
      parents,
      author,
      committed_at: committedAt.toISOString(),
      content: body.content,
    };

    const hash = computeCommitV3Hash(commitData);

    // Create commit in database
    const commit = await createCommitV3(db, {
      hash,
      schema: 'commit/v3',
      parents,
      author,
      committedAt,
      content: body.content,
      projectId: body.project_id,
      message: body.message,
      branch: body.branch,
      position: body.position,
    });

    return c.json({ success: true as const, data: toApiCommit(commit) }, 201);
  } catch (err) {
    if (err instanceof ParentNotFoundError) {
      return c.json(
        {
          success: false as const,
          error: {
            code: 'PARENT_NOT_FOUND',
            message: `Parent commits not found: ${err.missingParents.join(', ')}`,
          },
        },
        400
      );
    }
    // Handle PostgreSQL foreign key violation (project_id not found)
    if (err instanceof Error && 'code' in err && (err as { code: string }).code === '23503') {
      return c.json(
        {
          success: false as const,
          error: { code: 'PROJECT_NOT_FOUND', message: `Project ${body.project_id} not found` },
        },
        404
      );
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ success: false as const, error: { code: 'CREATE_FAILED', message } }, 500);
  }
});

// GET /v1/commits-v3/:hash - Get commit by hash
const getCommitV3Route = createRoute({
  method: 'get',
  path: '/v1/commits-v3/{hash}',
  tags: ['Commits V3'],
  summary: 'Get commit v3 by hash',
  description: 'Retrieves a commit by its SHA-256 hash.',
  request: {
    params: HashParamSchema,
  },
  responses: {
    200: {
      description: 'Commit found',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(CommitV3Schema),
        },
      },
    },
    404: {
      description: 'Commit not found',
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

commitsV3Routes.openapi(getCommitV3Route, async (c) => {
  const { hash } = c.req.valid('param');
  const decodedHash = decodeURIComponent(hash);

  try {
    const db = await getDB();
    const commit = await getCommitV3(db, decodedHash);

    if (!commit) {
      return c.json(
        {
          success: false as const,
          error: { code: 'NOT_FOUND', message: `Commit ${decodedHash} not found` },
        },
        404
      );
    }

    return c.json({ success: true as const, data: toApiCommit(commit) }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ success: false as const, error: { code: 'GET_FAILED', message } }, 500);
  }
});

// GET /v1/commits-v3 - List commits
const listCommitsV3Route = createRoute({
  method: 'get',
  path: '/v1/commits-v3',
  tags: ['Commits V3'],
  summary: 'List commits v3 by project',
  description: 'Lists all commits for a project, optionally filtered by branch.',
  request: {
    query: ListCommitsV3QuerySchema,
  },
  responses: {
    200: {
      description: 'List of commits',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(ListCommitsV3ResponseSchema),
        },
      },
    },
    400: {
      description: 'Invalid request',
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

commitsV3Routes.openapi(listCommitsV3Route, async (c) => {
  const { project_id: projectId, branch, limit, offset } = c.req.valid('query');

  try {
    const db = await getDB();
    const commits = await listCommitsV3(db, { projectId, branch, limit, offset });

    return c.json(
      {
        success: true as const,
        data: {
          commits: commits.map(toApiCommit),
          project_id: projectId,
          branch,
          limit,
          offset,
        },
      },
      200
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ success: false as const, error: { code: 'LIST_FAILED', message } }, 500);
  }
});
