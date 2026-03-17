/**
 * Diff Routes
 *
 * POST /v1/diff/two-way - Calculate two-way semantic diff
 * POST /v1/diff/three-way - Calculate three-way semantic diff
 */

import {
  calculateDiffStats,
  createCachedEmbeddingProvider,
  createDiffEngine,
  createGoogleAIEmbeddingProvider,
  type DiffSegment,
  DiffType,
  diffCommits,
  EmbeddingProviderError,
  type FrameDiff,
  frameDiff,
  type SegmentDiff,
  upgradeLegacyCommit,
  type WordDiffSegment,
} from '@t3x-dev/core';
import {
  findCommitV4ByHash,
  findSegmentEmbeddingsByTurn,
  findTurnByHash,
  getCommit,
} from '@t3x-dev/storage';
import { Hono } from 'hono';
import { getDB } from '../lib/db';
import { jsonError, jsonSuccess } from '../lib/response';

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
 * Extract segments from turn — tries Ring 3 first, falls back to sentence splitting.
 *
 * Strategy 1: Ring 3 segments (legacy path, when rings_json exists)
 * Strategy 2: Punctuation-based sentence splitting (when Ring data unavailable)
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
      // Fall through to sentence splitting
    }
  }

  // Strategy 2: Punctuation-based sentence splitting
  if (turn.content) {
    const sentences = turn.content
      .split(/(?<=[.!?。！？])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (sentences.length > 0) {
      return {
        ok: true,
        id: turnHash,
        segments: sentences.map((text, i) => ({
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

  // Mode 1: commit_hash mode (V4 first, fallback to V3)
  if (body.base_commit_hash && body.target_commit_hash) {
    // Try V4 commits first
    const baseV4 = await findCommitV4ByHash(db, body.base_commit_hash);
    const targetV4 = await findCommitV4ByHash(db, body.target_commit_hash);

    if (baseV4 && targetV4) {
      // V4 path: use local Jaccard + Hungarian diff (no embedding API needed)
      const commitDiff = diffCommits(
        baseV4.content.sentences.map((s) => ({ id: s.id, text: s.text })),
        targetV4.content.sentences.map((s) => ({ id: s.id, text: s.text }))
      );

      // Convert CommitDiff → response format for frontend compatibility
      const segmentDiffs: (SegmentDiff & { wordDiff?: WordDiffSegment[] })[] = [];
      for (const s of commitDiff.identical) {
        segmentDiffs.push({ segmentId: s.id, text: s.text, diffType: DiffType.SAME });
      }
      for (const pair of commitDiff.similar) {
        segmentDiffs.push({
          segmentId: pair.source.id,
          text: pair.source.text,
          diffType: DiffType.MODIFIED,
          similarity: pair.similarity,
          matchedSegmentId: pair.target.id,
          matchedText: pair.target.text,
          wordDiff: pair.wordDiff,
        });
      }
      for (const s of commitDiff.onlyInSource) {
        segmentDiffs.push({ segmentId: s.id, text: s.text, diffType: DiffType.REMOVED });
      }
      for (const s of commitDiff.onlyInTarget) {
        segmentDiffs.push({ segmentId: s.id, text: s.text, diffType: DiffType.ADDED });
      }

      return jsonSuccess(c, {
        baseId: body.base_commit_hash,
        targetId: body.target_commit_hash,
        segmentDiffs,
        threshold: 0.3, // Jaccard threshold
        stats: calculateDiffStats(segmentDiffs),
        method: 'jaccard',
        usedCache: false,
        cacheStats: null,
      });
    } else {
      if (!baseV4) {
        return jsonError(c, 'NOT_FOUND', `Base commit ${body.base_commit_hash} not found`, 404);
      }
      if (!targetV4) {
        return jsonError(c, 'NOT_FOUND', `Target commit ${body.target_commit_hash} not found`, 404);
      }
    }
  }
  // Mode 2: turn_hash mode
  else if (body.baseTurnHash && body.targetTurnHash) {
    const baseResult = await extractSegmentsFromTurn(db, body.baseTurnHash);
    const targetResult = await extractSegmentsFromTurn(db, body.targetTurnHash);

    if (!baseResult.ok) {
      return jsonError(
        c,
        getErrorCode(baseResult.error),
        baseResult.message,
        getErrorStatus(baseResult.error)
      );
    }
    if (!targetResult.ok) {
      return jsonError(
        c,
        getErrorCode(targetResult.error),
        targetResult.message,
        getErrorStatus(targetResult.error)
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
        return jsonError(
          c,
          getErrorCode(result.error),
          `${name}: ${result.message}`,
          getErrorStatus(result.error)
        );
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

/**
 * POST /v1/diff/frame — Frame-based diff between two commits
 */
diffRoutes.post('/v1/diff/frame', async (c) => {
  let body: {
    base_commit_hash?: string;
    target_commit_hash?: string;
  } | null = null;

  try {
    body = await c.req.json();
  } catch {
    return jsonError(c, 'INVALID_JSON', 'Invalid JSON body', 400);
  }

  if (!body) {
    return jsonError(c, 'INVALID_REQUEST', 'Request body is required', 400);
  }

  if (!body.base_commit_hash || !body.target_commit_hash) {
    return jsonError(
      c,
      'INVALID_REQUEST',
      'Both base_commit_hash and target_commit_hash are required',
      400
    );
  }

  const db = await getDB();

  // Fetch commit — try V5 first, fall back to V4, then V3 (all upgraded to frame-based)
  const fetchCommit = async (hash: string) => {
    // Try V5 (frame-based)
    const v5 = await getCommit(db, hash);
    if (v5) return v5;

    // Try V4 (sentence-based) and upgrade to frame-based
    const v4 = await findCommitV4ByHash(db, hash);
    if (v4) return upgradeLegacyCommit(v4 as Parameters<typeof upgradeLegacyCommit>[0]);

    return null;
  };

  const [baseCommit, targetCommit] = await Promise.all([
    fetchCommit(body.base_commit_hash),
    fetchCommit(body.target_commit_hash),
  ]);

  if (!baseCommit) {
    return jsonError(c, 'NOT_FOUND', `Base commit ${body.base_commit_hash} not found`, 404);
  }
  if (!targetCommit) {
    return jsonError(c, 'NOT_FOUND', `Target commit ${body.target_commit_hash} not found`, 404);
  }

  const diff: FrameDiff = frameDiff(baseCommit.content, targetCommit.content);

  const commitMeta = (commit: typeof baseCommit) => ({
    hash: commit.hash,
    message: commit.message ?? null,
    author: commit.author,
    committed_at: commit.committed_at,
    branch: commit.branch,
  });

  return jsonSuccess(c, {
    diff,
    base: commitMeta(baseCommit),
    target: commitMeta(targetCommit),
  });
});
