/**
 * Providers
 *
 * Re-exports from @t3x/core for backward compatibility.
 * These are now defined in the core package.
 */

// Re-export from @t3x/core
export {
  type CachedEmbeddingConfig,
  CachedEmbeddingProvider,
  // LLM providers
  ClaudeProvider,
  type ClaudeProviderConfig,
  cosineSimilarity,
  createCachedEmbeddingProvider,
  createClaudeProvider,
  createGoogleAIEmbeddingProvider,
  EmbeddingProviderError,
  type GoogleAIEmbeddingConfig,
  // Embedding providers
  GoogleAIEmbeddingProvider,
} from '@t3x/core';
