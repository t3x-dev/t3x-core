/**
 * Queries Module
 *
 * CRUD operations using Drizzle ORM.
 * All functions take a database instance as first parameter.
 */

// Projects
export {
  type CreateProjectInput,
  type ListProjectsOptions,
  type ProjectStats,
  type ProjectWithStats,
  insertProject,
  findProjectById,
  findProjects,
  findProjectWithStats,
  updateProject,
  deleteProject,
} from './projects';

// Conversations
export {
  type CreateConversationInput,
  type ListConversationsOptions,
  type UpdateConversationInput,
  insertConversation,
  findConversationById,
  findConversationsByProject,
  updateConversation,
  deleteConversation,
  getConversationTurnCount,
} from './conversations';

// Turns
export {
  type CreateTurnInput,
  type ListTurnsOptions,
  TurnWindowError,
  insertTurn,
  findTurnByHash,
  findTurnsByConversation,
  findTurnsByProject,
  findLastTurnInConversation,
  findTurnChain,
  findTurnsInWindow,
} from './turns';

// Branches
export {
  type CreateBranchInput,
  type ListBranchesOptions,
  insertBranch,
  findBranchByName,
  findBranchById,
  findBranchesByProject,
  findCurrentBranch,
  switchBranch,
  updateBranchHead,
  deleteBranch,
  ensureMainBranch,
} from './branches';

// Commits
export {
  type TurnWindow,
  type CreateCommitInput,
  type ListCommitsOptions,
  CommitError,
  insertCommit,
  findCommitByHash,
  findCommitsByProject,
  findCommitParents,
  findCommitHistory,
  updateCommitPosition,
  findCommonAncestor,
} from './commits';

// Drafts
export {
  type DraftStatus,
  type CreateDraftInput,
  type ListDraftsOptions,
  type UpdateDraftInput,
  insertDraft,
  findDraftById,
  findDraftsByProject,
  updateDraft,
  updateDraftStatus,
  adoptDraft,
  supersedeDraft,
  getDraftTextHash,
  deleteDraft,
} from './drafts';

// Merge Results
export {
  type MergeStatus,
  type CreateMergeResultInput,
  insertMergeResult,
  findMergeResultById,
  findMergeResultByHashes,
  findMergeResultsByProject,
  deleteMergeResult,
} from './mergeResults';

// Segment Embeddings
export {
  type CreateSegmentEmbeddingInput,
  type CreateSegmentEmbeddingsBatchInput,
  generateSegmentId,
  float32ArrayToBuffer,
  bufferToFloat32Array,
  insertSegmentEmbedding,
  insertSegmentEmbeddingsBatch,
  findSegmentEmbeddingById,
  findSegmentEmbeddingsByTurn,
  findSegmentEmbeddingsByTurns,
  hasEmbeddingsForTurn,
  deleteSegmentEmbeddingsByTurn,
  getEmbeddingsCountForTurn,
  findEmbeddingsByModel,
} from './segmentEmbeddings';
