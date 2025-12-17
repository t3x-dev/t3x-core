/**
 * Diff Routes
 *
 * POST /api/v1/diff/two-way - Two-way semantic diff
 * POST /api/v1/diff/three-way - Three-way semantic diff
 *
 * Supports two modes:
 * 1. turn_hash mode: Pass turn hashes, uses cached embeddings from database
 * 2. segments mode: Pass segments directly, calls embedding API (legacy)
 *
 * Requires GOOGLE_AI_STUDIO_KEY for embedding-based semantic diff.
 */

import { Router, sendJson } from "../router";
import { successResponse, errorResponse, ProviderConfig } from "../types";
import {
  EmbeddingProviderError,
  createGoogleAIEmbeddingProvider,
  createCachedEmbeddingProvider,
  CachedEmbeddingProvider,
} from "../../core/providers/embedding";
import { createDiffEngine, DiffSegment } from "../../core/diff";
import {
  getTurnV2,
  getSegmentEmbeddingsByTurn,
  getCommitV2,
} from "../../core/storage";
import type { RingOutput } from "../../core/extractors";

/**
 * Two-way diff request body
 * Supports three modes:
 * 1. commit_hash mode: base_commit_hash + target_commit_hash (uses turn_window from commits)
 * 2. turn_hash mode: baseTurnHash + targetTurnHash (uses cached embeddings)
 * 3. segments mode: baseSegments + targetSegments (legacy, calls API)
 */
