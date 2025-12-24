/**
 * Diff Routes
 *
 * POST /v1/diff/two-way - Calculate two-way semantic diff
 * POST /v1/diff/three-way - Calculate three-way semantic diff
 */
import { Hono } from 'hono';
import { getDB } from '../lib/db';
import { jsonSuccess, jsonError } from '../lib/response';
import {
  findTurnByHash,
  findCommitByHash,
  findSegmentEmbeddingsByTurn,
} from '@t3x/storage/pglite';
import {
  createDiffEngine,
  createGoogleAIEmbeddingProvider,
  createCachedEmbeddingProvider,
  EmbeddingProviderError,
  type DiffSegment,
  type RingOutput,
} from '@t3x/core';

// ============================================================================
// Types
// ============================================================================

type DBType = Awaited<ReturnType<typeof getDB>>;

type ExtractResult =
  | { ok: true; id: string; segments: DiffSegment[] }
  | { ok: false; error: 'not_found' | 'no_rings' | 'corrupted'; message: string };

// ============================================================================
// Helpers
// ============================================================================

/**
 * Extract segments from turn's Ring 3
 */
async function extractSegmentsFromTurn(
  db: DBType,
  turnHash: string
): Promise<ExtractResult> {
  const turn = await findTurnByHash(db, turnHash);
  if (!turn) {
    return { ok: false, error: 'not_found', message: `Turn ${turnHash} not found` };
  }
  if (!turn.ringsJson) {
    return { ok: false, error: 'no_rings', message: `Turn ${turnHash} has no rings_json` };
  }

  try {
    const rings = JSON.parse(turn.ringsJson) as RingOutput;
    if (!rings.ring3 || !Array.isArray(rings.ring3.segments)) {
      return {
        ok: false,
        error: 'corrupted',
        message: `Turn ${turnHash} has corrupted rings_json: missing ring3.segments`,
      };
    }
    const segments: DiffSegment[] = rings.ring3.segments.map((seg) => ({
      segmentId: seg.segmentId,
      text: seg.text,
    }));
    return { ok: true, id: turnHash, segments };
  } catch (err) {
    if (err instanceof SyntaxError) {
      return {
        ok: false,
        error: 'corrupted',
        message: `Turn ${turnHash} has invalid rings_json: ${err.message}`,
      };
    }
    throw err;
  }
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
// Routes
// ============================================================================

export const diffRoutes = new Hono();

/**
 * POST /v1/diff/two-way - Calculate two-way semantic diff
 */
diffRoutes.post('/v1/diff/two-way', async (c) => {
  let body: {
    // Mode 1: commit hash
    base_commit_hash?: string;
    target_commit_hash?: string;
    // Mode 2: turn hash
    baseTurnHash?: string;
    targetTurnHash?: string;
    // Mode 3: direct segments (legacy)
    baseId?: string;
    baseSegments?: DiffSegment[];
    targetId?: string;
    targetSegments?: DiffSegment[];
    // Common options
    threshold?: number;
  } | null = null;

  try {
    body = await c.req.json();
  } catch {
    return jsonError(c, 'INVALID_JSON', 'Invalid JSON body', 400);
  }

  if (!body) {
    return jsonError(c, 'INVALID_REQUEST', 'Request body is required', 400);
  }

  const threshold = body.threshold ?? 0.7;
  let baseId: string;
  let baseSegments: DiffSegment[];
  let targetId: string;
  let targetSegments: DiffSegment[];
  let usedCache = false;
  let baseTurnHashForCache: string | undefined;
  let targetTurnHashForCache: string | undefined;

  const db = await getDB();

  // Mode 1: commit_hash mode
  if (body.base_commit_hash && body.target_commit_hash) {
    const baseCommit = await findCommitByHash(db, body.base_commit_hash);
    const targetCommit = await findCommitByHash(db, body.target_commit_hash);

    if (!baseCommit) {
      return jsonError(c, 'NOT_FOUND', `Base commit ${body.base_commit_hash} not found`, 404);
    }
    if (!targetCommit) {
      return jsonError(c, 'NOT_FOUND', `Target commit ${body.target_commit_hash} not found`, 404);
    }

    // Parse turn_window from commits
    let baseTurnWindow: { start_turn_hash: string; end_turn_hash: string } | null = null;
    let targetTurnWindow: { start_turn_hash: string; end_turn_hash: string } | null = null;

    try {
      baseTurnWindow = baseCommit.turnWindowJson ? JSON.parse(baseCommit.turnWindowJson) : null;
      targetTurnWindow = targetCommit.turnWindowJson
        ? JSON.parse(targetCommit.turnWindowJson)
        : null;
    } catch {
      return jsonError(c, 'DATA_CORRUPTED', 'Invalid turn_window_json in commit', 500);
    }

    if (!baseTurnWindow?.end_turn_hash) {
      return jsonError(
        c,
        'INVALID_REQUEST',
        `Base commit ${body.base_commit_hash} has no turn_window (may be a merge commit)`,
        400
      );
    }
    if (!targetTurnWindow?.end_turn_hash) {
      return jsonError(
        c,
        'INVALID_REQUEST',
        `Target commit ${body.target_commit_hash} has no turn_window (may be a merge commit)`,
        400
      );
    }

    const baseTurnHash = baseTurnWindow.end_turn_hash;
    const targetTurnHash = targetTurnWindow.end_turn_hash;

    const baseResult = await extractSegmentsFromTurn(db, baseTurnHash);
    const targetResult = await extractSegmentsFromTurn(db, targetTurnHash);

    if (!baseResult.ok) {
      return jsonError(c, getErrorCode(baseResult.error), baseResult.message, getErrorStatus(baseResult.error));
    }
    if (!targetResult.ok) {
      return jsonError(c, getErrorCode(targetResult.error), targetResult.message, getErrorStatus(targetResult.error));
    }

    baseId = baseResult.id;
    baseSegments = baseResult.segments;
    targetId = targetResult.id;
    targetSegments = targetResult.segments;
    baseTurnHashForCache = baseTurnHash;
    targetTurnHashForCache = targetTurnHash;
    usedCache = true;
  }
  // Mode 2: turn_hash mode
  else if (body.baseTurnHash && body.targetTurnHash) {
    const baseResult = await extractSegmentsFromTurn(db, body.baseTurnHash);
    const targetResult = await extractSegmentsFromTurn(db, body.targetTurnHash);

    if (!baseResult.ok) {
      return jsonError(c, getErrorCode(baseResult.error), baseResult.message, getErrorStatus(baseResult.error));
    }
    if (!targetResult.ok) {
      return jsonError(c, getErrorCode(targetResult.error), targetResult.message, getErrorStatus(targetResult.error));
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
    return jsonError(
      c,
      'INVALID_REQUEST',
      'Provide either (base_commit_hash, target_commit_hash), (baseTurnHash, targetTurnHash), or (baseId, baseSegments, targetId, targetSegments)',
      400
    );
  }

  // Check API key
  const googleApiKey = process.env.GOOGLE_AI_STUDIO_KEY;
  if (!googleApiKey) {
    return jsonError(c, 'EMBEDDING_UNAVAILABLE', 'GOOGLE_AI_STUDIO_KEY not configured', 500);
  }

  try {
    // Create base provider
    const baseProvider = createGoogleAIEmbeddingProvider({
      apiKey: googleApiKey,
    });

    // Wrap with cached provider if using turn_hash mode
    let embeddingProvider;
    let cacheStats = null;

    if (usedCache && baseTurnHashForCache && targetTurnHashForCache) {
      const cachedProvider = createCachedEmbeddingProvider(baseProvider);

      // Load cached embeddings
      const baseEmbeddings = await findSegmentEmbeddingsByTurn(db, baseTurnHashForCache);
      const targetEmbeddings = await findSegmentEmbeddingsByTurn(db, targetTurnHashForCache);

      const loaded = cachedProvider.setCacheFromRecords([...baseEmbeddings, ...targetEmbeddings]);

      embeddingProvider = cachedProvider;
      cacheStats = { preloaded: loaded, ...cachedProvider.getCacheStats() };
    } else {
      embeddingProvider = baseProvider;
    }

    const diffEngine = createDiffEngine(embeddingProvider, { threshold });
    const result = await diffEngine.diffTwoWay(baseId, baseSegments, targetId, targetSegments);

    return jsonSuccess(c, {
      ...result,
      method: 'embedding',
      usedCache,
      cacheStats,
    });
  } catch (error) {
    if (error instanceof EmbeddingProviderError) {
      return jsonError(c, 'EMBEDDING_UNAVAILABLE', error.message, 500);
    }
    return jsonError(c, 'DIFF_FAILED', (error as Error).message, 500);
  }
});

/**
 * POST /v1/diff/three-way - Calculate three-way semantic diff
 */
diffRoutes.post('/v1/diff/three-way', async (c) => {
  let body: {
    // Mode 1: turn hash
    baseTurnHash?: string;
    sourceTurnHash?: string;
    targetTurnHash?: string;
    // Mode 2: direct segments (legacy)
    baseId?: string;
    baseSegments?: DiffSegment[];
    sourceId?: string;
    sourceSegments?: DiffSegment[];
    targetId?: string;
    targetSegments?: DiffSegment[];
    // Common options
    threshold?: number;
  } | null = null;

  try {
    body = await c.req.json();
  } catch {
    return jsonError(c, 'INVALID_JSON', 'Invalid JSON body', 400);
  }

  if (!body) {
    return jsonError(c, 'INVALID_REQUEST', 'Request body is required', 400);
  }

  const threshold = body.threshold ?? 0.7;
  let baseId: string;
  let baseSegments: DiffSegment[];
  let sourceId: string;
  let sourceSegments: DiffSegment[];
  let targetId: string;
  let targetSegments: DiffSegment[];
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
        return jsonError(c, getErrorCode(result.error), `${name}: ${result.message}`, getErrorStatus(result.error));
      }
    }

    baseId = (baseResult as { ok: true; id: string; segments: DiffSegment[] }).id;
    baseSegments = (baseResult as { ok: true; id: string; segments: DiffSegment[] }).segments;
    sourceId = (sourceResult as { ok: true; id: string; segments: DiffSegment[] }).id;
    sourceSegments = (sourceResult as { ok: true; id: string; segments: DiffSegment[] }).segments;
    targetId = (targetResult as { ok: true; id: string; segments: DiffSegment[] }).id;
    targetSegments = (targetResult as { ok: true; id: string; segments: DiffSegment[] }).segments;
    usedCache = true;
  }
  // Mode 2: direct segments (legacy)
  else if (body.baseId && body.sourceId && body.targetId) {
    baseId = body.baseId;
    baseSegments = body.baseSegments ?? [];
    sourceId = body.sourceId;
    sourceSegments = body.sourceSegments ?? [];
    targetId = body.targetId;
    targetSegments = body.targetSegments ?? [];
  } else {
    return jsonError(
      c,
      'INVALID_REQUEST',
      'Provide either (baseTurnHash, sourceTurnHash, targetTurnHash) or (baseId, sourceId, targetId with segments)',
      400
    );
  }

  // Check API key
  const googleApiKey = process.env.GOOGLE_AI_STUDIO_KEY;
  if (!googleApiKey) {
    return jsonError(c, 'EMBEDDING_UNAVAILABLE', 'GOOGLE_AI_STUDIO_KEY not configured', 500);
  }

  try {
    // Create base provider
    const baseProvider = createGoogleAIEmbeddingProvider({
      apiKey: googleApiKey,
    });

    // Wrap with cached provider if using turn_hash mode
    let embeddingProvider;
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

      embeddingProvider = cachedProvider;
      cacheStats = { preloaded: loaded, ...cachedProvider.getCacheStats() };
    } else {
      embeddingProvider = baseProvider;
    }

    const diffEngine = createDiffEngine(embeddingProvider, { threshold });
    const result = await diffEngine.diffThreeWay(
      baseId,
      baseSegments,
      sourceId,
      sourceSegments,
      targetId,
      targetSegments
    );

    return jsonSuccess(c, {
      ...result,
      method: 'embedding',
      usedCache,
      cacheStats,
    });
  } catch (error) {
    if (error instanceof EmbeddingProviderError) {
      return jsonError(c, 'EMBEDDING_UNAVAILABLE', error.message, 500);
    }
    return jsonError(c, 'DIFF_FAILED', (error as Error).message, 500);
  }
});
