/**
 * Three-Way Diff API Route
 *
 * POST /api/v1/diff/three-way - Calculate three-way semantic diff
 *
 * Supports two modes:
 * 1. turn_hash mode: baseTurnHash + sourceTurnHash + targetTurnHash
 * 2. segments mode: baseSegments + sourceSegments + targetSegments (legacy)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { findTurnByHash, findSegmentEmbeddingsByTurn } from '@t3x/storage';
import { createDiffEngine, type DiffSegment, type RingOutput } from '@t3x/core';
import {
  createGoogleAIEmbeddingProvider,
  createCachedEmbeddingProvider,
  EmbeddingProviderError,
} from '@/lib/providers';

interface ThreeWayDiffRequest {
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
  let body: ThreeWayDiffRequest | null = null;

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
        const status = result.error === 'corrupted' ? 500 : 404;
        const code =
          result.error === 'corrupted'
            ? 'DATA_CORRUPTED'
            : result.error === 'no_rings'
              ? 'NO_RINGS'
              : 'NOT_FOUND';
        return NextResponse.json(errorResponse(code, `${name}: ${result.message}`), { status });
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
    return NextResponse.json(
      errorResponse(
        'INVALID_REQUEST',
        'Provide either (baseTurnHash, sourceTurnHash, targetTurnHash) or (baseId, sourceId, targetId with segments)'
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
