/**
 * NLP Providers
 *
 * Re-exports all NLP provider interfaces and implementations.
 */

// Re-export interfaces from @contextflow/core
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
} from "@contextflow/core";

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

