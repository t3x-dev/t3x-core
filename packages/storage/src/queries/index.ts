/**
 * Queries Module
 *
 * CRUD operations using Drizzle ORM.
 * All functions take a database instance as first parameter.
 */

// Agent Drafts (formerly drafts_v2)
export {
  type AgentDraftStatus,
  adoptAgentDraft,
  type CreateAgentDraftInput,
  deleteAgentDraft,
  findAgentDraftById,
  findAgentDraftsByProject,
  getAgentDraftTextHash,
  insertAgentDraft,
  type ListAgentDraftsOptions,
  supersedeAgentDraft,
  type UpdateAgentDraftInput,
  updateAgentDraft,
  updateAgentDraftStatus,
} from './agent-drafts';
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
// Commits (tree-based)
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
// Commits Unified (transition adapter)
export { getCommitUnified, listCommitsUnified } from './commits-unified';
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
// YOps Log (Phase 2 — semantic yops tracking)
export {
  deleteYOpsLogEntry,
  getYOpsLogEntry,
  type InsertYOpsLogInput,
  insertYOpsLogEntry,
  listYOpsLogByConversation,
  listYOpsLogByTopic,
} from './yops-log';
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
// Drafts (Workbench)
export {
  abandonDraft,
  ConflictError,
  commitDraft,
  deleteDraft,
  findAutoDraftsByConversation,
  findDraftById,
  forkDraft,
  insertAutoDraft,
  insertDraft,
  type ListDraftOptions,
  listDraftsByProject,
  NotFoundError,
  promoteDraft,
  type UpdateDraftInput,
  updateDraft,
  updateDraftPreview,
} from './drafts';
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
// Tree State (source-of-truth for current trees)
export {
  clearManualEditedFlags,
  deleteTree,
  deleteTreeRelationByKey,
  deleteTreeRelationsByConversation,
  deleteTreeRelationsByTreeId,
  deleteTreesByConversation,
  getTreeByKey,
  listTreeRelationsByConversation,
  listTreesByConversation,
  type UpsertTreeInput,
  type UpsertTreeRelationInput,
  upsertTree,
  upsertTreeRelation,
} from './tree-state';
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
  findNodeByContentId,
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
// Leaves (owns constraints, output, validation)
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
// Pins (source selection for commits and context)
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
// Node Modifications (audit trail)
export {
  findModificationsByDraft,
  type InsertNodeModificationInput,
  insertNodeModification,
} from './node-modifications';
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
// Topics (multi-topic conversations)
export {
  createTopic,
  deleteTopic,
  getTopicById,
  listTopicsByConversation,
  updateTopic,
} from './topics';
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
