/**
 * Diff Routes (OpenAPI)
 *
 * POST /v1/diff/two-way - Calculate two-way semantic diff
 * POST /v1/diff/three-way - Calculate three-way semantic diff
 * POST /v1/diff/frame - Frame-based diff between two commits
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  collectResult,
  createCachedEmbeddingProvider,
  createGoogleAIEmbeddingProvider,
  diffCommits,
  EmbeddingProviderError,
  runOperation,
  type TreeDiff,
} from '@t3x-dev/core';
import { findSegmentEmbeddingsByTurn, findTurnByHash, getCommitUnified } from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { buildPipelineContext } from '../ops/context';
import { diffOp } from '../ops/diff';

// ============================================================================
// Types
// ============================================================================

type DBType = Awaited<ReturnType<typeof getDB>>;

/** Local segment type for legacy node-level diffs */
interface DiffSegment {
  segmentId: string;
  text: string;
}

type ExtractResult =
  | { ok: true; id: string; segments: DiffSegment[] }
  | { ok: false; error: 'not_found' | 'no_rings' | 'corrupted'; message: string };

// ============================================================================
// Helpers
// ============================================================================

/**
 * Extract segments from turn — tries Ring 3 first, falls back to text splitting.
 *
 * Strategy 1: Ring 3 segments (legacy path, when rings_json exists)
 * Strategy 2: Punctuation-based text splitting (when Ring data unavailable)
 */
async function extractSegmentsFromTurn(db: DBType, turnHash: string): Promise<ExtractResult> {
  const turn = await findTurnByHash(db, turnHash);
  if (!turn) {
    return { ok: false, error: 'not_found', message: `Turn ${turnHash} not found` };
  }

  // Strategy 1: Ring 3 segments (legacy data that may still exist in DB)
  if (turn.ringsJson) {
    try {
      const rings = JSON.parse(turn.ringsJson) as {
        ring3?: { segments?: Array<{ segmentId: string; text: string }> };
      };
      if (rings.ring3 && Array.isArray(rings.ring3.segments) && rings.ring3.segments.length > 0) {
        const segments: DiffSegment[] = rings.ring3.segments.map((seg) => ({
          segmentId: seg.segmentId,
          text: seg.text,
        }));
        return { ok: true, id: turnHash, segments };
      }
    } catch {
      // Fall through to text splitting
    }
  }

  // Strategy 2: Punctuation-based text splitting
  if (turn.content) {
    const segments = turn.content
      .split(/(?<=[.!?。！？])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (segments.length > 0) {
      return {
        ok: true,
        id: turnHash,
        segments: segments.map((text, i) => ({
          segmentId: `s_fallback_${i}`,
          text,
        })),
      };
    }
  }

  return { ok: false, error: 'no_rings', message: `Turn ${turnHash} has no extractable content` };
}

function getErrorStatus(error: 'not_found' | 'no_rings' | 'corrupted'): 400 | 404 | 500 {
  if (error === 'corrupted') return 500;
  if (error === 'not_found') return 404;
  return 400;
}

function getErrorCode(error: 'not_found' | 'no_rings' | 'corrupted'): string {
  if (error === 'corrupted') return 'DATA_CORRUPTED';
  if (error === 'no_rings') return 'NO_RINGS';
  return 'NOT_FOUND';
}

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
});

// ============================================================================
// Routes
// ============================================================================

