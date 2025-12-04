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
} from './embedding';
