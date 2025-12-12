/**
 * Embedding Providers
 *
 * Re-exports all embedding provider interfaces and implementations.
 */

// Re-export interfaces from @t3x/core
export {
  type EmbeddingProvider,
  EmbeddingProviderError,
  cosineSimilarity,
} from "@t3x/core";

// Export concrete implementations
export {
  GoogleAIEmbeddingProvider,
  GoogleAIEmbeddingConfig,
  createGoogleAIEmbeddingProvider,
} from "./googleAI";

// Export cached provider wrapper
export {
  CachedEmbeddingProvider,
  CachedEmbeddingConfig,
  createCachedEmbeddingProvider,
} from "./cached";

