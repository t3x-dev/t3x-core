/**
 * Diff Routes (OpenAPI)
 *
 * POST /v1/diff/two-way - Calculate two-way structured diff
 * POST /v1/diff/three-way - Calculate three-way structured diff
 * POST /v1/diff/frame - Frame-based diff between two commits
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { collectResult, diffCommits, runOperation, type TreeDiff } from '@t3x-dev/core';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { assertRepositoryCommitAccess } from '../lib/project-access';
import { getRepositorySemanticCommit } from '../lib/repository-state-transition';
import { buildPipelineContext } from '../ops/context';
import { diffOp } from '../ops/diff';

// ============================================================================
// Schemas
// ============================================================================

const DiffSegmentSchema = z.object({
  segmentId: z.string(),
  text: z.string(),
});

const TwoWayBodySchema = z.object({
  // Mode 1: commit hash
  base_commit_hash: z.string().optional(),
  target_commit_hash: z.string().optional(),
  project_id: z.string().optional(),
  // Mode 2: turn hash
  baseTurnHash: z.string().optional(),
  targetTurnHash: z.string().optional(),
  // Mode 3: direct segments (legacy)
  baseId: z.string().optional(),
  baseSegments: z.array(DiffSegmentSchema).optional(),
  targetId: z.string().optional(),
  targetSegments: z.array(DiffSegmentSchema).optional(),
  // Common options
  threshold: z.number().optional(),
});

const ThreeWayBodySchema = z.object({
  // Mode 1: turn hash
  baseTurnHash: z.string().optional(),
  sourceTurnHash: z.string().optional(),
  targetTurnHash: z.string().optional(),
  // Mode 2: direct segments (legacy)
  baseId: z.string().optional(),
  baseSegments: z.array(DiffSegmentSchema).optional(),
  sourceId: z.string().optional(),
  sourceSegments: z.array(DiffSegmentSchema).optional(),
  targetId: z.string().optional(),
  targetSegments: z.array(DiffSegmentSchema).optional(),
  // Common options
  threshold: z.number().optional(),
});

const FrameBodySchema = z.object({
  base_commit_hash: z.string().optional(),
  target_commit_hash: z.string().optional(),
  project_id: z.string().optional(),
});

// ============================================================================
// Routes
// ============================================================================

const twoWayRoute = createRoute({
  method: 'post',
  path: '/v1/diff/two-way',
  tags: ['Diff'],
  summary: 'Calculate two-way structured diff',
  request: {
    body: {
      content: { 'application/json': { schema: TwoWayBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'Two-way diff result',
      content: {
        'application/json': { schema: z.object({ success: z.literal(true), data: z.any() }) },
      },
    },
    400: {
      description: 'Bad request',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(false),
            error: z.object({ code: z.string(), message: z.string() }),
          }),
        },
      },
    },
    403: {
      description: 'Project access denied',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(false),
            error: z.object({ code: z.string(), message: z.string() }),
          }),
        },
      },
    },
    404: {
      description: 'Not found',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(false),
            error: z.object({ code: z.string(), message: z.string() }),
          }),
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(false),
            error: z.object({ code: z.string(), message: z.string() }),
          }),
        },
      },
    },
  },
});

const threeWayRoute = createRoute({
  method: 'post',
  path: '/v1/diff/three-way',
  tags: ['Diff'],
  summary: 'Calculate three-way structured diff',
  request: {
    body: {
      content: { 'application/json': { schema: ThreeWayBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'Three-way diff result',
      content: {
        'application/json': { schema: z.object({ success: z.literal(true), data: z.any() }) },
      },
    },
    400: {
      description: 'Bad request',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(false),
            error: z.object({ code: z.string(), message: z.string() }),
          }),
        },
      },
    },
    404: {
      description: 'Not found',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(false),
            error: z.object({ code: z.string(), message: z.string() }),
          }),
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(false),
            error: z.object({ code: z.string(), message: z.string() }),
          }),
        },
      },
    },
  },
});

const frameRoute = createRoute({
  method: 'post',
  path: '/v1/diff/frame',
  tags: ['Diff'],
  summary: 'Frame-based diff between two commits',
  request: {
    body: {
      content: { 'application/json': { schema: FrameBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'Frame diff result',
      content: {
        'application/json': { schema: z.object({ success: z.literal(true), data: z.any() }) },
      },
    },
    400: {
      description: 'Bad request',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(false),
            error: z.object({ code: z.string(), message: z.string() }),
          }),
        },
      },
    },
    403: {
      description: 'Project access denied',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(false),
            error: z.object({ code: z.string(), message: z.string() }),
          }),
        },
      },
    },
    404: {
      description: 'Not found',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(false),
            error: z.object({ code: z.string(), message: z.string() }),
          }),
        },
      },
    },
  },
});

export const diffRoutes = new OpenAPIHono({ defaultHook: zodErrorHook });

// Handle JSON parse errors (invalid JSON body) and other errors
diffRoutes.onError((err, c) => {
  // Hono throws HTTPException or wraps SyntaxError for bad JSON
  const message = err.message || '';
  if (
    err instanceof SyntaxError ||
    message.includes('JSON') ||
    message.includes('json') ||
    message.includes('Unexpected token') ||
    message.includes('not valid JSON')
  ) {
    return c.json(
      { success: false as const, error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } },
      400
    );
  }
  return c.json(
    {
      success: false as const,
      error: { code: 'INTERNAL_ERROR', message: message || 'Internal server error' },
    },
    500
  );
});

/**
 * POST /v1/diff/two-way - Calculate two-way structured diff
 */
