/**
 * T3X API Client Types
 */

import type {
  ActionCapabilityView,
  ClaimView,
  TransitionGraphViewV1 as CoreTransitionGraphViewV1,
} from '@t3x-dev/core';

// Common types
export interface PaginationParams {
  limit?: number;
  offset?: number;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// Project types
export interface Project {
  project_id: string;
  name: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

export interface ProjectWithStats extends Project {
  conversations_count: number;
  turns_count: number;
  commits_count: number;
  branches_count: number;
  drafts_count: number;
}

export interface CreateProjectInput {
  name: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateProjectInput {
  name?: string;
  metadata?: Record<string, unknown>;
}

export interface ListProjectsResponse {
  projects: Project[];
  limit: number;
  offset: number;
}

// Conversation types
export interface Conversation {
  conversation_id: string;
  project_id: string;
  title: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

export interface CreateConversationInput {
  project_id: string;
  title?: string;
  metadata?: Record<string, unknown>;
}

export interface ListConversationsResponse {
  conversations: Conversation[];
  limit: number;
  offset: number;
}

// Turn types
export type TurnRole = 'user' | 'assistant' | 'system' | 'tool';

export interface Turn {
  turn_hash: string;
  parent_turn_hash: string | null;
  project_id: string;
  conversation_id: string;
  role: TurnRole;
  content: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface CreateTurnInput {
  project_id: string;
  conversation_id: string;
  role: TurnRole;
  content: string;
  parent_turn_hash?: string;
  metadata?: Record<string, unknown>;
}

export interface ListTurnsResponse {
  turns: Turn[];
  limit: number;
  offset: number;
}

// Repository source/evidence types
export type SourceAvailabilityMode = 'available' | 'partial' | 'unavailable';
export type SourceAvailabilityReason = 'SOURCE_RECORD_MISSING' | 'TURN_PAGE_INCOMPLETE';

export interface ConversationSource {
  type: 'conversation';
  id: string;
  project_id: string;
  title: string | null;
  alias: string | null;
  parent_commit_hash: string | null;
  committed_as: string | null;
  committed_at: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
  provider: string | null;
  model: string | null;
}

export interface SourceEvidenceTurn {
  turn_hash: string;
  parent_turn_hash: string | null;
  role: TurnRole;
  content: string;
  language: string | null;
  rings: unknown | null;
  content_blocks: unknown[] | null;
  created_at: string;
}

export interface SourceEvidenceRevision {
  revision_id: string;
  turn_hash: string;
  turn_role: TurnRole;
  action: 'add' | 'edit' | 'delete';
  selected_text: string;
  replacement_text: string;
  content: string;
  spans: Array<{
    id: string;
    action: 'add' | 'edit' | 'delete';
    start: number;
    end: number;
    text: string;
    original_text: string;
  }>;
  base_content_hash: string;
  status: 'saved' | 'patched' | 'no_patch' | 'patch_failed' | 'synced' | 'discarded';
  created_at: string;
  updated_at: string;
}

export interface SourceCommitReference {
  commit_digest: string;
  recorded_at: string;
  intent: string | null;
  evidence_refs: Array<{
    resource: { uri: string; mediaType: string; digest: string };
    locator: { scheme: string; value: unknown };
  }>;
}

export interface ConversationSourceEvidence {
  availability: {
    mode: SourceAvailabilityMode;
    reasons: SourceAvailabilityReason[];
  };
  source: ConversationSource | null;
  turns: {
    items: SourceEvidenceTurn[];
    total: number;
    limit: number;
    offset: number;
    completeness: 'complete' | 'partial';
  };
  revisions: SourceEvidenceRevision[];
  evidence_selection: {
    mode: 'immutable_refs';
    turn_hashes: string[];
  };
  referring_commits: SourceCommitReference[];
}

export interface CommitDescriptorV2 {
  kind: 'commit';
  schema: 't3x/commit/v2';
  digest: string;
}

export interface RepositoryCommitV2 {
  schema: 't3x/commit/v2';
  parents: CommitDescriptorV2[];
  decision: { kind: 'statement'; schema: 't3x/statement/v1'; digest: string };
  result: { kind: 'state'; schema: 't3x/state/v1'; digest: string };
}

export interface CreatedRepositoryCommit {
  digest: string;
  ref_name: string;
  object: RepositoryCommitV2;
}

export interface StoredRepositoryCommit {
  digest: string;
  recorded_at: string;
  object: RepositoryCommitV2;
}

export interface CommitHistoryProjectionV2 {
  format: 'transition_v2';
  id: string;
  schema: 't3x/commit/v2';
  parents: string[];
  recordedAt: string;
  result: {
    mode: 'state_descriptor';
    descriptor: { kind: 'state'; schema: 't3x/state/v1'; digest: string };
  };
  assurance: {
    mode: 'decision_bound';
    decision: { kind: 'statement'; schema: 't3x/statement/v1'; digest: string };
  };
}

export interface CommitRepositoryStateInput {
  project_id: string;
  content: {
    trees: unknown[];
    relations?: unknown[];
  };
  branch?: string;
  expected_head: string | null;
  message?: string;
  source_conversation_id?: string;
}

export interface ListCommitsResponse {
  commits: CommitHistoryProjectionV2[];
}

// Branch types
export interface Branch {
  branch_id: string;
  project_id: string;
  name: string;
  head_commit_hash: string | null;
  created_at: string;
}

export interface CreateBranchInput {
  project_id: string;
  name: string;
  head_commit_hash?: string;
  parent_branch?: string;
  description?: string;
}

export interface ListBranchesResponse {
  branches: Branch[];
  limit: number;
  offset: number;
}

// Draft types
export interface Draft {
  draft_id: string;
  project_id: string;
  conversation_id: string;
  bridge_id: string;
  intent: string;
  status: 'pending' | 'active' | 'committed' | 'discarded';
  created_at: string;
  metadata: Record<string, unknown> | null;
}

export interface CreateDraftInput {
  project_id: string;
  conversation_id: string;
  bridge_id: string;
  intent: string;
  metadata?: Record<string, unknown>;
}

export interface ListDraftsResponse {
  drafts: Draft[];
  limit: number;
  offset: number;
}

// Apply YOps
export interface ApplyYOpsResult {
  draft_id: string;
  revision: number;
  trees: unknown[];
  applied_count: number;
  tree_count: number;
  slot_count: number;
}

// Diff types
export interface DiffResult {
  changes: DiffChange[];
  stats: {
    added: number;
    removed: number;
    modified: number;
  };
}

export interface DiffChange {
  type: 'added' | 'removed' | 'modified';
  path: string;
  old_value?: unknown;
  new_value?: unknown;
}

export interface TwoWayDiffInput {
  base_commit_hash: string;
  target_commit_hash: string;
}

// Merge draft types
export interface CreateMergeDraftInput {
  project_id: string;
  source_hash: string;
  target_hash: string;
  source_branch?: string;
  target_branch: string;
}

export interface MergeDraftPrepared {
  autoKept: string[];
  conflicts: Array<{
    path: string;
    slotConflicts: Array<{
      key: string;
      baseValue?: unknown;
      sourceValue?: unknown;
      targetValue?: unknown;
    }>;
  }>;
  onlyInSource: string[];
  onlyInTarget: string[];
  relationsOnlyInSource: Array<{ from: string; to: string; type: string }>;
  relationsOnlyInTarget: Array<{ from: string; to: string; type: string }>;
  relationsInBoth: Array<{ from: string; to: string; type: string }>;
}

export interface MergeDraft {
  draftId: string;
  projectId: string;
  sourceHash: string;
  targetHash: string;
  sourceBranch?: string;
  targetBranch?: string;
  status: 'pending' | 'committed' | 'cancelled';
  prepared: MergeDraftPrepared;
  message: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MergeDraftCommitInput {
  message: string;
  branch?: string;
  decisions?: {
    conflictResolutions?: Record<string, string>;
    keepFromSource?: string[];
    keepFromTarget?: string[];
    keepRelationsFromSource?: boolean;
    keepRelationsFromTarget?: boolean;
  };
}

export interface MergeSummary {
  kept_identical: number;
  resolved_conflicts: number;
  kept_from_source: number;
  kept_from_target: number;
  discarded: number;
  total_nodes: number;
}

export interface MergeDraftCommitResult {
  hash: string;
  parents: string[];
  author: { type: string; name: string; id?: string };
  committed_at: string;
  message: string;
  branch: string;
  merge_summary: MergeSummary;
}

// Merge draft update (for conflict resolution)
export interface MergeResolution {
  path: string;
  resolution: 'source' | 'target' | 'both' | { edit: { slots: Record<string, unknown> } };
  reasoning: string;
  resolved_at: string;
}

export interface UpdateMergeDraftInput {
  prepared?: unknown;
  message?: string;
  resolutions?: MergeResolution[];
}

// Rename conversation
export interface RenameConversationInput {
  alias: string;
}

export interface RenameConversationResult {
  conversation_id: string;
  alias: string;
}

// Pin types
export interface Pin {
  id: string;
  project_id: string;
  type: 'conversation' | 'conversation_turn' | 'leaf' | 'import';
  ref_id: string;
  selected_assertion_ids: string[];
  pinned_at: string;
}

export interface CreatePinInput {
  type: 'conversation' | 'conversation_turn' | 'leaf' | 'import';
  ref_id: string;
  selected_assertion_ids?: string[];
}

export interface ListPinsResponse {
  pins: Pin[];
}

// Export types
export interface ExportCfpackInput {
  project_id: string;
  conversation_id?: string;
  include_commits?: boolean;
}

export interface ExportLedgerInput {
  project_id: string;
  format?: 'jsonl' | 'json';
}

// Health types
export interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  version: string;
  uptime: number;
}

// Status types
export interface StatusResponse {
  version: string;
  environment: string;
  uptime_seconds: number;
  database: {
    connected: boolean;
    type: string;
  };
}

// Generation types
export type GenerationContentBlock =
  | { type: 'text'; text: string }
  | {
      type: 'image';
      source: {
        type: 'base64';
        media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
        data: string;
      };
    };

export interface GenerationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | GenerationContentBlock[];
}

export interface GenerationRequest {
  messages: GenerationMessage[];
  provider?: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  project_id?: string;
  web_search?: boolean;
  thinking?: boolean;
}

export interface GenerationResponse {
  content: string;
  model: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  finish_reason?: string;
}

export interface GenerationProviderCatalog {
  providers: string[];
  default: string;
}

export type GenerationStreamEvent =
  | { type: 'token'; content: string }
  | { type: 'thinking'; content: string }
  | { type: 'searching'; query?: string }
  | {
      type: 'done';
      content?: string;
      model?: string;
      usage?: { input_tokens?: number; output_tokens?: number };
      citations?: Array<{ url: string; title: string }>;
    }
  | { type: 'error'; message: string };

export interface GenerationStreamOptions {
  signal?: AbortSignal;
}

export interface SourceThreadMemory {
  text: string;
  token_estimate: number;
  sources: Array<{
    type: 'commit' | 'conversation' | 'leaf' | 'import';
    id: string;
    title?: string;
  }>;
}

export type SourceThread = Conversation;
export type CreateSourceThreadInput = CreateConversationInput;
export type ListSourceThreadsResponse = ListConversationsResponse;
export type RenameSourceThreadInput = RenameConversationInput;
export type RenameSourceThreadResult = RenameConversationResult;
export type SourceThreadTurn = Turn;
export type AppendSourceThreadTurnInput = CreateTurnInput;
export type ListSourceThreadTurnsResponse = ListTurnsResponse;
export type SourceThreadEvidence = ConversationSourceEvidence;

export interface GenerationCapability {
  complete(input: GenerationRequest): Promise<GenerationResponse>;
  stream(
    input: GenerationRequest,
    options?: GenerationStreamOptions
  ): AsyncGenerator<GenerationStreamEvent, void, unknown>;
  providers(): Promise<GenerationProviderCatalog>;
}

export interface SourceThreadCapability {
  list(projectId: string, params?: PaginationParams): Promise<ListSourceThreadsResponse>;
  get(id: string): Promise<SourceThread>;
  create(input: CreateSourceThreadInput): Promise<SourceThread>;
  remove(id: string): Promise<void>;
  rename(id: string, input: RenameSourceThreadInput): Promise<RenameSourceThreadResult>;
  listTurns(
    sourceThreadId: string,
    params?: PaginationParams
  ): Promise<ListSourceThreadTurnsResponse>;
  getTurn(hash: string): Promise<SourceThreadTurn>;
  getTurnChain(hash: string): Promise<SourceThreadTurn[]>;
  appendTurn(input: AppendSourceThreadTurnInput): Promise<SourceThreadTurn>;
  memory(id: string): Promise<SourceThreadMemory>;
  evidence(
    projectId: string,
    conversationId: string,
    params?: PaginationParams
  ): Promise<SourceThreadEvidence>;
}

/** Persisted Repository Review Workspace projection. */
export type RepositoryWorkspace = Record<string, unknown> & {
  id: string;
  projectId: string;
  revision?: number;
};

export interface ListRepositoryWorkspacesResponse {
  workspaces: RepositoryWorkspace[];
}

export interface RepositoryWorkspaceEnvelope {
  candidate_id: string;
  yops_draft_id?: string;
  workspace: RepositoryWorkspace;
}

export interface CreateWorkspaceExtractionProposalInput {
  source: {
    type: 'conversation';
    id: string;
    turn_hashes: string[];
  };
  provider?: string;
  model?: string;
  if_revision?: number;
}

export interface WorkspaceExtractionProposalEnvelope {
  candidate_id: string;
  proposal: Record<string, unknown> & {
    schema: 't3x.dev/workspace-extraction-proposal/v1';
    operations: unknown[];
  };
  workspace: RepositoryWorkspace;
}

/** Authenticated Repository Review Workspace operations. */
export interface RepositoryWorkspaceCapability {
  list(projectId: string): Promise<ListRepositoryWorkspacesResponse>;
  get(projectId: string, workspaceId: string): Promise<RepositoryWorkspaceEnvelope>;
  createExtractionProposal(
    projectId: string,
    workspaceId: string,
    input: CreateWorkspaceExtractionProposalInput
  ): Promise<WorkspaceExtractionProposalEnvelope>;
}

/** @deprecated Use GenerationMessage. */
export type ChatMessage = GenerationMessage;
/** @deprecated Use GenerationRequest. */
export type ChatInput = GenerationRequest;
/** @deprecated Use GenerationResponse. */
export type ChatResponse = GenerationResponse;
/** @deprecated Use GenerationProviderCatalog. */
export type ChatProvider = GenerationProviderCatalog;

// Leaf types
export interface Leaf {
  id: string;
  commit_hash: string;
  type: string;
  title: string | null;
  constraints: unknown[];
  config: Record<string, unknown> | null;
  output: string | null;
  assertions: unknown[];
  project_id: string;
  created_at: string;
}

export interface CreateLeafInput {
  commit_hash: string;
  type: string;
  title?: string;
  constraints?: unknown[];
  config?: Record<string, unknown>;
  project_id: string;
}

export interface GenerateLeafInput {
  model?: string;
  provider?: string;
}

export type ListLeavesResponse = Leaf[];

// Share types
export interface ShareToken {
  id: string;
  token: string;
  entity_type: string;
  entity_id: string;
  project_id: string;
  created_by: string | null;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
}

export interface CreateShareTokenInput {
  entity_type: string;
  entity_id: string;
  project_id: string;
  expires_in_hours?: number;
}

// Webhook types
export interface Webhook {
  webhook_id: string;
  project_id: string | null;
  url: string;
  events: string[];
  secret: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateWebhookInput {
  url: string;
  events: string[];
  secret?: string;
  project_id?: string;
}

export interface UpdateWebhookInput {
  url?: string;
  events?: string[];
  secret?: string;
  active?: boolean;
}

// Import types
export interface ImportCfpackResult {
  project_id: string;
  turns_imported: number;
  commits_imported: number;
}

// Backup types
export interface BackupResult {
  project_id: string;
  file_path: string;
}

export interface VerifyResult {
  valid: boolean;
  total: number;
  errors: string[];
}

// Import types (URL, document, platform)
export interface ImportUrlInput {
  url: string;
  project_id: string;
}

export interface ImportUrlPreviewResult {
  paragraphs: Array<{
    text: string;
    type: string;
    index: number;
  }>;
  metadata: Record<string, unknown>;
  estimated_turns: number;
  duplicate_warning?: string;
}

export interface ImportUrlResult {
  project_id: string;
  conversation_id: string;
  turns_imported: number;
  metadata: Record<string, unknown>;
  duplicate_warning?: string;
}

export interface PlatformImportResult {
  project_id: string;
  imported: Array<{
    source_id: string;
    conversation_id: string;
    turns_imported: number;
    title: string;
  }>;
  total_conversations: number;
  total_turns: number;
}

// ============================================
// Integration Verbs
// ============================================

// Extract
export interface ExtractInput {
  project_id: string;
  text: string;
  conversation_id?: string;
  source?: string;
}

export interface ExtractTree {
  key: string;
  slots: Record<string, unknown>;
  children: ExtractTree[];
  source?: string;
}

export interface DriftItem {
  node_path: string;
  before: string;
  after: string;
}

export interface ExtractResult {
  conversation_id: string;
  draft_id: string;
  trees: ExtractTree[];
  yaml?: string;
  drift?: DriftItem[];
}

// Commit from Draft
export interface CommitFromDraftInput {
  project_id: string;
  draft_id: string;
  message?: string;
  branch?: string;
}

export interface CommitFromDraftResult {
  commit_hash: string;
  tree_count: number;
  branch: string;
}

// Check
export interface CheckInput {
  project_id: string;
  text: string;
  leaf_ids?: string[];
}

export interface CheckViolation {
  leaf_id: string;
  constraint_id: string;
  type: 'require' | 'exclude';
  value: string;
  reason?: string;
}

export interface CheckResult {
  passed: boolean;
  violations: CheckViolation[];
}

// Context
export interface ContextParams {
  branch?: string;
  format?: 'json' | 'yaml';
}

export interface ContextResult {
  commit_hash: string | null;
  branch: string;
  trees: ExtractTree[];
  yaml?: string;
}

// ============================================
// Transition control plane
// ============================================

export type TransitionProtocolValue =
  | null
  | boolean
  | number
  | string
  | TransitionProtocolValue[]
  | { [key: string]: TransitionProtocolValue };

export interface TransitionActorRef {
  kind: 'human' | 'agent' | 'service';
  id: string;
}

export interface TransitionObjectDescriptor {
  kind: 'state' | 'effect' | 'statement' | 'commit';
  schema: string;
  digest: string;
}

export interface TransitionResourceSelector {
  path: string;
  material_id: string;
  content_hash?: string;
}

export interface TransitionSourceArtifactSelector {
  format: 't3x.dev/workspace-source-artifact/v1';
  root_path: string;
  resources?: TransitionResourceSelector[];
}

export interface TransitionSourceMaterialSelector {
  material_id: string;
  content_hash?: string;
}

export interface TransitionReplaceScalarOperation {
  op: 'replace_scalar';
  path: Array<string | number>;
  expect: string;
  value: string;
}

interface TransitionProposalRequestCommon {
  request_id: string;
  workspace_id: string;
  why?: string;
  if_revision?: number;
}

export type ProposeTransitionInput =
  | (TransitionProposalRequestCommon & {
      kind: 'structured_yops';
      operations: TransitionProtocolValue[];
      extraction_candidate_id?: never;
    })
  | (TransitionProposalRequestCommon & {
      kind: 'structured_yops';
      extraction_candidate_id: string;
      operations?: never;
    })
  | (TransitionProposalRequestCommon & {
      kind: 'exact_source_import';
      artifact: TransitionSourceArtifactSelector;
      root: TransitionSourceMaterialSelector;
    })
  | (TransitionProposalRequestCommon & {
      kind: 'exact_source_edit';
      artifact: TransitionSourceArtifactSelector;
      operations: TransitionReplaceScalarOperation[];
    })
  | (TransitionProposalRequestCommon & {
      kind: 'exact_source_revert';
      commit_id: string;
    });

export type TransitionClaimView = ClaimView;
export type TransitionActionCapabilityView = ActionCapabilityView;
export type TransitionGraphViewV1 = CoreTransitionGraphViewV1;
export type TransitionViewV1 = CoreTransitionGraphViewV1;

export interface TransitionStatementMembershipView {
  digest: string;
  source: string;
  issuer: TransitionActorRef;
  request_id: string;
  created_at: string;
}

export interface TransitionControlPlaneView {
  transition_id: string;
  project_id: string;
  workspace_id: string;
  request_kind:
    | 'structured_yops'
    | 'exact_source_import'
    | 'exact_source_edit'
    | 'exact_source_revert';
  request_id: string;
  created_at: string;
  precondition: {
    workspace_revision: number;
    ref_name: string;
    ref_head: string | null;
    effect_digest: string;
    proposal_digest: string;
    statement_digests: string[];
    policy_digest: string | null;
  };
  transition: TransitionViewV1;
  statements: TransitionStatementMembershipView[];
}

export interface ProposeTransitionResult {
  transition_id: string;
  reused: boolean;
  view: TransitionControlPlaneView;
}

export interface InspectTransitionResult {
  transition_id: string;
  view: TransitionControlPlaneView;
}

export interface VerifyTransitionInput {
  request_id: string;
}

export interface VerifyTransitionResult {
  transition_id: string;
  reused: boolean;
  view: TransitionControlPlaneView;
  statements: Array<{
    transitionId: string;
    statementDigest: string;
    source: string;
    issuer: TransitionActorRef;
    requestId: string;
    requestDigest: string;
    createdAt: string;
  }>;
  operational_results: Array<{
    source: string;
    outcome: 'no_statement' | 'failed';
    code: string;
    message: string;
  }>;
}

export interface AttachTransitionStatementInput {
  request_id: string;
  predicate_type: string;
  predicate: TransitionProtocolValue;
  subjects: Array<'effect' | 'result' | 'proposal'>;
}

export interface AttachTransitionStatementResult {
  transition_id: string;
  reused: boolean;
  view: TransitionControlPlaneView;
}

// ============================================
// YSchema Composition Registry
// ============================================

export interface YSchemaArtifactManifest {
  apiVersion: 't3x.dev/yschema-core/v1' | 't3x.dev/yschema-module/v1';
  canonicalName: string;
  version: string;
  family: 'esphome-device' | 'prd' | 'prompt' | 'skill';
  title: string;
  description: string;
  status: 'active' | 'deprecated' | 'draft';
  source: 'community' | 'official' | 'team';
  artifactHash?: string;
  visibility?: 'community' | 'official' | 'private' | 'team';
  ownerProjectId?: string | null;
  [key: string]: unknown;
}

export interface YSchemaArtifactRegistryPage {
  items: YSchemaArtifactManifest[];
  next_cursor: string | null;
  has_more: boolean;
}

export interface ProjectYSchemaVersionHistory {
  items: YSchemaArtifactManifest[];
}

export interface ListYSchemaArtifactsParams {
  projectId?: string;
  family?: 'esphome-device' | 'prd' | 'prompt' | 'skill';
  kind?: 'core' | 'module';
  visibility?: 'community' | 'official' | 'private' | 'team';
  search?: string;
  cursor?: string;
  limit?: number;
}

export interface YSchemaCompositionDraft {
  apiVersion: 't3x.dev/yschema-composition/v1';
  id: string;
  revision: number;
  family: 'esphome-device' | 'prd' | 'prompt' | 'skill';
  status: 'draft';
  core: { canonicalName: string; version: string; hash?: string };
  modules: Array<{
    canonicalName: string;
    version: string;
    order: number;
    slot?: string;
    hash?: string;
  }>;
}

export interface YSchemaCompositionPreview {
  schema: Record<string, unknown>;
  renderPlan: Array<{
    artifact: string;
    version: string;
    order: number;
    slot: string;
    nodePaths: string[];
  }>;
  originsByPath: Record<string, { artifact: string; version: string; kind: 'core' | 'module' }>;
  report: {
    valid: boolean;
    issues: Array<{
      code: string;
      message: string;
      blocking: boolean;
      module?: string;
      path?: string;
    }>;
  };
  compiledSchemaHash: string;
  compositionHash: string;
}

export interface WorkspaceYSchemaCompositionResult {
  composition: YSchemaCompositionDraft | null;
  workspaceRevision: number;
  preview?: YSchemaCompositionPreview;
  binding?: Record<string, unknown>;
}

export interface PublishWorkspaceYSchemaCompositionInput {
  compositionRevision: number;
  compositionHash: string;
  canonicalName: string;
  version: string;
  title: string;
  description?: string;
  releaseNotes?: string;
}

export interface TransitionReviewPrecondition {
  workspace_revision: number;
  ref_name: string;
  ref_head: string | null;
  effect_digest: string;
  proposal_digest: string;
  statement_digests: string[];
  policy_digest: string;
}

export interface DecideTransitionInput {
  request_id: string;
  outcome: 'accepted' | 'overridden' | 'rejected';
  rationale?: string;
  precondition: TransitionReviewPrecondition;
}

export interface DecideTransitionResult {
  transition_id: string;
  reused: boolean;
  decision_digest: string;
  decision: TransitionProtocolValue;
  view: TransitionControlPlaneView;
}

export interface CommitTransitionInput {
  request_id: string;
  decision_digest: string;
  expected_head: string | null;
}

export interface CommitTransitionResult {
  transition_id: string;
  reused: boolean;
  commit_digest: string;
  commit: TransitionProtocolValue;
  transition: TransitionViewV1;
  workspace?: Record<string, unknown>;
}
