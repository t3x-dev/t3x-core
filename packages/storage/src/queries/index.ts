/**
 * Queries Module
 *
 * CRUD operations using Drizzle ORM.
 * All functions take a database instance as first parameter.
 */

// Branches
export {
  type CreateBranchInput,
  deleteBranch,
  ensureMainBranch,
  findBranchById,
  findBranchByName,
  findBranchesByProject,
  findCurrentBranch,
  insertBranch,
  type ListBranchesOptions,
  switchBranch,
  updateBranchHead,
} from './branches';
// Commits
export {
  CommitError,
  type CreateCommitInput,
  findCommitByHash,
  findCommitHistory,
  findCommitParents,
  findCommitsByProject,
  findCommonAncestor,
  insertCommit,
  type ListCommitsOptions,
  type TurnWindow,
  updateCommitPosition,
} from './commits';
// Conversations
export {
  type CreateConversationInput,
  deleteConversation,
  findConversationById,
  findConversationsByProject,
  getConversationTurnCount,
  insertConversation,
  type ListConversationsOptions,
  type UpdateConversationInput,
  updateConversation,
} from './conversations';
// Drafts
export {
  adoptDraft,
  type CreateDraftInput,
  type DraftStatus,
  deleteDraft,
  findDraftById,
  findDraftsByProject,
  getDraftTextHash,
  insertDraft,
  type ListDraftsOptions,
  supersedeDraft,
  type UpdateDraftInput,
  updateDraft,
  updateDraftStatus,
} from './drafts';
// Merge Results
export {
  type CreateMergeResultInput,
  deleteMergeResult,
  findMergeResultByHashes,
  findMergeResultById,
  findMergeResultsByProject,
  insertMergeResult,
  type MergeStatus,
} from './mergeResults';
// Projects
export {
  type CreateProjectInput,
  deleteProject,
  findProjectById,
  findProjects,
  findProjectWithStats,
  insertProject,
  type ListProjectsOptions,
  type ProjectStats,
  type ProjectWithStats,
  updateProject,
} from './projects';
// Segment Embeddings
export {
  bufferToFloat32Array,
  type CreateSegmentEmbeddingInput,
  type CreateSegmentEmbeddingsBatchInput,
  deleteSegmentEmbeddingsByTurn,
  findEmbeddingsByModel,
  findSegmentEmbeddingById,
  findSegmentEmbeddingsByTurn,
  findSegmentEmbeddingsByTurns,
  float32ArrayToBuffer,
  generateSegmentId,
  getEmbeddingsCountForTurn,
  hasEmbeddingsForTurn,
  insertSegmentEmbedding,
  insertSegmentEmbeddingsBatch,
} from './segmentEmbeddings';
// Turns
export {
  type CreateTurnInput,
  findLastTurnInConversation,
  findTurnByHash,
  findTurnChain,
  findTurnsByConversation,
  findTurnsByProject,
  findTurnsInWindow,
  insertTurn,
  type ListTurnsByProjectOptions,
  type ListTurnsOptions,
  TurnWindowError,
} from './turns';
