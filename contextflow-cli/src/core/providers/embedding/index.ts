/**
 * Embedding Providers
 *
 * Re-exports all embedding provider interfaces and implementations.
 */

// Re-export interfaces from @contextflow/core
export {
  type EmbeddingProvider,
  EmbeddingProviderError,
  cosineSimilarity,
} from "@contextflow/core";

// Export concrete implementations
export {
  GoogleAIEmbeddingProvider,
  GoogleAIEmbeddingConfig,
  createGoogleAIEmbeddingProvider,
} from "./googleAI";

