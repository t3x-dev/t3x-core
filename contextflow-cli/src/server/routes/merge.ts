/**
 * Merge Routes
 *
 * POST /api/v1/merge - Execute three-way merge
 * POST /api/v1/merge/resolve - Apply conflict resolutions
 */

import type { ServerResponse } from "node:http";
import { Router, sendJson } from "../router";
import { successResponse, errorResponse, ProviderConfig } from "../types";
import { createMergeEngine, MergeFacet, MergeResult } from "../../core/merge";
import { createClaudeProvider } from "../../core/llm";

/**
 * Merge request body
 */
interface MergeRequest {
  baseFacets: MergeFacet[];
  sourceFacets: MergeFacet[];
  targetFacets: MergeFacet[];
  /** Auto-resolve conflicts using LLM */
  autoResolveConflicts?: boolean;
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
        "Request body must include 'baseFacets', 'sourceFacets', and 'targetFacets'"
      ));
      return;
    }

    const baseFacets = body.baseFacets ?? [];
    const sourceFacets = body.sourceFacets ?? [];
    const targetFacets = body.targetFacets ?? [];
    const autoResolveConflicts = body.autoResolveConflicts ?? false;

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
