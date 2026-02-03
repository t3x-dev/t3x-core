/**
 * NLP Provider exports
 */

export {
  type DependencyLabel,
  type NLPAnalysis,
  type NLPEntity,
  type NLPProvider,
  NLPProviderError,
  type NLPSentence,
  type NLPToken,
  normalizeDependencyLabel,
  normalizePosTag,
  POS_TAG_MAPPING,
} from './base';

export {
  type CustomFetch,
  createGoogleCloudNLPProvider,
  type GoogleCloudNLPConfig,
  GoogleCloudNLPProvider,
} from './google-cloud';
