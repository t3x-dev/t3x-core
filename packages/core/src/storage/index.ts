/**
 * Storage Module (Pure)
 *
 * Provides type definitions and pure utility functions for T3X storage.
 * For actual CRUD operations, use @t3x-dev/storage package.
 */

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
  generateAgentDraftId,
  generateDraftConstraintId,
  generateDraftId,
  generateDraftSentenceId,
  generateLeafHistoryId,
  generateLeafId,
  generateMergeDraftId,
  generatePinId,
  generateProjectId,
  generateSentenceId,
  isoNow,
} from './utils';
