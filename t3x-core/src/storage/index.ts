/**
 * Storage Module
 *
 * Provides unified storage root resolution and data access.
 * CLI/WebUI should import from here rather than implementing their own path logic.
 */

// Path resolution
export {
  type StorageRoot,
  resolveStorageRoot,
  detectLegacyStorageDirs,
  getStoragePaths,
} from './root';

// Types
export * from './types';

// Utils
export {
  generateProjectId,
  generateConversationId,
  generateBranchId,
  generateDraftId,
  generateMergeResultId,
  computeJCSHash,
  computeTurnHash,
  computeCommitHash,
  computeTextHash,
  isoNow,
} from './utils';

// Projects CRUD
export {
  createProject,
  getProject,
  getProjectWithStats,
  listProjects,
  updateProject,
  deleteProject,
} from './projects';

// Conversations CRUD
export {
  createConversation,
  getConversation,
  listConversations,
  updateConversation,
  deleteConversation,
  getConversationTurnCount,
} from './conversations';

// Turns V2 CRUD
export {
  createTurnV2,
  getTurnV2,
  listTurnsV2,
  listTurnsV2ByProject,
  getLastTurnInConversation,
  getTurnChain,
  TurnWindowError,
  getTurnsInWindow,
} from './turns';

// Branches CRUD
export {
  createBranch,
  getBranch,
  listBranches,
  getCurrentBranch,
  switchBranch,
  updateBranchHead,
  deleteBranch,
  ensureMainBranch,
} from './branches';

// Commits V2 CRUD
export {
  CommitError,
  createCommitV2,
  getCommitV2,
  listCommitsV2,
  getCommitParents,
  getCommitHistory,
  updateCommitPosition,
  findCommonAncestor,
} from './commits';

// Drafts V2 CRUD
export {
  createDraftV2,
  getDraftV2,
  listDraftsV2,
  updateDraftV2Status,
  adoptDraft,
  supersedeDraft,
  getDraftTextHash,
  deleteDraftV2,
} from './drafts';

// Merge Results CRUD
export {
  type CreateMergeResultInput,
  createMergeResult,
  getMergeResult,
  findMergeResult,
  listMergeResults,
  deleteMergeResult,
} from './mergeResults';

// Segment Embeddings CRUD
export {
  float32ArrayToBuffer,
  bufferToFloat32Array,
  generateSegmentId,
  createSegmentEmbedding,
  createSegmentEmbeddingsBatch,
  getSegmentEmbedding,
  getSegmentEmbeddingsByTurn,
  getSegmentEmbeddingsByTurns,
  hasEmbeddingsForTurn,
  deleteSegmentEmbeddingsByTurn,
  getEmbeddingsCountForTurn,
  getEmbeddingsByModel,
} from './segmentEmbeddings';

// Runs CRUD
export {
  type RunStatus,
  type RunRecord,
  type LeafInput,
  type WorkflowInput,
  type CreateRunInput,
  type UpdateRunInput,
  type ListRunsOptions,
  generateRunId,
  createRun,
  getRun,
  listRuns,
  updateRun,
  deleteRun,
} from './runs';
