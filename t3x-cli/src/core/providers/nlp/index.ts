/**
 * NLP Providers
 *
 * Re-exports all NLP provider interfaces and implementations.
 */

// Re-export interfaces from @t3x/core
export {
  type NLPProvider,
  NLPProviderError,
  type NLPAnalysis,
  type NLPToken,
  type NLPEntity,
  type NLPSentence,
  type DependencyLabel,
  normalizePosTag,
  normalizeDependencyLabel,
  POS_TAG_MAPPING,
} from "@t3x/core";

// Export concrete implementations
export {
  GoogleCloudNLPProvider,
  GoogleCloudNLPConfig,
  createGoogleCloudNLPProvider,
} from "./googleCloud";

export {
  MockNLPProvider,
  MockNLPResult,
  createMockNLPProvider,
} from "./mock";

