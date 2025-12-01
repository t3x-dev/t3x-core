/**
 * Diff Routes
 *
 * POST /api/v1/diff/two-way - Two-way semantic diff
 * POST /api/v1/diff/three-way - Three-way semantic diff
 */

import type { ServerResponse } from "node:http";
import { Router, sendJson } from "../router";
import { successResponse, errorResponse, ProviderConfig } from "../types";
import {
  EmbeddingProvider,
  EmbeddingProviderError,
  createGoogleAIEmbeddingProvider,
} from "../../core/providers/embedding";
import { createDiffEngine, DiffSegment } from "../../core/diff";

/**
 * Two-way diff request body
 */
interface TwoWayDiffRequest {
  baseId: string;
  baseSegments: DiffSegment[];
  targetId: string;
  targetSegments: DiffSegment[];
  threshold?: number;
}

/**
 * Three-way diff request body
 */
interface ThreeWayDiffRequest {
  baseId: string;
  baseSegments: DiffSegment[];
  sourceId: string;
  sourceSegments: DiffSegment[];
  targetId: string;
  targetSegments: DiffSegment[];
  threshold?: number;
}

/**
 * Create embedding provider based on configuration
 */
function createEmbeddingProvider(providers: ProviderConfig): EmbeddingProvider {
  if (!providers.googleAIStudioKey) {
    throw new EmbeddingProviderError(
      "google-ai",
      undefined,
      "Google AI Studio API key not configured. Set GOOGLE_AI_STUDIO_KEY in your config."
    );
  }
  return createGoogleAIEmbeddingProvider({
    apiKey: providers.googleAIStudioKey,
  });
}

/**
 * Register diff routes
 */
export function registerDiffRoutes(router: Router, providers: ProviderConfig): void {
  // POST /api/v1/diff/two-way
  router.post("/api/v1/diff/two-way", async (ctx, _req, res) => {
    // Validate request body
    const body = ctx.body as TwoWayDiffRequest | null;
    if (!body || !body.baseId || !body.targetId) {
      sendJson(res, 400, errorResponse(
        "INVALID_REQUEST",
        "Request body must include 'baseId', 'baseSegments', 'targetId', and 'targetSegments'"
      ));
      return;
    }

    const baseSegments = body.baseSegments ?? [];
    const targetSegments = body.targetSegments ?? [];

    try {
      // Create embedding provider based on configuration
      const embeddingProvider = createEmbeddingProvider(providers);
      const diffEngine = createDiffEngine(embeddingProvider, {
        threshold: body.threshold,
      });

      // Perform two-way diff
      const result = await diffEngine.diffTwoWay(
        body.baseId,
        baseSegments,
        body.targetId,
        targetSegments
      );

      sendJson(res, 200, successResponse(result));
    } catch (error) {
      if (error instanceof EmbeddingProviderError) {
        sendJson(res, 503, errorResponse(
          "PROVIDER_ERROR",
          error.message
        ));
        return;
      }

      sendJson(res, 500, errorResponse(
        "DIFF_FAILED",
        (error as Error).message
      ));
    }
  });

  // POST /api/v1/diff/three-way
  router.post("/api/v1/diff/three-way", async (ctx, _req, res) => {
    // Validate request body
    const body = ctx.body as ThreeWayDiffRequest | null;
    if (!body || !body.baseId || !body.sourceId || !body.targetId) {
      sendJson(res, 400, errorResponse(
        "INVALID_REQUEST",
        "Request body must include 'baseId', 'sourceId', 'targetId' and their segments"
      ));
      return;
    }

    const baseSegments = body.baseSegments ?? [];
    const sourceSegments = body.sourceSegments ?? [];
    const targetSegments = body.targetSegments ?? [];

    try {
      // Create embedding provider based on configuration
      const embeddingProvider = createEmbeddingProvider(providers);
      const diffEngine = createDiffEngine(embeddingProvider, {
        threshold: body.threshold,
      });

      // Perform three-way diff
      const result = await diffEngine.diffThreeWay(
        body.baseId,
        baseSegments,
        body.sourceId,
        sourceSegments,
        body.targetId,
        targetSegments
      );

      sendJson(res, 200, successResponse(result));
    } catch (error) {
      if (error instanceof EmbeddingProviderError) {
        sendJson(res, 503, errorResponse(
          "PROVIDER_ERROR",
          error.message
        ));
        return;
      }

      sendJson(res, 500, errorResponse(
        "DIFF_FAILED",
        (error as Error).message
      ));
    }
  });
}
