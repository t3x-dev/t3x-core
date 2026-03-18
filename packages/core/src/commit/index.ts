/**
 * Commit Module
 */

// Hash
export { computeCommitHash } from './hash';

// Legacy upgrade (V4 → V5 frame conversion, used by unified adapter)
export { upgradeLegacyCommit } from './legacy';
export type { Author, Commit, CommitFirstClass, Provenance, Source } from './types';
// Types (frame-based commit)
export { COMMIT_SCHEMA } from './types';
