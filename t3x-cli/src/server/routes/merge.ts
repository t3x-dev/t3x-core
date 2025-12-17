/**
 * Merge Routes
 *
 * POST /api/v1/merge - Execute three-way merge
 * POST /api/v1/merge/resolve - Apply conflict resolutions
 *
 * Supports two modes:
 * 1. commit_hash mode: Pass commit hashes, uses turns from commits
 * 2. facets mode: Pass facets directly (legacy)
 */

import type { ServerResponse } from "node:http";
import { Router, sendJson } from "../router";
import { successResponse, errorResponse, ProviderConfig } from "../types";
import { createMergeEngine, MergeFacet, MergeResult } from "../../core/merge";
import { createClaudeProvider } from "../../core/llm";
import { getTurnV2, getCommitV2 } from "../../core/storage";
import type { RingOutput } from "../../core/extractors";

/**
 * Merge request body
 * Supports two modes:
 * 1. commit_hash mode: base_commit_hash + source_commit_hash + target_commit_hash
 * 2. facets mode: baseFacets + sourceFacets + targetFacets (legacy)
 */
interface MergeRequest {
  // Mode 1: commit hash (new, frontend-friendly)
  base_commit_hash?: string;
  source_commit_hash?: string;
  target_commit_hash?: string;
  // Mode 2: direct facets (legacy)
  baseFacets?: MergeFacet[];
  sourceFacets?: MergeFacet[];
  targetFacets?: MergeFacet[];
  /** Auto-resolve conflicts using LLM */
  autoResolveConflicts?: boolean;
}

/**
 * Result type for extractFacetsFromCommit
 */
type ExtractResult =
  | { ok: true; facets: MergeFacet[] }
  | { ok: false; error: "commit_not_found" | "turn_not_found" | "no_rings" | "corrupted" | "no_turn_window"; message: string };

/**
 * Extract facets from a commit's turn
 * Converts ring3 segments to MergeFacet format
 */
async function extractFacetsFromCommit(commitHash: string): Promise<ExtractResult> {
  const commit = await getCommitV2(commitHash);
  if (!commit) {
    return { ok: false, error: "commit_not_found", message: `Commit ${commitHash} not found` };
  }

  // Parse turn_window from commit
  let turnWindow: { start_turn_hash: string; end_turn_hash: string } | null = null;
  try {
    turnWindow = commit.turn_window_json ? JSON.parse(commit.turn_window_json) : null;
  } catch {
    return { ok: false, error: "corrupted", message: `Commit ${commitHash} has invalid turn_window_json` };
  }

  if (!turnWindow?.end_turn_hash) {
    return { ok: false, error: "no_turn_window", message: `Commit ${commitHash} has no turn_window (may be a merge commit)` };
  }

  const turnHash = turnWindow.end_turn_hash;
  const turn = await getTurnV2(turnHash);
  if (!turn) {
    return { ok: false, error: "turn_not_found", message: `Turn ${turnHash} not found` };
  }
  if (!turn.rings_json) {
    return { ok: false, error: "no_rings", message: `Turn ${turnHash} has no rings_json` };
  }

  try {
    const rings = JSON.parse(turn.rings_json) as RingOutput;
    if (!rings.ring3 || !Array.isArray(rings.ring3.segments)) {
      return {
        ok: false,
        error: "corrupted",
        message: `Turn ${turnHash} has corrupted rings_json: missing ring3.segments`,
      };
    }

    // Extract keywords from ring1 if available
    const keywords = rings.ring1?.keywords?.map((kw) => kw.lemma) ?? [];

    // Convert segments to facets
    const facets: MergeFacet[] = rings.ring3.segments.map((seg) => ({
      id: seg.segmentId,
      facet: seg.segmentId,
      type: "segment",
      text: seg.text,
      keywords,
    }));

    return { ok: true, facets };
  } catch (err) {
    if (err instanceof SyntaxError) {
      return {
        ok: false,
        error: "corrupted",
        message: `Turn ${turnHash} has invalid rings_json: ${err.message}`,
      };
    }
    throw err;
  }
}

