/**
 * Providers
 *
 * Re-exports from @t3x/core for backward compatibility.
 * These are now defined in the core package.
 */

// Re-export from @t3x/core
export {
  // Embedding providers
  GoogleAIEmbeddingProvider,
  createGoogleAIEmbeddingProvider,
  type GoogleAIEmbeddingConfig,
  CachedEmbeddingProvider,
  createCachedEmbeddingProvider,
  type CachedEmbeddingConfig,
  EmbeddingProviderError,
  cosineSimilarity,
  // LLM providers
  ClaudeProvider,
  createClaudeProvider,
  type ClaudeProviderConfig,
} from '@t3x/core';
