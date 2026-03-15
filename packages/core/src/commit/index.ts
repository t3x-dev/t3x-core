/**
 * Commit Builders
 *
 * Utility functions for building CommitV3 components from existing data.
 */

// Author Builder
export {
  getDockerAuthor,
  getLocalAuthor,
  getWebAuthor,
} from './authorBuilder';

// Constraint Builder
export {
  buildConstraints,
  findBestSourceSentenceId,
} from './constraintBuilder';
// Sentence Builder
export { buildSentencesFromSegments } from './sentenceBuilder';

// Hash
export { computeCommitHash } from './hash';

// Legacy upgrade
export { upgradeLegacyCommit } from './legacy';

// Types (frame-based commit)
export { COMMIT_SCHEMA } from './types';
export type { Author, Commit, CommitFirstClass, Provenance, Source } from './types';