/**
 * Resolution request body
 */
interface ResolveRequest {
  mergeResult: MergeResult;
  resolutions: Record<string, string>;
}

/**
 * Register merge routes
 */
export function registerMergeRoutes(router: Router, providers: ProviderConfig): void {
  // POST /api/v1/merge
  router.post("/api/v1/merge", async (ctx, _req, res) => {
    // Validate request body
    const body = ctx.body as MergeRequest | null;
    if (!body) {
      sendJson(res, 400, errorResponse(
        "INVALID_REQUEST",
        "Request body is required"
      ));
      return;
    }

    let baseFacets: MergeFacet[];
    let sourceFacets: MergeFacet[];
    let targetFacets: MergeFacet[];
    const autoResolveConflicts = body.autoResolveConflicts ?? false;

    // Mode 1: commit_hash mode (new, frontend-friendly)
    if (body.base_commit_hash && body.source_commit_hash && body.target_commit_hash) {
      const baseResult = await extractFacetsFromCommit(body.base_commit_hash);
      const sourceResult = await extractFacetsFromCommit(body.source_commit_hash);
      const targetResult = await extractFacetsFromCommit(body.target_commit_hash);

      // Handle errors for each commit
      for (const [name, result] of [
        ["base", baseResult],
        ["source", sourceResult],
        ["target", targetResult],
      ] as const) {
        if (!result.ok) {
          const status = result.error === "corrupted" ? 500 :
                         result.error === "commit_not_found" || result.error === "turn_not_found" ? 404 : 400;
          const code = result.error === "corrupted" ? "DATA_CORRUPTED" :
                       result.error === "no_rings" ? "NO_RINGS" :
                       result.error === "no_turn_window" ? "NO_TURN_WINDOW" : "NOT_FOUND";
          sendJson(res, status, errorResponse(code, `${name}: ${result.message}`));
          return;
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
      sendJson(res, 400, errorResponse(
        "INVALID_REQUEST",
        "Provide either (base_commit_hash, source_commit_hash, target_commit_hash) or (baseFacets, sourceFacets, targetFacets)"
      ));
      return;
    }

    try {
      // Create LLM provider if auto-resolve is requested and API key is available
      let llmProvider;
      if (autoResolveConflicts && providers.anthropicApiKey) {
        llmProvider = createClaudeProvider({ apiKey: providers.anthropicApiKey });
      }

      // Create merge engine and execute
      const mergeEngine = createMergeEngine({
        llmProvider,
        autoResolveConflicts: autoResolveConflicts && !!llmProvider,
      });
      const result = await mergeEngine.merge(baseFacets, sourceFacets, targetFacets);

      sendJson(res, 200, successResponse(result));
    } catch (error) {
      sendJson(res, 500, errorResponse(
        "MERGE_FAILED",
        (error as Error).message
      ));
    }
  });

  // POST /api/v1/merge/resolve
  router.post("/api/v1/merge/resolve", async (ctx, _req, res) => {
    // Validate request body
    const body = ctx.body as ResolveRequest | null;
    if (!body || !body.mergeResult || !body.resolutions) {
      sendJson(res, 400, errorResponse(
        "INVALID_REQUEST",
        "Request body must include 'mergeResult' and 'resolutions'"
      ));
      return;
    }

    try {
      // Create merge engine and apply resolutions
      const mergeEngine = createMergeEngine();
      const resolutionMap = new Map(Object.entries(body.resolutions));
      const result = mergeEngine.applyResolutions(body.mergeResult, resolutionMap);

      sendJson(res, 200, successResponse(result));
    } catch (error) {
      sendJson(res, 500, errorResponse(
        "RESOLVE_FAILED",
        (error as Error).message
      ));
    }
  });
}
