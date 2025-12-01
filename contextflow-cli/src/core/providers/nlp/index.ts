/**
 * NLP Providers
 *
 * Re-exports all NLP provider interfaces and implementations.
 */

export {
  NLPProvider,
  NLPProviderError,
  NLPAnalysis,
  NLPToken,
  NLPEntity,
  NLPSentence,
  DependencyLabel,
  normalizePosTag,
  normalizeDependencyLabel,
  POS_TAG_MAPPING,
} from "./base";

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

