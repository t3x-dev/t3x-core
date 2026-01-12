/**
 * Commit Builders
 *
 * Utility functions for building CommitV3 components from existing data.
 */

// Sentence Builder
export { buildSentencesFromSegments } from './sentenceBuilder';

// Constraint Builder
export {
  buildConstraints,
  findBestSourceSentenceId,
} from './constraintBuilder';

// Author Builder
export {
  getLocalAuthor,
  getDockerAuthor,
  getWebAuthor,
} from './authorBuilder';
