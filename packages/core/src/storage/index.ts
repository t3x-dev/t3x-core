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
  generateBranchId,
  generateConversationId,
  generateDraftId,
  generateProjectId,
  isoNow,
} from './utils';
