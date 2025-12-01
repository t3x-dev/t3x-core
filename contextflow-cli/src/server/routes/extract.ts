/**
 * Ring Extraction Routes
 *
 * POST /api/v1/extract - Extract Ring 1/2/3 from text
 */

import type { ServerResponse } from "node:http";
import { Router, sendJson } from "../router";
import { successResponse, errorResponse, ProviderConfig } from "../types";
import {
  NLPProvider,
  NLPProviderError,
  createGoogleCloudNLPProvider,
} from "../../core/providers/nlp";
import { createRingExtractor } from "../../core/extractors";

/**
 * Extract request body
 */
interface ExtractRequest {
  turnId: string;
  content: string;
  language?: string;
}

/**
 * Create NLP provider based on configuration
 */
function createNLPProvider(providers: ProviderConfig): NLPProvider {
  if (!providers.googleCloudNLPKey) {
    throw new NLPProviderError(
      "google-cloud",
      undefined,
      "Google Cloud NLP API key not configured. Set GOOGLE_CLOUD_NLP_KEY in ~/.contextflow/config.json"
    );
  }
  return createGoogleCloudNLPProvider({
    apiKey: providers.googleCloudNLPKey,
  });
}

/**
 * Register extraction routes
 */
export function registerExtractRoutes(router: Router, providers: ProviderConfig): void {
  // POST /api/v1/extract
  router.post("/api/v1/extract", async (ctx, _req, res) => {
    // Validate request body
    const body = ctx.body as ExtractRequest | null;
    if (!body || !body.turnId || !body.content) {
      sendJson(res, 400, errorResponse(
        "INVALID_REQUEST",
        "Request body must include 'turnId' and 'content'"
      ));
      return;
    }

    try {
      // Create NLP provider based on configuration
      const nlpProvider = createNLPProvider(providers);
      const extractor = createRingExtractor(nlpProvider);

      // Determine language
      const language = body.language ?? (providers.defaultLanguage === "auto" ? undefined : providers.defaultLanguage);

      // Extract Ring
      const ringOutput = await extractor.extract(
        body.turnId,
        body.content,
        language
      );

      sendJson(res, 200, successResponse(ringOutput));
    } catch (error) {
      if (error instanceof NLPProviderError) {
        sendJson(res, 503, errorResponse(
          "PROVIDER_ERROR",
          error.message
        ));
        return;
      }

      sendJson(res, 500, errorResponse(
        "EXTRACTION_FAILED",
        (error as Error).message
      ));
    }
  });
}
