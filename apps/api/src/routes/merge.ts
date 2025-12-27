/**
 * Merge Routes
 *
 * POST /v1/merge - Execute three-way merge
 * POST /v1/merge/resolve - Apply conflict resolutions
 */

import {
  createClaudeProvider,
  createMergeEngine,
  type MergeFacet,
  type MergeResult,
  type RingOutput,
} from '@t3x/core';
import { findCommitByHash, findTurnByHash } from '@t3x/storage/pglite';
import { Hono } from 'hono';
import { getDB } from '../lib/db';
import { jsonError, jsonSuccess } from '../lib/response';

// ============================================================================
// Types
// ============================================================================

type DBType = Awaited<ReturnType<typeof getDB>>;

type ExtractResult =
  | { ok: true; facets: MergeFacet[] }
  | {
      ok: false;
      error: 'commit_not_found' | 'turn_not_found' | 'no_rings' | 'corrupted' | 'no_turn_window';
      message: string;
    };

// ============================================================================
// Helpers
// ============================================================================

/**
 * Extract facets from a commit's turn
 */
async function extractFacetsFromCommit(db: DBType, commitHash: string): Promise<ExtractResult> {
  const commit = await findCommitByHash(db, commitHash);
  if (!commit) {
    return { ok: false, error: 'commit_not_found', message: `Commit ${commitHash} not found` };
  }

  // Parse turn_window from commit
  let turnWindow: { start_turn_hash: string; end_turn_hash: string } | null = null;
  try {
    turnWindow = commit.turnWindowJson ? JSON.parse(commit.turnWindowJson) : null;
  } catch {
    return {
      ok: false,
      error: 'corrupted',
      message: `Commit ${commitHash} has invalid turn_window_json`,
    };
  }

  if (!turnWindow?.end_turn_hash) {
    return {
      ok: false,
      error: 'no_turn_window',
      message: `Commit ${commitHash} has no turn_window (may be a merge commit)`,
    };
  }

  const turnHash = turnWindow.end_turn_hash;
  const turn = await findTurnByHash(db, turnHash);
  if (!turn) {
    return { ok: false, error: 'turn_not_found', message: `Turn ${turnHash} not found` };
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

    // Extract keywords from ring1 if available
    const keywords = rings.ring1?.keywords?.map((kw) => kw.lemma) ?? [];

    // Convert segments to facets
    const facets: MergeFacet[] = rings.ring3.segments.map((seg) => ({
      id: seg.segmentId,
      facet: seg.segmentId,
      type: 'segment',
      text: seg.text,
      keywords,
    }));

    return { ok: true, facets };
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

function getErrorStatus(
  error: 'commit_not_found' | 'turn_not_found' | 'no_rings' | 'corrupted' | 'no_turn_window'
): 400 | 404 | 500 {
  if (error === 'corrupted') return 500;
  if (error === 'commit_not_found' || error === 'turn_not_found') return 404;
  return 400;
}

function getErrorCode(
  error: 'commit_not_found' | 'turn_not_found' | 'no_rings' | 'corrupted' | 'no_turn_window'
): string {
  if (error === 'corrupted') return 'DATA_CORRUPTED';
  if (error === 'no_rings') return 'NO_RINGS';
  if (error === 'no_turn_window') return 'NO_TURN_WINDOW';
  return 'NOT_FOUND';
}

// ============================================================================
// Routes
// ============================================================================

export const mergeRoutes = new Hono();

/**
 * POST /v1/merge - Execute three-way merge
 */
mergeRoutes.post('/v1/merge', async (c) => {
  let body: {
    // Mode 1: commit hash
    base_commit_hash?: string;
    source_commit_hash?: string;
    target_commit_hash?: string;
    // Mode 2: direct facets (legacy)
    baseFacets?: MergeFacet[];
    sourceFacets?: MergeFacet[];
    targetFacets?: MergeFacet[];
    /** Auto-resolve conflicts using LLM */
    autoResolveConflicts?: boolean;
  } | null = null;

  try {
    body = await c.req.json();
  } catch {
    return jsonError(c, 'INVALID_JSON', 'Invalid JSON body', 400);
  }

  if (!body) {
    return jsonError(c, 'INVALID_REQUEST', 'Request body is required', 400);
  }

  let baseFacets: MergeFacet[];
  let sourceFacets: MergeFacet[];
  let targetFacets: MergeFacet[];
  const autoResolveConflicts = body.autoResolveConflicts ?? false;

  const db = await getDB();

  // Mode 1: commit_hash mode
  if (body.base_commit_hash && body.source_commit_hash && body.target_commit_hash) {
    const baseResult = await extractFacetsFromCommit(db, body.base_commit_hash);
    const sourceResult = await extractFacetsFromCommit(db, body.source_commit_hash);
    const targetResult = await extractFacetsFromCommit(db, body.target_commit_hash);

    // Handle errors for each commit
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

    baseFacets = (baseResult as { ok: true; facets: MergeFacet[] }).facets;
    sourceFacets = (sourceResult as { ok: true; facets: MergeFacet[] }).facets;
    targetFacets = (targetResult as { ok: true; facets: MergeFacet[] }).facets;
  }
  // Mode 2: direct facets (legacy)
  else if (body.baseFacets && body.sourceFacets && body.targetFacets) {
    baseFacets = body.baseFacets;
    sourceFacets = body.sourceFacets;
    targetFacets = body.targetFacets;
  } else {
    return jsonError(
      c,
      'INVALID_REQUEST',
      'Provide either (base_commit_hash, source_commit_hash, target_commit_hash) or (baseFacets, sourceFacets, targetFacets)',
      400
    );
  }

  try {
    // Create LLM provider if auto-resolve is requested and API key is available
    let llmProvider;
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (autoResolveConflicts && anthropicApiKey) {
      llmProvider = createClaudeProvider({ apiKey: anthropicApiKey });
    }

    // Create merge engine and execute
    const mergeEngine = createMergeEngine({
      llmProvider,
      autoResolveConflicts: autoResolveConflicts && !!llmProvider,
    });
    const result = await mergeEngine.merge(baseFacets, sourceFacets, targetFacets);

    return jsonSuccess(c, result);
  } catch (error) {
    return jsonError(c, 'MERGE_FAILED', (error as Error).message, 500);
  }
});

/**
 * POST /v1/merge/resolve - Apply conflict resolutions
 */
mergeRoutes.post('/v1/merge/resolve', async (c) => {
  let body: {
    mergeResult?: MergeResult;
    resolutions?: Record<string, string>;
  } | null = null;

  try {
    body = await c.req.json();
  } catch {
    return jsonError(c, 'INVALID_JSON', 'Invalid JSON body', 400);
  }

  if (!body || !body.mergeResult || !body.resolutions) {
    return jsonError(
      c,
      'INVALID_REQUEST',
      "Request body must include 'mergeResult' and 'resolutions'",
      400
    );
  }

  try {
    // Create merge engine and apply resolutions
    const mergeEngine = createMergeEngine();
    const resolutionMap = new Map(Object.entries(body.resolutions));
    const result = mergeEngine.applyResolutions(body.mergeResult, resolutionMap);

    return jsonSuccess(c, result);
  } catch (error) {
    return jsonError(c, 'RESOLVE_FAILED', (error as Error).message, 500);
  }
});
