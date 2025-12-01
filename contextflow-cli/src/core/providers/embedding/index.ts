/**
 * Embedding Providers
 *
 * Re-exports all embedding provider interfaces and implementations.
 */

export {
  EmbeddingProvider,
  EmbeddingProviderError,
  cosineSimilarity,
} from "./base";

export {
  GoogleAIEmbeddingProvider,
  GoogleAIEmbeddingConfig,
  createGoogleAIEmbeddingProvider,
} from "./googleAI";