const twoWayRoute = createRoute({
  method: 'post',
  path: '/v1/diff/two-way',
  tags: ['Diff'],
  summary: 'Calculate two-way semantic diff',
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
  summary: 'Calculate three-way semantic diff',
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
 * POST /v1/diff/two-way - Calculate two-way semantic diff
 */
diffRoutes.openapi(twoWayRoute, async (c) => {
  const body = c.req.valid('json');

  const _threshold = body.threshold ?? 0.7;
  let baseId = '';
  let baseSegments: DiffSegment[] = [];
  let targetId = '';
  let targetSegments: DiffSegment[] = [];
  let usedCache = false;
  let baseTurnHashForCache: string | undefined;
  let targetTurnHashForCache: string | undefined;

  const db = await getDB();

  // Mode 1: commit_hash mode (unified, fallback to V4/V3)
  if (body.base_commit_hash && body.target_commit_hash) {
    const baseCommit = await getCommitUnified(db, body.base_commit_hash);
    const targetCommit = await getCommitUnified(db, body.target_commit_hash);

    if (baseCommit && targetCommit) {
      const diff: TreeDiff = diffCommits(baseCommit.content, targetCommit.content);

      const commitMeta = (commit: typeof baseCommit) => ({
        hash: commit.hash,
        message: commit.message ?? null,
        author: commit.author,
        committed_at: commit.committed_at,
        branch: commit.branch,
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
  // Mode 2: turn_hash mode
  else if (body.baseTurnHash && body.targetTurnHash) {
    const baseResult = await extractSegmentsFromTurn(db, body.baseTurnHash);
    const targetResult = await extractSegmentsFromTurn(db, body.targetTurnHash);

    if (!baseResult.ok) {
      const code = getErrorCode(baseResult.error);
      const status = getErrorStatus(baseResult.error);
      return c.json(
        { success: false as const, error: { code, message: baseResult.message } },
        status
      );
    }
    if (!targetResult.ok) {
      const code = getErrorCode(targetResult.error);
      const status = getErrorStatus(targetResult.error);
      return c.json(
        { success: false as const, error: { code, message: targetResult.message } },
        status
      );
    }

    baseId = baseResult.id;
    baseSegments = baseResult.segments;
    targetId = targetResult.id;
    targetSegments = targetResult.segments;
    baseTurnHashForCache = body.baseTurnHash;
    targetTurnHashForCache = body.targetTurnHash;
    usedCache = true;
  }
  // Mode 3: direct segments (legacy)
  else if (body.baseId && body.targetId) {
    baseId = body.baseId;
    baseSegments = body.baseSegments ?? [];
    targetId = body.targetId;
    targetSegments = body.targetSegments ?? [];
  } else {
    return errorResponse(
      c,
      'INVALID_REQUEST',
      'Provide either (base_commit_hash, target_commit_hash), (baseTurnHash, targetTurnHash), or (baseId, baseSegments, targetId, targetSegments)'
    );
  }

  // Check API key
  const googleApiKey = process.env.GOOGLE_AI_STUDIO_KEY;
  if (!googleApiKey) {
    return c.json(
      {
        success: false as const,
        error: { code: 'EMBEDDING_UNAVAILABLE', message: 'GOOGLE_AI_STUDIO_KEY not configured' },
      },
      500
    );
  }

  try {
    // Create base provider
    const baseProvider = createGoogleAIEmbeddingProvider({
      apiKey: googleApiKey,
    });

    // Wrap with cached provider if using turn_hash mode
    let _embeddingProvider;
    let cacheStats = null;

    if (usedCache && baseTurnHashForCache && targetTurnHashForCache) {
      const cachedProvider = createCachedEmbeddingProvider(baseProvider);

      // Load cached embeddings
      const baseEmbeddings = await findSegmentEmbeddingsByTurn(db, baseTurnHashForCache);
      const targetEmbeddings = await findSegmentEmbeddingsByTurn(db, targetTurnHashForCache);

      const loaded = cachedProvider.setCacheFromRecords([...baseEmbeddings, ...targetEmbeddings]);

      _embeddingProvider = cachedProvider;
      cacheStats = { preloaded: loaded, ...cachedProvider.getCacheStats() };
    } else {
      _embeddingProvider = baseProvider;
    }

    // Legacy node-level diff removed — use /v1/diff/frame endpoint instead
    return c.json(
      {
        success: true as const,
        data: {
          baseId,
          targetId,
          baseCount: baseSegments.length,
          targetCount: targetSegments.length,
          method: 'placeholder',
          usedCache,
          cacheStats,
        },
      },
      200
    );
  } catch (error) {
    if (error instanceof EmbeddingProviderError) {
      return c.json(
        {
          success: false as const,
          error: { code: 'EMBEDDING_UNAVAILABLE', message: (error as Error).message },
        },
        500
      );
    }
    return c.json(
      {
        success: false as const,
        error: { code: 'DIFF_FAILED', message: (error as Error).message },
      },
      500
    );
  }
});

/**
 * POST /v1/diff/three-way - Calculate three-way semantic diff
 */
diffRoutes.openapi(threeWayRoute, async (c) => {
  const body = c.req.valid('json');

  const _threshold = body.threshold ?? 0.7;
  let baseId: string;
  let _baseSegments: DiffSegment[];
  let sourceId: string;
  let _sourceSegments: DiffSegment[];
  let targetId: string;
  let _targetSegments: DiffSegment[];
  let usedCache = false;

  const db = await getDB();

  // Mode 1: turn_hash mode
  if (body.baseTurnHash && body.sourceTurnHash && body.targetTurnHash) {
    const baseResult = await extractSegmentsFromTurn(db, body.baseTurnHash);
    const sourceResult = await extractSegmentsFromTurn(db, body.sourceTurnHash);
    const targetResult = await extractSegmentsFromTurn(db, body.targetTurnHash);

    for (const [name, result] of [
      ['base', baseResult],
      ['source', sourceResult],
      ['target', targetResult],
    ] as const) {
      if (!result.ok) {
        const code = getErrorCode(result.error);
        const status = getErrorStatus(result.error);
        return c.json(
          { success: false as const, error: { code, message: `${name}: ${result.message}` } },
          status
        );
      }
    }

    baseId = (baseResult as { ok: true; id: string; segments: DiffSegment[] }).id;
    _baseSegments = (baseResult as { ok: true; id: string; segments: DiffSegment[] }).segments;
    sourceId = (sourceResult as { ok: true; id: string; segments: DiffSegment[] }).id;
    _sourceSegments = (sourceResult as { ok: true; id: string; segments: DiffSegment[] }).segments;
    targetId = (targetResult as { ok: true; id: string; segments: DiffSegment[] }).id;
    _targetSegments = (targetResult as { ok: true; id: string; segments: DiffSegment[] }).segments;
    usedCache = true;
  }
  // Mode 2: direct segments (legacy)
  else if (body.baseId && body.sourceId && body.targetId) {
    baseId = body.baseId;
    _baseSegments = body.baseSegments ?? [];
    sourceId = body.sourceId;
    _sourceSegments = body.sourceSegments ?? [];
    targetId = body.targetId;
    _targetSegments = body.targetSegments ?? [];
  } else {
    return errorResponse(
      c,
      'INVALID_REQUEST',
      'Provide either (baseTurnHash, sourceTurnHash, targetTurnHash) or (baseId, sourceId, targetId with segments)'
    );
  }

  // Check API key
  const googleApiKey = process.env.GOOGLE_AI_STUDIO_KEY;
  if (!googleApiKey) {
    return c.json(
      {
        success: false as const,
        error: { code: 'EMBEDDING_UNAVAILABLE', message: 'GOOGLE_AI_STUDIO_KEY not configured' },
      },
      500
    );
  }

  try {
    // Create base provider
    const baseProvider = createGoogleAIEmbeddingProvider({
      apiKey: googleApiKey,
    });

    // Wrap with cached provider if using turn_hash mode
    let _embeddingProvider;
    let cacheStats = null;

    if (usedCache && body.baseTurnHash && body.sourceTurnHash && body.targetTurnHash) {
      const cachedProvider = createCachedEmbeddingProvider(baseProvider);

      // Load cached embeddings
      const baseEmbeddings = await findSegmentEmbeddingsByTurn(db, body.baseTurnHash);
      const sourceEmbeddings = await findSegmentEmbeddingsByTurn(db, body.sourceTurnHash);
      const targetEmbeddings = await findSegmentEmbeddingsByTurn(db, body.targetTurnHash);

      const loaded = cachedProvider.setCacheFromRecords([
        ...baseEmbeddings,
        ...sourceEmbeddings,
        ...targetEmbeddings,
      ]);

      _embeddingProvider = cachedProvider;
      cacheStats = { preloaded: loaded, ...cachedProvider.getCacheStats() };
    } else {
      _embeddingProvider = baseProvider;
    }

    // Legacy node-level diff removed — use /v1/diff/frame endpoint instead
    return c.json(
      {
        success: true as const,
        data: {
          baseId,
          sourceId,
          targetId,
          method: 'placeholder',
          usedCache,
          cacheStats,
        },
      },
      200
    );
  } catch (error) {
    if (error instanceof EmbeddingProviderError) {
      return c.json(
        {
          success: false as const,
          error: { code: 'EMBEDDING_UNAVAILABLE', message: (error as Error).message },
        },
        500
      );
    }
    return c.json(
      {
        success: false as const,
        error: { code: 'DIFF_FAILED', message: (error as Error).message },
      },
      500
    );
  }
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
    // projectId is not relevant for diff (read-only, cross-project OK) — pass empty string
    const ctx = await buildPipelineContext(c, '');
    const result = await collectResult(
      runOperation(
        diffOp,
        {
          base_commit_hash: body.base_commit_hash,
          target_commit_hash: body.target_commit_hash,
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
