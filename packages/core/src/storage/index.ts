/**
 * Storage Module (Pure)
 *
 * Provides type definitions and pure utility functions for T3X storage.
 * For actual CRUD operations, use @t3x/storage package.
 */

// Types (pure type definitions)
export * from './types';

// Utils (pure functions - ID generation, hash computation, timestamps)
export {
  computeCommitHash,
  computeJCSHash,
  computeTextHash,
  computeTurnHash,
  // V3 ID generation
  generateBranchId,
  generateConversationId,
  generateDraftId,
  generateMergeDraftId,
  generateProjectId,
  // V4 ID generation
  generateAssertionId,
  generateConstraintId,
  generateLeafId,
  generatePinId,
  generateSentenceId,
  isoNow,
} from './utils';
