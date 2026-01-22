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
// Commits V3
export {
  type CommitV3Author,
  type CommitV3Constraint,
  type CommitV3Content,
  type CommitV3Output,
  type CommitV3Sentence,
  type CommitV3SentenceSource,
  type CreateCommitV3Input,
  type CreateCommitV3Options,
  createCommitV3,
  deleteCommitV3,
  findCommitV3History,
  findCommonAncestorV3,
  getCommitV3,
  getCommitV3Parents,
  getCommitsV3ByHashes,
  type ListCommitsV3Options,
  listCommitsV3,
  ParentNotFoundError,
  updateCommitV3Position,
} from './commits-v3';
// Commits V4 (pure knowledge - no constraints)
export {
  computeCommitV4Hash,
  type CreateCommitV4Options,
  createCommitV4,
  deleteCommitV4,
  findCommitV4ByHash,
  findCommitsV4ByBranch,
  findCommitsV4ByProject,
  getCommitV4Parents,
  getCommitsV4ByHashes,
  type ListCommitsV4Options,
  ParentNotFoundErrorV4,
  updateCommitV4Position,
} from './commits-v4';
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
// Deploy Agents (for Deploy page, different from agent layer)
export {
  type CreateDeployAgentInput,
  deleteDeployAgent,
  findDeployAgentById,
  findDeployAgents,
  insertDeployAgent,
  type ListDeployAgentsOptions,
  type UpdateDeployAgentInput,
  updateDeployAgent,
  updateDeployAgentRunStatus,
} from './deployAgents';
// Runs (Engine → Runner → n8n flow)
export {
  type ConfigurationStats,
  type CreateRunInput,
  deleteRun,
  getConfigurationStats,
  getRun,
  getRunByRunnerRunId,
  getRunFilterOptions,
  getTimedOutRuns,
  insertRun,
  listRuns,
  type ListRunsOptions,
  markRunAsTimeout,
  type RunStatus,
  type UpdateRunInput,
  updateRun,
} from './runs';
// Merge Drafts (Pending merge operations)
export {
  cancelMergeDraft,
  commitMergeDraft,
  type CreateMergeDraftInput,
  createMergeDraft,
  deleteMergeDraft,
  findPendingMergeDraft,
  getMergeDraft,
  type ListMergeDraftsOptions,
  listMergeDraftsByProject,
  type MergeDraftStatus,
  type UpdateMergeDraftInput,
  updateMergeDraft,
} from './merge-drafts';
// Leaves (V4 - owns constraints, output, validation)
export {
  createLeaf,
  deleteLeaf,
  findLeafById,
  findLeavesByCommit,
  findLeavesByProject,
  getLeavesByIds,
  type ListLeavesOptions,
  type UpdateLeafInput,
  updateLeaf,
  updateLeafAssertions,
  updateLeafOutput,
} from './leaves';
// Pins (V4 - source selection for commits and context)
export {
  createPin,
  deletePin,
  deletePinByRef,
  findPinById,
  findPinByRef,
  findPinsByProject,
  findPinsByType,
  getPinsByIds,
  type ListPinsOptions,
  updatePinAssertions,
} from './pins';
// Conversation Contexts (per-conversation context customization)
export {
  deleteConversationContext,
  getConversationContext,
  setConversationContext,
} from './conversation-contexts';
