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

export interface CreateCommitInput {
  project_id: string;
  content: {
    trees: unknown[];
    relations?: unknown[];
  };
  branch?: string;
  parents?: string[];
  message?: string;
  author?: {
    type: 'human' | 'agent' | 'system';
    id?: string;
    name?: string;
  };
  provenance?: {
    method: 'llm_extraction' | 'human_curation' | 'import' | 'merge';
    model?: string;
    extracted_at?: string;
  };
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
  base_hash: string;
  head_hash: string;
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
  service: string;
  timestamp: string;
  database?: {
    connected: boolean;
    latency_ms?: number;
  };
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

// Chat types
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatInput {
  messages: ChatMessage[];
  provider?: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
}

export interface ChatResponse {
  message: ChatMessage;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ChatProvider {
  id: string;
  name: string;
  models: string[];
}

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
  confidence?: number;
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
