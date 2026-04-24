/**
 * Provider exports
 */

export {
  createDefaultProviderRegistry,
  type DefaultProviderRegistryOptions,
  registerDefaultProviders,
} from './default-registry';
// Embedding Provider
export {
  type CachedEmbeddingConfig,
  CachedEmbeddingProvider,
  cosineSimilarity,
  createCachedEmbeddingProvider,
  createGoogleAIEmbeddingProvider,
  createOllamaEmbeddingProvider,
  createOpenAIEmbeddingProvider,
  type EmbeddingProvider,
  EmbeddingProviderError,
  type GoogleAIEmbeddingConfig,
  // Implementations
  GoogleAIEmbeddingProvider,
  type OllamaEmbeddingConfig,
  OllamaEmbeddingProvider,
  type OpenAIEmbeddingConfig,
  OpenAIEmbeddingProvider,
} from './embedding';
// LLM Provider
export {
  ClaudeProvider,
  type ClaudeProviderConfig,
  createClaudeProvider,
  createGeminiProvider,
  createOpenAIProvider,
  GeminiProvider,
  type GeminiProviderConfig,
  OpenAIProvider,
  type OpenAIProviderConfig,
} from './llm';
// Provider Registry
export {
  AllProvidersFailedError,
  type AnyProvider,
  createProviderRegistry,
  type ProviderEntry,
  ProviderRegistry,
  type ProviderRole,
  type RegistryConfig,
  type ResolvedConfig,
  type RoleAssignment,
  type TestConnectionResult,
} from './registry';
