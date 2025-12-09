/**
 * Draft Routes
 *
 * POST /api/v1/draft - Generate a draft using the 6-step workflow
 *
 * Supports cached embeddings when turn hashes are provided:
 * - If turnHashes[] is provided instead of turns[], cached embeddings are used
 * - Falls back to API calls for cache misses
 */

import path from "node:path";
import { Router, sendJson } from "../router";
import { successResponse, errorResponse, ProviderConfig } from "../types";
import { BridgeLoader } from "../../core/bridges";
import { createRingExtractor } from "../../core/extractors";
import { createGoogleCloudNLPProvider, NLPProviderError } from "../../core/providers/nlp";
import {
  createGoogleAIEmbeddingProvider,
  createCachedEmbeddingProvider,
  CachedEmbeddingProvider,
  EmbeddingProviderError,
} from "../../core/providers/embedding";
import { createClaudeProvider, LLMProviderError } from "../../core/llm";
import { createDraftWorkflow, Turn, DraftConfig } from "../../core/draft";
import {
  getTurnV2,
  getSegmentEmbeddingsByTurn,
} from "../../core/storage";

/**
 * Draft request body
 *
 * Supports two modes:
 * 1. turnHashes mode: Pass turn hashes, loads turns from DB and uses cached embeddings
 * 2. turns mode: Pass turns directly (legacy)
 */
interface DraftRequest {
  /** Project ID */
  projectId: string;
  /** User intent (what they want to accomplish) */
  userIntent: string;
  /** Mode 1: Turn hashes to load from database (preferred) */
  turnHashes?: string[];
  /** Mode 2: Conversation turns (legacy) */
  turns?: Turn[];
  /** Bridge ID to use (default: "plan") */
  bridgeId?: string;
  /** Similarity threshold override */
  similarityThreshold?: number;
  /** Base commit hash (optional) */
  baseCommitHash?: string;
  /** Turn anchor hash (optional) */
  turnAnchorHash?: string;
}

/**
 * Load turns from database by hashes
 * Returns { turns, missing } to allow caller to handle missing turns
 */
function loadTurnsFromHashes(turnHashes: string[]): { turns: Turn[]; missing: string[] } {
  const turns: Turn[] = [];
  const missing: string[] = [];

  for (const hash of turnHashes) {
    const turn = getTurnV2(hash);
    if (turn) {
      turns.push({
        turnHash: turn.turn_hash,
        content: turn.content,
        role: turn.role,
      });
    } else {
      missing.push(hash);
    }
  }

  return { turns, missing };
}

/**
 * Load cached embeddings into a CachedEmbeddingProvider
 * Uses setCacheFromRecords to validate embedding_model
 */
function loadCachedEmbeddingsIntoProvider(
  cachedProvider: CachedEmbeddingProvider,
  turnHashes: string[]
): number {
  let totalLoaded = 0;
  for (const turnHash of turnHashes) {
    const records = getSegmentEmbeddingsByTurn(turnHash);
    totalLoaded += cachedProvider.setCacheFromRecords(records);
  }
  return totalLoaded;
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
    if (!body || !body.projectId || !body.userIntent) {
      sendJson(res, 400, errorResponse(
        "INVALID_REQUEST",
        "Request body must include 'projectId' and 'userIntent'"
      ));
      return;
    }

    // Validate turns input (either turnHashes or turns)
    if (!body.turnHashes && !body.turns) {
      sendJson(res, 400, errorResponse(
        "INVALID_REQUEST",
        "Request body must include either 'turnHashes' or 'turns'"
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
      // Determine turns and whether to use cached embeddings
      let turns: Turn[];
      let usedCache = false;
      let missingTurns: string[] = [];

      if (body.turnHashes && body.turnHashes.length > 0) {
        // Mode 1: Load turns from database and use cached embeddings
        const result = loadTurnsFromHashes(body.turnHashes);
        turns = result.turns;
        missingTurns = result.missing;

        if (turns.length === 0) {
          sendJson(res, 404, errorResponse(
            "NOT_FOUND",
            `No turns found for the provided hashes: ${missingTurns.join(", ")}`
          ));
          return;
        }
        usedCache = true;
      } else {
        // Mode 2: Use provided turns (legacy)
        turns = body.turns!;
      }

      // Create providers
      const nlpProvider = createGoogleCloudNLPProvider({
        apiKey: providers.googleCloudNLPKey,
      });

      // Create base embedding provider
      const baseProvider = createGoogleAIEmbeddingProvider({
        apiKey: providers.googleAIStudioKey,
      });

      // Create embedding provider (with cache if using turnHashes mode)
      let embeddingProvider;
      let cacheStats: Record<string, unknown> | null = null;

      if (usedCache && body.turnHashes) {
        const cachedProvider = createCachedEmbeddingProvider(baseProvider);
        // Load cached embeddings with model validation
        const loaded = loadCachedEmbeddingsIntoProvider(cachedProvider, body.turnHashes);
        embeddingProvider = cachedProvider;
        cacheStats = { preloaded: loaded, ...cachedProvider.getCacheStats() };
      } else {
        embeddingProvider = baseProvider;
      }

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
      const workflowResult = await workflow.run(config, turns, body.userIntent);

      sendJson(res, 200, successResponse({
        ...workflowResult,
        usedCache,
        cacheStats,
        missingTurns: missingTurns.length > 0 ? missingTurns : undefined,
      }));
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
