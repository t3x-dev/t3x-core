/**
 * Storage Module (Pure)
 *
 * Provides type definitions and pure utility functions for T3X storage.
 * For actual CRUD operations, use @t3x-dev/storage package.
 */

// V4 Hash computation
export { type CommitV4FirstClass, computeCommitV4Hash } from './hash-v4';
// Types (pure type definitions)
export * from './types';
// Utils (pure functions - ID generation, hash computation, timestamps)
export {
  computeCommitHash,
  computeJCSHash,
  computeTextHash,
  computeTurnHash,
  // V4 ID generation
  generateAssertionId,
  // V3 ID generation
  generateBranchId,
  generateConstraintId,
  generateConversationId,
  generateDraftConstraintId,
  generateDraftId,
  generateDraftSentenceId,
  generateDraftV3Id,
  generateLeafHistoryId,
  generateLeafId,
  generateMergeDraftId,
  generatePinId,
  generateProjectId,
  generateSentenceId,
  isoNow,
} from './utils';
