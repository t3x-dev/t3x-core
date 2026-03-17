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
  findActiveApiKeyByName,
  findApiKeyById,
  findApiKeyByValue,
  listApiKeys,
  revokeApiKey,
  touchLastUsed,
} from './api-keys';
// Autopilot
export {
  type AutopilotConfigOutput,
  getAutopilotConfig,
  updateAutopilotConfig,
} from './autopilot';
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
// Business Rules
export {
  type BusinessRuleConfig,
  getBusinessRules,
  putBusinessRules,
} from './business-rules';
// Commits (frame-based — commits_v5)
export {
  type CreateCommitInput,
  createCommit,
  deleteCommit,
  getCommit,
  getCommitsByHashes,
  getLatestCommit,
  type ListCommitsOptions,
  listCommits,
  updateCommitPosition,
} from './commits';
// Commits V4 (pure knowledge - no constraints)
export {
  backfillMerkleRoots,
  type CreateCommitV4Options,
  computeCommitV4Hash,
  createCommitV4,
  createCommitV4Atomic,
  deleteCommitV4,
  findCommitsV4ByBranch,
  findCommitsV4ByProject,
  findCommitV4ByHash,
  findCommitV4History,
  getCommitsV4ByHashes,
  getCommitV4Parents,
  type ListCommitsV4Options,
  MainBranchLinearityError,
  ParentHashIntegrityError,
  ParentNotFoundErrorV4,
  updateCommitV4Position,
  validateMainBranchLinearity,
  verifyMerkleRoots,
} from './commits-v4';
// Comparisons (saved A/B comparison snapshots)
export {
  type CreateComparisonInput,
  createComparison,
  deleteComparison,
  getComparison,
  type ListComparisonsOptions,
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
// Delta Log (Phase 2 — semantic delta tracking)
export {
  deleteDeltaLogEntry,
  getDeltaLogEntry,
  type InsertDeltaLogInput,
  insertDeltaLogEntry,
  listDeltaLogByConversation,
} from './delta-log';
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
// Drafts V3 (Workbench)
export {
  abandonDraftV3,
  ConflictError,
  commitDraftV3,
  deleteDraftV3,
  findAutoDraftsByConversation,
  findDraftV3ById,
  forkDraftV3,
  insertAutoDraftV3,
  insertDraftV3,
  type ListDraftV3Options,
  listDraftV3ByProject,
  NotFoundError,
  promoteDraftV3,
  type UpdateDraftV3Input,
  updateDraftV3,
  updateDraftV3Preview,
} from './drafts-v3';
// Extraction Feedback (Anchoring L4)
export {
  type AdaptiveFeedbackStats,
  type CosineBucketRow,
  type ExtractionFeedbackStats,
  getAdaptiveFeedbackStats,
  getExtractionFeedbackStats,
  getFeedbackByCosineBucket,
  type InsertExtractionFeedbackInput,
  insertExtractionFeedback,
  listExtractionFeedback,
} from './extraction-feedback';
// Global Settings (key-value config store)
export {
  deleteGlobalSetting,
  getGlobalSetting,
  listGlobalSettings,
  setGlobalSetting,
} from './global-settings';
// Knowledge Conflicts (conflict detection persistence)
export {
  countConflictsByProject,
  dismissConflict,
  findConflictById,
  findConflictsByProject,
  type InsertConflictInput,
  insertConflict,
  type KnowledgeConflictOutput,
  resolveConflict,
} from './knowledge-conflicts';
// Knowledge Graph (cross-conversation entity/topic graph)
export {
  deleteKnowledgeGraphByProject,
  findEdgesByNode,
  findKnowledgeNodeById,
  findKnowledgeNodesByProject,
  findMembersByNode,
  findNeighborNodes,
  findNodeBySentence,
  insertKnowledgeEdge,
  insertKnowledgeEdges,
  insertKnowledgeNode,
  insertKnowledgeNodes,
  insertNodeMembers,
  type KnowledgeEdgeOutput,
  type KnowledgeNodeOutput,
  type NeighborNodeOutput,
  type NodeMemberOutput,
  searchKnowledgeNodes,
} from './knowledge-graph';
// Leaf History (generation history for leaves)
export {
  type CreateLeafHistoryInputExtended,
  countHistoryByLeafId,
  createLeafHistory,
  deleteHistoryByLeafId,
  deleteLeafHistory,
  findHistoryByLeafId,
  findHistoryByLeafIdOrderedByAttempt,
  findLeafHistoryById,
  type ListLeafHistoryOptions,
} from './leaf-history';
// Leaf Output Edits (Item 17 — Constraint Reverse Learning)
export {
  type CreateLeafOutputEditInput,
  deleteEditsByLeafId,
  findEditsByLeafId,
  findEditsByProject,
  insertLeafOutputEdit,
  type ListLeafOutputEditsOptions,
} from './leaf-output-edits';
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
// Observable Metrics (event tracking)
export {
  getMetricsByProject,
  getMetricsInTimeRange,
  getMetricsSummary,
  type MetricsEventOutput,
  type MetricsSummaryRow,
  type RecordMetricInput,
  recordMetric,
} from './metrics';
// Notifications (persistent alerts, Item 16)
export {
  type CreateNotificationInput,
  deleteOldNotifications,
  getUnreadCount,
  insertNotification,
  type ListNotificationsOptions,
  listNotifications as listNotificationsFromDB,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationType,
} from './notifications';
// Cursor Pagination
export { type CursorPage, decodeCursor, encodeCursor, toCursorPage } from './pagination';
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
// Relations (Ring 4 — inter-sentence relationships)
export {
  deleteRelationsByCommit,
  findRelationsByCommit,
  findRelationsByProject,
  upsertRelations,
} from './relations';
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
// Sentence Modifications (audit trail)
export {
  findModificationsByDraft,
  type InsertSentenceModificationInput,
  insertSentenceModification,
} from './sentence-modifications';
// Sentence Vectors (pgvector similarity search + keyword search + hybrid RRF)
export {
  deleteSentenceVectorsByCommit,
  deleteSentenceVectorsByProject,
  findSentenceVectorsByProject,
  findSentenceVectorsWithEmbeddingsByProject,
  type HybridSearchResult,
  type KeywordSearchResult,
  rrfFusion,
  type SearchResult as SentenceVectorSearchResult,
  searchByKeyword,
  searchHybrid,
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
// Token Usage (LLM token metering)
export {
  estimateCost,
  getUsageByEndpoint,
  getUsageSummary,
  getUsageTotal,
  type RecordUsageInput,
  recordUsage,
  type TokenUsageOutput,
  type UsageByEndpointRow,
  type UsageSummaryOptions,
  type UsageSummaryRow,
  type UsageTotal,
  type UsageTotalOptions,
} from './token-usage';
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
// Users & Accounts (multi-provider authentication)
export {
  type CreateLocalUserInput,
  type CreateUserInput,
  createAccount,
  createLocalUser,
  createUser,
  findAccountByProvider,
  findAccountsByUser,
  findOrCreateUser,
  findUserByEmail,
  findUserById,
  findUserByUsername,
  updateUser,
} from './users';
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