diffRoutes.openapi(twoWayRoute, async (c) => {
  const body = c.req.valid('json');

  // Mode 1: commit_hash mode (unified, fallback to V4/V3)
  if (body.base_commit_hash && body.target_commit_hash) {
    const db = await getDB();
    const baseProjectId = await assertRepositoryCommitAccess(
      c,
      db,
      body.base_commit_hash,
      body.project_id
    );
    if (baseProjectId instanceof Response) return baseProjectId;
    const targetProjectId = await assertRepositoryCommitAccess(
      c,
      db,
      body.target_commit_hash,
      body.project_id
    );
    if (targetProjectId instanceof Response) return targetProjectId;

    const baseCommit = await getRepositorySemanticCommit(db, body.base_commit_hash, baseProjectId);
    const targetCommit = await getRepositorySemanticCommit(
      db,
      body.target_commit_hash,
      targetProjectId
    );

    if (baseCommit && targetCommit) {
      const diff: TreeDiff = diffCommits(baseCommit.semanticContent, targetCommit.semanticContent);

      const commitMeta = (commit: typeof baseCommit) => ({
        digest: commit.digest,
        rationale: commit.rationale,
        actor: commit.actor,
        recorded_at: commit.recordedAt,
      });

      return c.json(
        {
          success: true as const,
          data: { diff, base: commitMeta(baseCommit), target: commitMeta(targetCommit) },
        },
        200
      );
    } else {
      if (!baseCommit) {
        return errorResponse(c, 'NOT_FOUND', `Base commit ${body.base_commit_hash} not found`);
      }
      if (!targetCommit) {
        return errorResponse(c, 'NOT_FOUND', `Target commit ${body.target_commit_hash} not found`);
      }
    }
  }
  // Removed legacy sentence/segment diff modes. Returning success with a
  // placeholder made callers believe they had a real structured diff.
  else if ((body.baseTurnHash && body.targetTurnHash) || (body.baseId && body.targetId)) {
    return errorResponse(
      c,
      'DEPRECATED',
      'Legacy turn/segment diff modes were removed. Use base_commit_hash and target_commit_hash with /v1/diff/two-way or /v1/diff/frame.'
    );
  } else {
    return errorResponse(
      c,
      'INVALID_REQUEST',
      'Provide either (base_commit_hash, target_commit_hash), (baseTurnHash, targetTurnHash), or (baseId, baseSegments, targetId, targetSegments)'
    );
  }

  return errorResponse(c, 'INVALID_REQUEST', 'Unsupported two-way diff request.');
});

/**
 * POST /v1/diff/three-way - Calculate three-way structured diff
 */
diffRoutes.openapi(threeWayRoute, async (c) => {
  const body = c.req.valid('json');

  if (
    (body.baseTurnHash && body.sourceTurnHash && body.targetTurnHash) ||
    (body.baseId && body.sourceId && body.targetId)
  ) {
    return errorResponse(
      c,
      'DEPRECATED',
      'Legacy three-way segment diff was removed. Use merge preparation for conflict resolution or commit-hash diff endpoints for version comparison.'
    );
  }

  return errorResponse(
    c,
    'INVALID_REQUEST',
    'Provide either (baseTurnHash, sourceTurnHash, targetTurnHash) or (baseId, sourceId, targetId with segments)'
  );
});

/**
 * POST /v1/diff/frame — Frame-based diff between two commits
 *
 * Delegates to diffOp via the unified pipeline.
 */
diffRoutes.openapi(frameRoute, async (c) => {
  const body = c.req.valid('json');

  if (!body.base_commit_hash || !body.target_commit_hash) {
    return errorResponse(
      c,
      'INVALID_REQUEST',
      'Both base_commit_hash and target_commit_hash are required'
    );
  }

  try {
    const db = await getDB();
    const baseProjectId = await assertRepositoryCommitAccess(
      c,
      db,
      body.base_commit_hash,
      body.project_id
    );
    if (baseProjectId instanceof Response) return baseProjectId;
    const targetProjectId = await assertRepositoryCommitAccess(
      c,
      db,
      body.target_commit_hash,
      body.project_id
    );
    if (targetProjectId instanceof Response) return targetProjectId;

    const ctx = await buildPipelineContext(c, baseProjectId);
    const result = await collectResult(
      runOperation(
        diffOp,
        {
          base_commit_hash: body.base_commit_hash,
          target_commit_hash: body.target_commit_hash,
          base_project_id: baseProjectId,
          target_project_id: targetProjectId,
        },
        ctx
      )
    );

    return c.json({ success: true as const, data: result }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('not found')) {
      return errorResponse(c, 'NOT_FOUND', message);
    }
    return errorResponse(c, 'DIFF_FAILED', message);
  }
});
