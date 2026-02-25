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
 * - GET    /v1/commits-v4/:hash/history - Get commit ancestor chain
 * - DELETE /v1/commits-v4/:hash         - Delete commit
 *
 * @see docs/specification/semantic-layer-architecture.md
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { CommitV4, Sentence } from '@t3x/core';
import {
  createCommitV4,
  deleteCommitV4,
  ensureMainBranch,
  findCommitsV4ByBranch,
  findCommitsV4ByProject,
  findCommitV4ByHash,
  findCommitV4History,
  getCommitsV4ByHashes,
  MainBranchLinearityError,
  ParentNotFoundErrorV4,
  updateBranchHead,
  updateCommitV4Position,
  validateMainBranchLinearity,
} from '@t3x/storage/pglite';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { webhookDispatcher } from '../lib/webhook-dispatcher';
import {
  ErrorResponseSchema,
  HashParamSchema,
  PaginationQuerySchema,
  SuccessResponseSchema,
} from '../schemas/common';
import { CommitV4Response, CreateCommitV4Request } from '../schemas/v4-contracts';

export const commitsV4Routes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

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
  description: `Creates a semantic commit with sentences only (no constraints).

**V4 Schema Requirements:**
- \`sentences\`: Required, non-empty array of sentence objects
- \`author\`: Required, must have \`type\` ('human' or 'agent')
- \`project_id\`: Required

**V4 Restrictions:**
- \`constraints\`: NOT allowed at commit level (use POST /v1/leaves instead)
- \`turn_window\`, \`facet_snapshot\`: V3 fields, not allowed
- If \`schema\` is provided, must be 't3x/commit/v4'

**Error Codes:**
- \`COMMIT_VERSION_UNSUPPORTED\`: V3 payload or non-V4 schema detected
- \`INVALID_REQUEST\`: Missing required fields or constraints at commit level
- \`PARENT_NOT_FOUND\`: Referenced parent commit does not exist
- \`PROJECT_NOT_FOUND\`: Referenced project does not exist`,
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
      description:
        'Invalid request. Possible error codes: COMMIT_VERSION_UNSUPPORTED (V3 payload), INVALID_REQUEST (missing fields or constraints at commit level), PARENT_NOT_FOUND',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    409: {
      description: 'Conflict: main branch linearity violation (MAIN_ROOT_EXISTS, MAIN_NOT_HEAD)',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    404: {
      description: 'Project not found (PROJECT_NOT_FOUND)',
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

// GET /v1/commits-v4/:hash/history - Get commit ancestor chain
const getCommitV4HistoryRoute = createRoute({
  method: 'get',
  path: '/v1/commits-v4/{hash}/history',
  tags: ['Commits V4'],
  summary: 'Get commit history (ancestor chain)',
  description:
    'Walks the parent chain from the given commit via BFS traversal. ' +
    'Returns an ordered list of ancestor commits (including the starting commit).',
  request: {
    params: HashParamSchema,
    query: z.object({
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }),
  },
  responses: {
    200: {
      description: 'Commit history',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.array(CommitV4Response)),
        },
      },
    },
    404: {
      description: 'Starting commit not found',
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

  // ============================================================
  // V4-only validation: check for unexpected fields in raw body
  // ============================================================
  const rawBody = body as Record<string, unknown>;

  // Rule 1: If schema field provided, must be t3x/commit/v4
  if (rawBody.schema && rawBody.schema !== 't3x/commit/v4') {
    return errorResponse(
      c,
      'COMMIT_VERSION_UNSUPPORTED',
      `Only V4 commits supported on this endpoint. Received schema: ${rawBody.schema}. ` +
        'Use /v1/commits-v3 for legacy commits.'
    );
  }

  // Rule 2: Reject V3-specific fields (turn_window, facet_snapshot)
  if (rawBody.turn_window || rawBody.facet_snapshot) {
    return errorResponse(
      c,
      'COMMIT_VERSION_UNSUPPORTED',
      'V4 commits do not support turn_window or facet_snapshot. ' +
        'These are V3 fields. Use sentences array instead.'
    );
  }

  // Rule 3: Reject constraints at commit level (V4 stores constraints in Leaves)
  const rawContent = rawBody.content as Record<string, unknown> | undefined;
  if (rawBody.constraints || rawContent?.constraints) {
    return errorResponse(
      c,
      'INVALID_REQUEST',
      'V4 commits do not support constraints at the commit level. ' +
        'Constraints should be stored in Leaves (POST /v1/leaves). ' +
        'See docs/specification/semantic-layer-architecture.md for V4 design.'
    );
  }

  try {
    const db = await getDB();

    // Validate main branch linearity before creating commit
    if (body.branch) {
      await validateMainBranchLinearity(db, body.project_id, body.branch, body.parents ?? []);
    }

    // ============================================================
    // Parent sentence inheritance
    // ============================================================
    // When inherit_parent_sentences is true (default), merge parent sentences
    // with new sentences. New sentences with the same text take precedence.

    // [C2] Strip inherited_from from user-supplied sentences to prevent forgery
    const sanitizedSentences: Sentence[] = body.sentences.map(
      ({ inherited_from: _, ...rest }) => rest
    );

    let finalSentences: Sentence[] = sanitizedSentences;

    const shouldInherit = body.inherit_parent_sentences !== false;
    const parents = body.parents ?? [];

    if (shouldInherit && parents.length > 0) {
      // Fetch all parent commits
      const parentCommits = await getCommitsV4ByHashes(db, parents);

      // [M1] Validate all parents were found to prevent silent sentence loss
      if (parentCommits.length !== parents.length) {
        const foundHashes = new Set(parentCommits.map((c) => c.hash));
        const missing = parents.filter((h) => !foundHashes.has(h));
        return errorResponse(
          c,
          'PARENT_NOT_FOUND',
          `Parent commits not found for inheritance: ${missing.join(', ')}`
        );
      }

      // Collect inherited sentences from all parents
      const inheritedSentences: Sentence[] = [];
      for (const parent of parentCommits) {
        for (const sentence of parent.content.sentences) {
          // [C1] Use ?? (nullish coalescing) to preserve empty-string inherited_from
          const inheritedFrom = sentence.inherited_from ?? parent.hash;
          inheritedSentences.push({
            ...sentence,
            inherited_from: inheritedFrom,
          });
        }
      }

      // Build set of new sentence texts for deduplication
      const newTexts = new Set(sanitizedSentences.map((s) => s.text));

      // Merge: new sentences override inherited ones (by text)
      // Also deduplicate inherited sentences by text (first parent wins)
      const seenInheritedTexts = new Set<string>();
      const deduplicatedInherited: Sentence[] = [];
      for (const inherited of inheritedSentences) {
        if (!newTexts.has(inherited.text) && !seenInheritedTexts.has(inherited.text)) {
          seenInheritedTexts.add(inherited.text);
          deduplicatedInherited.push(inherited);
        }
      }

      // [M3] Deduplicate by ID — if an inherited sentence has the same ID as a new one,
      // keep the new one (it's already in sanitizedSentences)
      const newIds = new Set(sanitizedSentences.map((s) => s.id));
      const idSafeInherited = deduplicatedInherited.filter((s) => !newIds.has(s.id));

      // Final sentences = new sentences + inherited (deduplicated by text and ID)
      finalSentences = [...sanitizedSentences, ...idSafeInherited];
    }

    const commit = await createCommitV4(db, {
      parents: body.parents,
      author: body.author,
      sentences: finalSentences,
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

    // Fire webhook event (fire-and-forget)
    webhookDispatcher.dispatch('commit.created', {
      commit_hash: commit.hash,
      project_id: body.project_id,
      branch: body.branch,
      message: body.message,
      sentence_count: finalSentences.length,
    }, body.project_id);

    return c.json({ success: true as const, data: toApiCommit(commit) }, 201);
  } catch (err) {
    // Handle main branch linearity violation
    if (err instanceof MainBranchLinearityError) {
      return errorResponse(c, err.code, err.message);
    }

    // Handle parent not found error
    if (err instanceof ParentNotFoundErrorV4) {
      return errorResponse(
        c,
        'PARENT_NOT_FOUND',
        `Parent commits not found: ${err.missingParents.join(', ')}`
      );
    }

    // Handle PostgreSQL foreign key violation (project not found)
    if (err instanceof Error && 'code' in err && (err as { code: string }).code === '23503') {
      return errorResponse(c, 'PROJECT_NOT_FOUND', 'Referenced project not found');
    }

    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'CREATE_FAILED', message);
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
      return errorResponse(c, 'COMMIT_NOT_FOUND', `Commit not found: ${decodedHash}`);
    }

    return c.json({ success: true as const, data: toApiCommit(commit) }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'GET_FAILED', message);
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
    return errorResponse(c, 'LIST_FAILED', message);
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
      return errorResponse(c, 'COMMIT_NOT_FOUND', `Commit not found: ${decodedHash}`);
    }

    return c.json({ success: true as const, data: toApiCommit(commit) }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'UPDATE_FAILED', message);
  }
});

// GET /v1/commits-v4/:hash/history - Get commit ancestor chain
commitsV4Routes.openapi(getCommitV4HistoryRoute, async (c) => {
  const { hash } = c.req.valid('param');
  const decodedHash = decodeURIComponent(hash);
  const { limit } = c.req.valid('query');

  try {
    const db = await getDB();
    const history = await findCommitV4History(db, decodedHash, limit);

    if (history.length === 0) {
      return errorResponse(c, 'COMMIT_NOT_FOUND', `Commit not found: ${decodedHash}`);
    }

    return c.json({ success: true as const, data: history.map(toApiCommit) }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'HISTORY_FAILED', message);
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
      return errorResponse(c, 'COMMIT_NOT_FOUND', `Commit not found: ${decodedHash}`);
    }

    return c.json(
      { success: true as const, data: { deleted: true as const, hash: decodedHash } },
      200
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'DELETE_FAILED', message);
  }
});

export default commitsV4Routes;
