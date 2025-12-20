/**
 * Two-Way Diff API Route
 *
 * POST /api/v1/diff/two-way - Calculate two-way semantic diff
 *
 * Supports three modes:
 * 1. commit_hash mode: base_commit_hash + target_commit_hash
 * 2. turn_hash mode: baseTurnHash + targetTurnHash
 * 3. segments mode: baseSegments + targetSegments (legacy)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { findTurnByHash, findCommitByHash, findSegmentEmbeddingsByTurn } from '@t3x/storage';
import { createDiffEngine, type DiffSegment, type RingOutput } from '@t3x/core';
import {
  createGoogleAIEmbeddingProvider,
  createCachedEmbeddingProvider,
  EmbeddingProviderError,
} from '@/lib/providers';

interface TwoWayDiffRequest {
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
}

type ExtractResult =
  | { ok: true; id: string; segments: DiffSegment[] }
  | { ok: false; error: 'not_found' | 'no_rings' | 'corrupted'; message: string };

/**
 * Extract segments from turn's Ring 3
 */
async function extractSegmentsFromTurn(
  db: Awaited<ReturnType<typeof getDB>>,
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

function successResponse<T>(data: T) {
  return { success: true, data };
}

function errorResponse(code: string, message: string) {
  return { success: false, error: { code, message } };
}

export async function POST(request: NextRequest) {
  let body: TwoWayDiffRequest | null = null;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(errorResponse('INVALID_JSON', 'Invalid JSON body'), { status: 400 });
  }

  if (!body) {
    return NextResponse.json(
      errorResponse('INVALID_REQUEST', 'Request body is required'),
      { status: 400 }
    );
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
      return NextResponse.json(
        errorResponse('NOT_FOUND', `Base commit ${body.base_commit_hash} not found`),
        { status: 404 }
      );
    }
    if (!targetCommit) {
      return NextResponse.json(
        errorResponse('NOT_FOUND', `Target commit ${body.target_commit_hash} not found`),
        { status: 404 }
      );
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
      return NextResponse.json(
        errorResponse('DATA_CORRUPTED', 'Invalid turn_window_json in commit'),
        { status: 500 }
      );
    }

    if (!baseTurnWindow?.end_turn_hash) {
      return NextResponse.json(
        errorResponse(
          'INVALID_REQUEST',
          `Base commit ${body.base_commit_hash} has no turn_window (may be a merge commit)`
        ),
        { status: 400 }
      );
    }
    if (!targetTurnWindow?.end_turn_hash) {
      return NextResponse.json(
        errorResponse(
          'INVALID_REQUEST',
          `Target commit ${body.target_commit_hash} has no turn_window (may be a merge commit)`
        ),
        { status: 400 }
      );
    }

    const baseTurnHash = baseTurnWindow.end_turn_hash;
    const targetTurnHash = targetTurnWindow.end_turn_hash;

    const baseResult = await extractSegmentsFromTurn(db, baseTurnHash);
    const targetResult = await extractSegmentsFromTurn(db, targetTurnHash);

    if (!baseResult.ok) {
      const status = baseResult.error === 'corrupted' ? 500 : 404;
      const code =
        baseResult.error === 'corrupted'
          ? 'DATA_CORRUPTED'
          : baseResult.error === 'no_rings'
            ? 'NO_RINGS'
            : 'NOT_FOUND';
      return NextResponse.json(errorResponse(code, baseResult.message), { status });
    }
    if (!targetResult.ok) {
      const status = targetResult.error === 'corrupted' ? 500 : 404;
      const code =
        targetResult.error === 'corrupted'
          ? 'DATA_CORRUPTED'
          : targetResult.error === 'no_rings'
            ? 'NO_RINGS'
            : 'NOT_FOUND';
      return NextResponse.json(errorResponse(code, targetResult.message), { status });
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
      const status = baseResult.error === 'corrupted' ? 500 : 404;
      const code =
        baseResult.error === 'corrupted'
          ? 'DATA_CORRUPTED'
          : baseResult.error === 'no_rings'
            ? 'NO_RINGS'
            : 'NOT_FOUND';
      return NextResponse.json(errorResponse(code, baseResult.message), { status });
    }
    if (!targetResult.ok) {
      const status = targetResult.error === 'corrupted' ? 500 : 404;
      const code =
        targetResult.error === 'corrupted'
          ? 'DATA_CORRUPTED'
          : targetResult.error === 'no_rings'
            ? 'NO_RINGS'
            : 'NOT_FOUND';
      return NextResponse.json(errorResponse(code, targetResult.message), { status });
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
    return NextResponse.json(
      errorResponse(
        'INVALID_REQUEST',
        'Provide either (base_commit_hash, target_commit_hash), (baseTurnHash, targetTurnHash), or (baseId, baseSegments, targetId, targetSegments)'
      ),
      { status: 400 }
    );
  }

  // Check API key
  const googleApiKey = process.env.GOOGLE_AI_STUDIO_KEY;
  if (!googleApiKey) {
    return NextResponse.json(
      errorResponse('EMBEDDING_UNAVAILABLE', 'GOOGLE_AI_STUDIO_KEY not configured'),
      { status: 503 }
    );
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

    return NextResponse.json(
      successResponse({
        ...result,
        method: 'embedding',
        usedCache,
        cacheStats,
      })
    );
  } catch (error) {
    if (error instanceof EmbeddingProviderError) {
      return NextResponse.json(
        errorResponse('EMBEDDING_UNAVAILABLE', error.message),
        { status: 503 }
      );
    }
    return NextResponse.json(
      errorResponse('DIFF_FAILED', (error as Error).message),
      { status: 500 }
    );
  }
}
