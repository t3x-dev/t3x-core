/**
 * Queries Module
 *
 * CRUD operations using Drizzle ORM.
 * All functions take a database instance as first parameter.
 */

// API Keys
export {
  type CreateApiKeyInput,
  createApiKey,
  findApiKeyById,
  findApiKeyByValue,
  listApiKeys,
  revokeApiKey,
  touchLastUsed,
} from './api-keys';
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
  getCommitsV3ByHashes,
  getCommitV3,
  getCommitV3Parents,
  type ListCommitsV3Options,
  listCommitsV3,
  ParentNotFoundError,
  updateCommitV3Position,
} from './commits-v3';
// Commits V4 (pure knowledge - no constraints)
export {
  type CreateCommitV4Options,
  computeCommitV4Hash,
  createCommitV4,
  deleteCommitV4,
  findCommitsV4ByBranch,
  findCommitsV4ByProject,
  findCommitV4ByHash,
  findCommitV4History,
  getCommitsV4ByHashes,
  getCommitV4Parents,
  type ListCommitsV4Options,
  MainBranchLinearityError,
  ParentNotFoundErrorV4,
  updateCommitV4Position,
  validateMainBranchLinearity,
} from './commits-v4';
// Comparisons (saved A/B comparison snapshots)
export {
  type CreateComparisonInput,
  createComparison,
  deleteComparison,
  getComparison,
  listComparisons,
} from './comparisons';
// Conversation Contexts (per-conversation context customization)
export {
  deleteConversationContext,
  getConversationContext,
  setConversationContext,
} from './conversation-contexts';
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
// Global Settings (key-value config store)
export {
  deleteGlobalSetting,
  getGlobalSetting,
  listGlobalSettings,
  setGlobalSetting,
} from './global-settings';
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
// Drafts V3 (Workbench)
export {
  abandonDraftV3,
  ConflictError,
  commitDraftV3,
  deleteDraftV3,
  findDraftV3ById,
  forkDraftV3,
  insertDraftV3,
  type ListDraftV3Options,
  listDraftV3ByProject,
  type UpdateDraftV3Input,
  updateDraftV3,
  updateDraftV3Preview,
} from './drafts-v3';
// Agent Drafts (formerly drafts_v2)
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
// Leaf History (generation history for leaves)
export {
  countHistoryByLeafId,
  createLeafHistory,
  deleteHistoryByLeafId,
  deleteLeafHistory,
  findHistoryByLeafId,
  findLeafHistoryById,
  type ListLeafHistoryOptions,
} from './leaf-history';
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
  updateLeafAtomic,
  updateLeafOutput,
  updateLeafRunnerAssertions,
} from './leaves';
// Merge Drafts (Pending merge operations)
export {
  type CreateMergeDraftInput,
  cancelMergeDraft,
  commitMergeDraft,
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
// Recipes (workflow automation)
export {
  type CreateRecipeInput,
  createRecipe,
  deleteRecipe,
  findRecipeById,
  findRecipesByEvent,
  listRecipesByProject,
  type RecipeOutput,
  type UpdateRecipeInput,
  updateRecipe,
} from './recipes';
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
  type ListRunsOptions,
  listRuns,
  markRunAsTimeout,
  type RunStatus,
  type UpdateRunInput,
  updateRun,
} from './runs';
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
// Sentence Vectors (pgvector similarity search)
export {
  deleteSentenceVectorsByCommit,
  deleteSentenceVectorsByProject,
  type SearchResult as SentenceVectorSearchResult,
  searchSimilarSentences,
  type UpsertSentenceVectorInput,
  upsertSentenceVector,
  upsertSentenceVectorsBatch,
} from './sentenceVectors';
// Share Tokens
export {
  type CreateShareTokenInput,
  createShareToken,
  findShareTokenById,
  findShareTokenByToken,
  findShareTokensByEntity,
  revokeShareToken,
} from './share-tokens';
// Templates (reusable prompt templates)
export {
  type CreateTemplateInput,
  createTemplate,
  deleteTemplate,
  findTemplateById,
  type ListTemplatesOptions,
  listTemplates,
} from './templates';
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
// Webhooks (event subscriptions)
export {
  type CreateWebhookInput as CreateWebhookStorageInput,
  createWebhook,
  deleteWebhook,
  findWebhookById,
  findWebhooksByEvent,
  listWebhooks,
  type UpdateWebhookInput as UpdateWebhookStorageInput,
  updateWebhook,
  type WebhookOutput,
} from './webhooks';
