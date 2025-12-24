/**
 * Provider exports
 */

// NLP Provider
export {
  type DependencyLabel,
  type NLPToken,
  type NLPEntity,
  type NLPSentence,
  type NLPAnalysis,
  type NLPProvider,
  NLPProviderError,
  POS_TAG_MAPPING,
  normalizePosTag,
  normalizeDependencyLabel,
} from './nlp';

// Embedding Provider
export {
  type EmbeddingProvider,
  EmbeddingProviderError,
  cosineSimilarity,
  // Implementations
  GoogleAIEmbeddingProvider,
  createGoogleAIEmbeddingProvider,
  type GoogleAIEmbeddingConfig,
  CachedEmbeddingProvider,
  createCachedEmbeddingProvider,
  type CachedEmbeddingConfig,
} from './embedding';

// LLM Provider
export {
  ClaudeProvider,
  createClaudeProvider,
  type ClaudeProviderConfig,
} from './llm';