interface TwoWayDiffRequest {
  // Mode 1: commit hash (new, frontend-friendly)
  base_commit_hash?: string;
  target_commit_hash?: string;
  // Mode 2: turn hash (preferred for direct turn comparison)
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

/**
 * Three-way diff request body
 * Supports two modes similar to two-way diff
 */
interface ThreeWayDiffRequest {
  // Mode 1: turn hash (preferred)
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

/**
 * Result type for extractSegmentsFromTurn
 */
type ExtractResult =
  | { ok: true; id: string; segments: DiffSegment[] }
  | { ok: false; error: "not_found" | "no_rings" | "corrupted"; message: string };

/**
 * Extract segments from turn's Ring 3
 * Returns explicit error information instead of silent null
 */
async function extractSegmentsFromTurn(turnHash: string): Promise<ExtractResult> {
  const turn = await getTurnV2(turnHash);
  if (!turn) {
    return { ok: false, error: "not_found", message: `Turn ${turnHash} not found` };
  }
  if (!turn.rings_json) {
    return { ok: false, error: "no_rings", message: `Turn ${turnHash} has no rings_json` };
  }

  try {
    const rings = JSON.parse(turn.rings_json) as RingOutput;
    // ring3 must exist if rings_json exists - if not, data is corrupted
    if (!rings.ring3 || !Array.isArray(rings.ring3.segments)) {
      return {
        ok: false,
        error: "corrupted",
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
        error: "corrupted",
        message: `Turn ${turnHash} has invalid rings_json: ${err.message}`,
      };
    }
    throw err; // Re-throw unexpected errors
  }
}

/**
 * Load cached embeddings into a CachedEmbeddingProvider
 * Uses setCacheFromRecords to validate embedding_model
 */
async function loadCachedEmbeddingsIntoProvider(
  cachedProvider: CachedEmbeddingProvider,
  turnHashes: string[]
): Promise<number> {
  let totalLoaded = 0;
  for (const turnHash of turnHashes) {
    const records = await getSegmentEmbeddingsByTurn(turnHash);
    totalLoaded += cachedProvider.setCacheFromRecords(records);
  }
  return totalLoaded;
}

/**
 * Register diff routes
 */
export function registerDiffRoutes(router: Router, providers: ProviderConfig): void {
  // POST /api/v1/diff/two-way
  router.post("/api/v1/diff/two-way", async (ctx, _req, res) => {
    const body = ctx.body as TwoWayDiffRequest | null;
    if (!body) {
      sendJson(res, 400, errorResponse("INVALID_REQUEST", "Request body is required"));
      return;
    }

    const threshold = body.threshold ?? 0.7;
    let baseId: string;
    let baseSegments: DiffSegment[];
    let targetId: string;
    let targetSegments: DiffSegment[];
    let usedCache = false;
    let baseTurnHashForCache: string | undefined;
    let targetTurnHashForCache: string | undefined;

    // Mode 1: commit_hash mode (new, frontend-friendly)
    if (body.base_commit_hash && body.target_commit_hash) {
      // Get commits and extract turn_window
      const baseCommit = await getCommitV2(body.base_commit_hash);
      const targetCommit = await getCommitV2(body.target_commit_hash);

      if (!baseCommit) {
        sendJson(res, 404, errorResponse("NOT_FOUND", `Base commit ${body.base_commit_hash} not found`));
        return;
      }
      if (!targetCommit) {
        sendJson(res, 404, errorResponse("NOT_FOUND", `Target commit ${body.target_commit_hash} not found`));
        return;
      }

      // Parse turn_window from commits
      let baseTurnWindow: { start_turn_hash: string; end_turn_hash: string } | null = null;
      let targetTurnWindow: { start_turn_hash: string; end_turn_hash: string } | null = null;

      try {
        baseTurnWindow = baseCommit.turn_window_json ? JSON.parse(baseCommit.turn_window_json) : null;
        targetTurnWindow = targetCommit.turn_window_json ? JSON.parse(targetCommit.turn_window_json) : null;
      } catch {
        sendJson(res, 500, errorResponse("DATA_CORRUPTED", "Invalid turn_window_json in commit"));
        return;
      }

      if (!baseTurnWindow?.end_turn_hash) {
        sendJson(res, 400, errorResponse("INVALID_REQUEST", `Base commit ${body.base_commit_hash} has no turn_window (may be a merge commit)`));
        return;
      }
      if (!targetTurnWindow?.end_turn_hash) {
        sendJson(res, 400, errorResponse("INVALID_REQUEST", `Target commit ${body.target_commit_hash} has no turn_window (may be a merge commit)`));
        return;
      }

      // Use end_turn_hash for diff (represents the final state of the commit)
      const baseTurnHash = baseTurnWindow.end_turn_hash;
      const targetTurnHash = targetTurnWindow.end_turn_hash;

      const baseResult = await extractSegmentsFromTurn(baseTurnHash);
      const targetResult = await extractSegmentsFromTurn(targetTurnHash);

      if (!baseResult.ok) {
        const status = baseResult.error === "corrupted" ? 500 : 404;
        const code = baseResult.error === "corrupted" ? "DATA_CORRUPTED" :
                     baseResult.error === "no_rings" ? "NO_RINGS" : "NOT_FOUND";
        sendJson(res, status, errorResponse(code, baseResult.message));
        return;
      }
      if (!targetResult.ok) {
        const status = targetResult.error === "corrupted" ? 500 : 404;
        const code = targetResult.error === "corrupted" ? "DATA_CORRUPTED" :
                     targetResult.error === "no_rings" ? "NO_RINGS" : "NOT_FOUND";
        sendJson(res, status, errorResponse(code, targetResult.message));
        return;
      }

      baseId = baseResult.id;
      baseSegments = baseResult.segments;
      targetId = targetResult.id;
      targetSegments = targetResult.segments;
      baseTurnHashForCache = baseTurnHash;
      targetTurnHashForCache = targetTurnHash;
      usedCache = true;
    }
    // Mode 2: turn_hash mode (preferred for direct turn comparison)
    else if (body.baseTurnHash && body.targetTurnHash) {
      const baseResult = await extractSegmentsFromTurn(body.baseTurnHash);
      const targetResult = await extractSegmentsFromTurn(body.targetTurnHash);

      if (!baseResult.ok) {
        const status = baseResult.error === "corrupted" ? 500 : 404;
        const code = baseResult.error === "corrupted" ? "DATA_CORRUPTED" :
                     baseResult.error === "no_rings" ? "NO_RINGS" : "NOT_FOUND";
        sendJson(res, status, errorResponse(code, baseResult.message));
        return;
      }
      if (!targetResult.ok) {
        const status = targetResult.error === "corrupted" ? 500 : 404;
        const code = targetResult.error === "corrupted" ? "DATA_CORRUPTED" :
                     targetResult.error === "no_rings" ? "NO_RINGS" : "NOT_FOUND";
        sendJson(res, status, errorResponse(code, targetResult.message));
        return;
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
      sendJson(res, 400, errorResponse(
        "INVALID_REQUEST",
        "Provide either (base_commit_hash, target_commit_hash), (baseTurnHash, targetTurnHash), or (baseId, baseSegments, targetId, targetSegments)"
      ));
      return;
    }

    // Check API key
    if (!providers.googleAIStudioKey) {
      sendJson(res, 503, errorResponse("EMBEDDING_UNAVAILABLE", "GOOGLE_AI_STUDIO_KEY not configured"));
      return;
    }

    try {
      // Create base provider
      const baseProvider = createGoogleAIEmbeddingProvider({
        apiKey: providers.googleAIStudioKey,
      });

      // Wrap with cached provider if using turn_hash mode
      let embeddingProvider;
      let cacheStats = null;

      if (usedCache && baseTurnHashForCache && targetTurnHashForCache) {
        const cachedProvider = await createCachedEmbeddingProvider(baseProvider);
        // Load cached embeddings with model validation
        const loaded = await loadCachedEmbeddingsIntoProvider(cachedProvider, [
          baseTurnHashForCache,
          targetTurnHashForCache,
        ]);
        embeddingProvider = cachedProvider;
        cacheStats = { preloaded: loaded, ...cachedProvider.getCacheStats() };
      } else {
        embeddingProvider = baseProvider;
      }

      const diffEngine = createDiffEngine(embeddingProvider, { threshold });
      const result = await diffEngine.diffTwoWay(
        baseId,
        baseSegments,
        targetId,
        targetSegments
      );

      sendJson(res, 200, successResponse({
        ...result,
        method: "embedding",
        usedCache,
        cacheStats,
      }));
    } catch (error) {
      if (error instanceof EmbeddingProviderError) {
        sendJson(res, 503, errorResponse("EMBEDDING_UNAVAILABLE", error.message));
        return;
      }
      sendJson(res, 500, errorResponse("DIFF_FAILED", (error as Error).message));
    }
  });

  // POST /api/v1/diff/three-way
  router.post("/api/v1/diff/three-way", async (ctx, _req, res) => {
    const body = ctx.body as ThreeWayDiffRequest | null;
    if (!body) {
      sendJson(res, 400, errorResponse("INVALID_REQUEST", "Request body is required"));
      return;
    }

    const threshold = body.threshold ?? 0.7;
    let baseId: string;
    let baseSegments: DiffSegment[];
    let sourceId: string;
    let sourceSegments: DiffSegment[];
    let targetId: string;
    let targetSegments: DiffSegment[];
    let usedCache = false;

    // Mode 1: turn_hash mode (preferred)
    if (body.baseTurnHash && body.sourceTurnHash && body.targetTurnHash) {
      const baseResult = await extractSegmentsFromTurn(body.baseTurnHash);
      const sourceResult = await extractSegmentsFromTurn(body.sourceTurnHash);
      const targetResult = await extractSegmentsFromTurn(body.targetTurnHash);

      if (!baseResult.ok) {
        const status = baseResult.error === "corrupted" ? 500 : 404;
        const code = baseResult.error === "corrupted" ? "DATA_CORRUPTED" :
                     baseResult.error === "no_rings" ? "NO_RINGS" : "NOT_FOUND";
        sendJson(res, status, errorResponse(code, baseResult.message));
        return;
      }
      if (!sourceResult.ok) {
        const status = sourceResult.error === "corrupted" ? 500 : 404;
        const code = sourceResult.error === "corrupted" ? "DATA_CORRUPTED" :
                     sourceResult.error === "no_rings" ? "NO_RINGS" : "NOT_FOUND";
        sendJson(res, status, errorResponse(code, sourceResult.message));
        return;
      }
      if (!targetResult.ok) {
        const status = targetResult.error === "corrupted" ? 500 : 404;
        const code = targetResult.error === "corrupted" ? "DATA_CORRUPTED" :
                     targetResult.error === "no_rings" ? "NO_RINGS" : "NOT_FOUND";
        sendJson(res, status, errorResponse(code, targetResult.message));
        return;
      }

      baseId = baseResult.id;
      baseSegments = baseResult.segments;
      sourceId = sourceResult.id;
      sourceSegments = sourceResult.segments;
      targetId = targetResult.id;
      targetSegments = targetResult.segments;
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
      sendJson(res, 400, errorResponse(
        "INVALID_REQUEST",
        "Provide either (baseTurnHash, sourceTurnHash, targetTurnHash) or (baseId, sourceId, targetId with segments)"
      ));
      return;
    }

    // Check API key
    if (!providers.googleAIStudioKey) {
      sendJson(res, 503, errorResponse("EMBEDDING_UNAVAILABLE", "GOOGLE_AI_STUDIO_KEY not configured"));
      return;
    }

    try {
      // Create base provider
      const baseProvider = createGoogleAIEmbeddingProvider({
        apiKey: providers.googleAIStudioKey,
      });

      // Wrap with cached provider if using turn_hash mode
      let embeddingProvider;
      let cacheStats = null;

      if (usedCache && body.baseTurnHash && body.sourceTurnHash && body.targetTurnHash) {
        const cachedProvider = await createCachedEmbeddingProvider(baseProvider);
        // Load cached embeddings with model validation
        const loaded = await loadCachedEmbeddingsIntoProvider(cachedProvider, [
          body.baseTurnHash,
          body.sourceTurnHash,
          body.targetTurnHash,
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

      sendJson(res, 200, successResponse({
        ...result,
        method: "embedding",
        usedCache,
        cacheStats,
      }));
    } catch (error) {
      if (error instanceof EmbeddingProviderError) {
        sendJson(res, 503, errorResponse("EMBEDDING_UNAVAILABLE", error.message));
        return;
      }
      sendJson(res, 500, errorResponse("DIFF_FAILED", (error as Error).message));
    }
  });
}
