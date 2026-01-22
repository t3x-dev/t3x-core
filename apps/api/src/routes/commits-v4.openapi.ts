/**
 * Commits V4 Routes with OpenAPI
 *
 * REST API endpoints for CommitV4 with OpenAPI documentation.
 * V4 commits store pure knowledge (sentences only, no constraints).
 * Constraints are stored in Leaves (application layer).
 *
 * Endpoints:
 * - POST   /v1/commits-v4               - Create a new commit
 * - GET    /v1/commits-v4/:hash         - Get commit by hash
 * - GET    /v1/projects/:projectId/commits-v4 - List commits by project
 * - PATCH  /v1/commits-v4/:hash/position - Update canvas position
 * - DELETE /v1/commits-v4/:hash         - Delete commit
 *
 * @see docs/specification/semantic-layer-architecture.md
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { getDB } from '../lib/db';
import {
  ErrorResponseSchema,
  HashParamSchema,
  PaginationQuerySchema,
  SuccessResponseSchema,
} from '../schemas/common';
import { CreateCommitV4Request, CommitV4Response } from '../schemas/v4-contracts';
import {
  createCommitV4,
  deleteCommitV4,
  ensureMainBranch,
  findCommitV4ByHash,
  findCommitsV4ByBranch,
  findCommitsV4ByProject,
  ParentNotFoundErrorV4,
  updateBranchHead,
  updateCommitV4Position,
} from '@t3x/storage/pglite';
import type { CommitV4 } from '@t3x/core';

export const commitsV4Routes = new OpenAPIHono();

// ============================================================
// Response helpers
// ============================================================

/**
 * Convert storage CommitV4 to API response format
 * Storage returns undefined for missing optional fields, API uses null
 */
function toApiCommit(commit: CommitV4) {
  return {
    hash: commit.hash,
    schema: commit.schema,
    parents: commit.parents,
    author: commit.author,
    committed_at: commit.committed_at,
    content: commit.content,
    project_id: commit.project_id ?? null,
    message: commit.message ?? null,
    branch: commit.branch ?? null,
    source_refs: commit.source_refs ?? null,
    position_x: commit.position_x ?? null,
    position_y: commit.position_y ?? null,
    created_at: commit.created_at ?? commit.committed_at,
  };
}

// ============================================================
// Route Definitions
// ============================================================

