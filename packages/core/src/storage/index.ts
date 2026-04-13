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
  computeJCSHash,
  computeTextHash,
  computeTurnHash,
  generateAgentDraftId,
  generateAssertionId,
  generateBranchId,
  generateConstraintId,
  generateConversationId,
  generateDraftConstraintId,
  generateDraftId,
  generateDraftNodeId,
  generateLeafHistoryId,
  generateLeafId,
  generateMergeDraftId,
  generatePinId,
  generateProjectId,
  generateNodeId,
  isoNow,
} from './utils';
