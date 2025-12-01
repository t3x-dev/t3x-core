/**
 * Draft Routes
 *
 * POST /api/v1/draft - Generate a draft using the 6-step workflow
 */

import path from "node:path";
import { Router, sendJson } from "../router";
import { successResponse, errorResponse, ProviderConfig } from "../types";
import { BridgeLoader } from "../../core/bridges";
import { createRingExtractor } from "../../core/extractors";
import { createGoogleCloudNLPProvider, NLPProviderError } from "../../core/providers/nlp";
import { createGoogleAIEmbeddingProvider, EmbeddingProviderError } from "../../core/providers/embedding";
import { createClaudeProvider, LLMProviderError } from "../../core/llm";
import { createDraftWorkflow, Turn, DraftConfig } from "../../core/draft";

/**
 * Draft request body
 */
interface DraftRequest {
  /** Project ID */
  projectId: string;
  /** User intent (what they want to accomplish) */
  userIntent: string;
  /** Conversation turns to use as evidence */
  turns: Turn[];
  /** Bridge ID to use (default: "plan") */
  bridgeId?: string;
  /** Similarity threshold override */
  similarityThreshold?: number;
  /** Base commit hash (optional) */
  baseCommitHash?: string;
  /** Turn anchor hash (optional) */
  turnAnchorHash?: string;
}

// Shared bridge loader instance
let bridgeLoader: BridgeLoader | null = null;
let configuredBridgesDir: string | null = null;

/**
 * Get or create bridge loader
 */
async function getBridgeLoader(contextflowDir: string): Promise<BridgeLoader> {
  const bridgesDir = path.join(contextflowDir, "bridges");

  // Recreate if directory changed
  if (!bridgeLoader || configuredBridgesDir !== bridgesDir) {
    bridgeLoader = new BridgeLoader(bridgesDir);
    configuredBridgesDir = bridgesDir;
    await bridgeLoader.init();
  }
  return bridgeLoader;
}

/**
 * Register draft routes
 */
export function registerDraftRoutes(router: Router, providers: ProviderConfig, contextflowDir: string): void {
  // POST /api/v1/draft - Generate draft
  router.post("/api/v1/draft", async (ctx, _req, res) => {
    // Validate request body
    const body = ctx.body as DraftRequest | null;
    if (!body || !body.projectId || !body.userIntent || !body.turns) {
      sendJson(res, 400, errorResponse(
        "INVALID_REQUEST",
        "Request body must include 'projectId', 'userIntent', and 'turns'"
      ));
      return;
    }

    // Check required API keys
    if (!providers.googleCloudNLPKey) {
      sendJson(res, 503, errorResponse(
        "PROVIDER_ERROR",
        "Google Cloud NLP API key not configured"
      ));
      return;
    }

    if (!providers.googleAIStudioKey) {
      sendJson(res, 503, errorResponse(
        "PROVIDER_ERROR",
        "Google AI Studio API key not configured"
      ));
      return;
    }

    if (!providers.anthropicApiKey) {
      sendJson(res, 503, errorResponse(
        "PROVIDER_ERROR",
        "Anthropic API key not configured (required for draft generation)"
      ));
      return;
    }

    try {
      // Create providers
      const nlpProvider = createGoogleCloudNLPProvider({
        apiKey: providers.googleCloudNLPKey,
      });
      const embeddingProvider = createGoogleAIEmbeddingProvider({
        apiKey: providers.googleAIStudioKey,
      });
      const llmProvider = createClaudeProvider({
        apiKey: providers.anthropicApiKey,
      });

      // Create extractor and workflow
      const extractor = createRingExtractor(nlpProvider);
      const loader = await getBridgeLoader(contextflowDir);
      const workflow = createDraftWorkflow(
        loader,
        extractor,
        embeddingProvider,
        llmProvider
      );

      // Build config
      const config: DraftConfig = {
        projectId: body.projectId,
        bridgeId: body.bridgeId ?? "plan",
        similarityThreshold: body.similarityThreshold,
        baseCommitHash: body.baseCommitHash,
        turnAnchorHash: body.turnAnchorHash,
      };

      // Execute workflow
      const result = await workflow.run(config, body.turns, body.userIntent);

      sendJson(res, 200, successResponse(result));
    } catch (error) {
      if (error instanceof NLPProviderError) {
        sendJson(res, 503, errorResponse("NLP_PROVIDER_ERROR", error.message));
        return;
      }
      if (error instanceof EmbeddingProviderError) {
        sendJson(res, 503, errorResponse("EMBEDDING_PROVIDER_ERROR", error.message));
        return;
      }
      if (error instanceof LLMProviderError) {
        sendJson(res, 503, errorResponse("LLM_PROVIDER_ERROR", error.message));
        return;
      }

      sendJson(res, 500, errorResponse(
        "DRAFT_FAILED",
        (error as Error).message
      ));
    }
  });
}