// POST /v1/commits-v4 - Create commit
const createCommitV4Route = createRoute({
  method: 'post',
  path: '/v1/commits-v4',
  tags: ['Commits V4'],
  summary: 'Create a new commit v4',
  description:
    'Creates a semantic commit with sentences only (no constraints). Constraints should be stored in Leaves.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateCommitV4Request,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Commit created successfully',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(CommitV4Response),
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

// GET /v1/commits-v4/:hash - Get commit by hash
const getCommitV4Route = createRoute({
  method: 'get',
  path: '/v1/commits-v4/{hash}',
  tags: ['Commits V4'],
  summary: 'Get commit by hash',
  description: 'Retrieves a commit v4 by its SHA-256 hash.',
  request: {
    params: HashParamSchema,
  },
  responses: {
    200: {
      description: 'Commit found',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(CommitV4Response),
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

// GET /v1/projects/:projectId/commits-v4 - List commits by project
const listCommitsV4ByProjectRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/commits-v4',
  tags: ['Commits V4'],
  summary: 'List commits by project',
  description: 'Lists all commits v4 in a project, ordered by committed_at descending.',
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
      description: 'List of commits',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.array(CommitV4Response)),
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

// PATCH /v1/commits-v4/:hash/position - Update canvas position
const updateCommitV4PositionRoute = createRoute({
  method: 'patch',
  path: '/v1/commits-v4/{hash}/position',
  tags: ['Commits V4'],
  summary: 'Update commit canvas position',
  description: 'Updates the canvas position (x, y coordinates) of a commit v4.',
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
      description: 'Position updated successfully',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(CommitV4Response),
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

// DELETE /v1/commits-v4/:hash - Delete commit
const deleteCommitV4Route = createRoute({
  method: 'delete',
  path: '/v1/commits-v4/{hash}',
  tags: ['Commits V4'],
  summary: 'Delete commit',
  description: 'Deletes a commit v4 by its hash.',
  request: {
    params: HashParamSchema,
  },
  responses: {
    200: {
      description: 'Commit deleted successfully',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.object({
              deleted: z.literal(true),
              hash: z.string(),
            })
          ),
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

// ============================================================
// Route Handlers
// ============================================================

// POST /v1/commits-v4 - Create commit
commitsV4Routes.openapi(createCommitV4Route, async (c) => {
  const body = c.req.valid('json');

  try {
    const db = await getDB();

    const commit = await createCommitV4(db, {
      parents: body.parents,
      author: body.author,
      sentences: body.sentences,
      project_id: body.project_id,
      message: body.message,
      branch: body.branch,
      source_refs: body.source_refs,
      position_x: body.position_x,
      position_y: body.position_y,
    });

    // Update branch HEAD to point to the new commit
    if (body.branch && body.project_id) {
      // Ensure main branch exists (idempotent)
      if (body.branch === 'main') {
        await ensureMainBranch(db, body.project_id);
      }

      const updated = await updateBranchHead(db, body.project_id, body.branch, commit.hash);

      // Warn if non-main branch doesn't exist
      if (!updated && body.branch !== 'main') {
        console.warn(
          `[commits-v4] Branch "${body.branch}" not found for project ${body.project_id}. ` +
            'HEAD not updated. Create the branch first or use "main".'
        );
      }
    }

    return c.json({ success: true as const, data: toApiCommit(commit) }, 201);
  } catch (err) {
    // Handle parent not found error
    if (err instanceof ParentNotFoundErrorV4) {
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

    // Handle PostgreSQL foreign key violation (project not found)
    if (err instanceof Error && 'code' in err && (err as { code: string }).code === '23503') {
      return c.json(
        {
          success: false as const,
          error: { code: 'PROJECT_NOT_FOUND', message: 'Referenced project not found' },
        },
        404
      );
    }

    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ success: false as const, error: { code: 'CREATE_FAILED', message } }, 500);
  }
});

// GET /v1/commits-v4/:hash - Get commit by hash
commitsV4Routes.openapi(getCommitV4Route, async (c) => {
  const { hash } = c.req.valid('param');
  const decodedHash = decodeURIComponent(hash);

  try {
    const db = await getDB();
    const commit = await findCommitV4ByHash(db, decodedHash);

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

// GET /v1/projects/:projectId/commits-v4 - List commits by project
commitsV4Routes.openapi(listCommitsV4ByProjectRoute, async (c) => {
  const { projectId } = c.req.valid('param');
  const { branch, limit, offset } = c.req.valid('query');

  try {
    const db = await getDB();

    let commits: CommitV4[];
    if (branch) {
      commits = await findCommitsV4ByBranch(db, projectId, branch, { limit, offset });
    } else {
      commits = await findCommitsV4ByProject(db, projectId, { limit, offset });
    }

    return c.json({ success: true as const, data: commits.map(toApiCommit) }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ success: false as const, error: { code: 'LIST_FAILED', message } }, 500);
  }
});

// PATCH /v1/commits-v4/:hash/position - Update canvas position
commitsV4Routes.openapi(updateCommitV4PositionRoute, async (c) => {
  const { hash } = c.req.valid('param');
  const decodedHash = decodeURIComponent(hash);
  const body = c.req.valid('json');

  try {
    const db = await getDB();
    const commit = await updateCommitV4Position(db, decodedHash, body.position_x, body.position_y);

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
    return c.json({ success: false as const, error: { code: 'UPDATE_FAILED', message } }, 500);
  }
});

// DELETE /v1/commits-v4/:hash - Delete commit
commitsV4Routes.openapi(deleteCommitV4Route, async (c) => {
  const { hash } = c.req.valid('param');
  const decodedHash = decodeURIComponent(hash);

  try {
    const db = await getDB();
    const deleted = await deleteCommitV4(db, decodedHash);

    if (!deleted) {
      return c.json(
        {
          success: false as const,
          error: { code: 'NOT_FOUND', message: `Commit ${decodedHash} not found` },
        },
        404
      );
    }

    return c.json(
      { success: true as const, data: { deleted: true as const, hash: decodedHash } },
      200
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ success: false as const, error: { code: 'DELETE_FAILED', message } }, 500);
  }
});

export default commitsV4Routes;
