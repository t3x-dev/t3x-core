/**
 * Embedding Provider exports
 */

export {
  cosineSimilarity,
  type EmbeddingProvider,
  EmbeddingProviderError,
} from './base';
export {
  type CachedEmbeddingConfig,
  CachedEmbeddingProvider,
  createCachedEmbeddingProvider,
} from './cached';
export {
  createGoogleAIEmbeddingProvider,
  type GoogleAIEmbeddingConfig,
  GoogleAIEmbeddingProvider,
} from './google-ai';
export {
  createOllamaEmbeddingProvider,
  type OllamaEmbeddingConfig,
  OllamaEmbeddingProvider,
} from './ollama';
export {
  createOpenAIEmbeddingProvider,
  type OpenAIEmbeddingConfig,
  OpenAIEmbeddingProvider,
} from './openai';
