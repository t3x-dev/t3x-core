/**
 * T3X API Client Types
 */

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
export type SourceAvailabilityMode = 'available' | 'partial' | 'legacy' | 'unavailable';
export type SourceAvailabilityReason =
  | 'SOURCE_RECORD_MISSING'
  | 'TURN_PAGE_INCOMPLETE'
  | 'LEGACY_COMMIT_SOURCE_REFERENCE';

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
  format: 'legacy_v1';
  commit_id: string;
  branch: string;
  message: string | null;
  recorded_at: string;
  source_title: string | null;
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
    mode: 'not_recorded';
    turn_hashes: string[];
  };
  referring_commits: SourceCommitReference[];
}

// Commit types
export interface Commit {
  commit_hash: string;
  parent_hashes: string[];
  project_id: string;
  branch: string;
  message: string;
  turn_window: {
    start_turn_hash: string;
    end_turn_hash: string;
  };
  facet_snapshot: unknown[];
  pipeline_config: Record<string, unknown> | null;
  created_at: string;
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
  commits: Commit[];
  limit: number;
  offset: number;
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

export interface TransitionClaimView {
  mode: 'stated' | 'inferred' | 'authored' | 'unspecified';
  origin: 'request_source' | 'inferred' | 'actor_authored' | 'not_provided';
  value?: string;
  evidence: Array<{
    resource: { uri: string; mediaType: string; digest: string };
    locator: { scheme: string; value: TransitionProtocolValue };
  }>;
}

export interface TransitionActionCapabilityView {
  disposition: 'allowed' | 'denied' | 'not_applicable' | 'not_evaluated';
  reasons: Array<{ code: string; message: string }>;
}

export interface TransitionGraphViewV1 {
  schema: 't3x.dev/transition-view/v1';
  version: 1;
  mode: 'transition';
  change: {
    effect: TransitionObjectDescriptor;
    base: TransitionObjectDescriptor;
    result: TransitionObjectDescriptor;
    driver: { protocol: string; protocolVersion: string; specDigest: string };
    operations: TransitionProtocolValue[];
  };
  claims: {
    proposal: TransitionObjectDescriptor;
    actor: TransitionActorRef;
    intent: TransitionClaimView;
    rationale: TransitionClaimView;
  };
  checks: {
    objectIntegrity: 'verified' | 'not_checked';
    observationScope: { completeness: 'complete' | 'partial'; sources: string[] };
    replay: TransitionProtocolValue;
    validation: TransitionProtocolValue;
    runner: TransitionProtocolValue;
    humanConfirmation: TransitionProtocolValue;
  };
  decision: TransitionProtocolValue;
  history: TransitionProtocolValue;
  capabilities: {
    accept: TransitionActionCapabilityView;
    override: TransitionActionCapabilityView;
    reject: TransitionActionCapabilityView;
    commit: TransitionActionCapabilityView;
    revert: TransitionActionCapabilityView;
  };
  audit: TransitionProtocolValue;
}

export interface LegacyTransitionViewV1 {
  schema: 't3x.dev/transition-view/v1';
  version: 1;
  mode: 'legacy';
  change: TransitionProtocolValue;
  claims: TransitionProtocolValue;
  checks: TransitionProtocolValue;
  decision: TransitionProtocolValue;
  history: TransitionProtocolValue;
  capabilities: TransitionGraphViewV1['capabilities'];
  audit: TransitionProtocolValue;
}

export type TransitionViewV1 = TransitionGraphViewV1 | LegacyTransitionViewV1;

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
