/**
 * Core API Client
 *
 * Encapsulates all HTTP requests to core_api
 */

import { logger } from '../runtime/logger';

// ============================================================================
// Types
// ============================================================================

export interface CoreClientConfig {
  baseUrl: string;
  timeout?: number;
}

export interface ApiResponse<T> {
  status: 'ok' | 'error';
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  pagination?: {
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
  };
}

// Project types
export interface Project {
  project_id: string;
  name: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}

export interface ProjectListItem extends Project {
  conversations_count: number;
  turns_count: number;
}

export interface DeleteProjectResult {
  deleted: string;
  name: string;
  cascade_deleted: {
    turns: number;
    drafts: number;
    conversations: number;
    commits: number;
    branches: number;
    merge_results: number;
  };
}

// Conversation types
export interface Conversation {
  conversation_id: string;
  project_id: string;
  title?: string;
  created_at: string;
}

export interface ConversationListItem extends Conversation {
  turns_count: number;
}

// Turn types
export interface Turn {
  turn_hash: string;
  project_id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  parent_turn_hash?: string;
  created_at: string;
}

export interface TurnDetail extends Turn {
  rings: {
    ring1: {
      keywords: string[];
      entities: Array<{ text: string; type: string; start?: number; end?: number }>;
      time_anchor?: string;
      preference_keywords: Array<{ keyword: string; polarity: string; lemma: string }>;
    };
    ring2: {
      intent_seed?: string;
      time_window?: string;
      preference_soft: string[];
      unknown_slot: string[];
      facets: string[];
    };
    ring3: {
      segments: Array<{ id: string; text: string }>;
    };
  };
}

// Branch types
export interface Branch {
  branch_id: string;
  project_id: string;
  name: string;
  parent_branch?: string;
  head_commit_hash?: string;
  description?: string;
  is_current: boolean;
  created_at: string;
  updated_at: string;
}

export interface CurrentBranch {
  project_id: string;
  current_branch: string;
  head_commit_hash?: string;
}

// Commit types
export interface TurnWindow {
  start_turn_hash: string;
  end_turn_hash: string;
}

export interface Commit {
  commit_hash: string;
  project_id: string;
  branch: string;
  parent_hashes: string[];
  turn_window: TurnWindow;
  draft_ref?: { draft_id: string; text_hash: string };
  created_at: string;
  signature?: { algo: string; key_id: string; value: string };
}

export interface CommitListItem {
  commit_hash: string;
  project_id: string;
  branch: string;
  message?: string;
  parent_hashes: string[];
  created_at: string;
}

export interface CommitDetail extends Commit {
  facet_snapshot: Array<{
    facet: string;
    text: string;
    keywords: string[];
    evidence: Array<{ turn_hash: string; segment_id: string; similarity_score: number }>;
  }>;
  pipeline_config?: { id: string; sha256: string };
}

// Diff types
export interface DiffResult {
  base_commit_hash: string;
  target_commit_hash: string;
  diff: {
    facet_changes: Array<{
      facet: string;
      change_type: 'added' | 'removed' | 'modified';
      base_text?: string;
      target_text?: string;
      added_keywords: string[];
      removed_keywords: string[];
    }>;
    segment_changes: Array<{
      segment_id: string;
      change_type: string;
      text: string;
      similarity_to_base?: number;
    }>;
  };
  computed_at: string;
}

// Merge types
export interface MergeResult {
  merge_result_id: string;
  base_commit_hash: string;
  source_commit_hash: string;
  target_commit_hash: string;
  status: 'clean' | 'conflicts';
  auto_merged_facets: Array<{
    facet: string;
    merged_text: string;
    source: string;
    keywords: string[];
  }>;
  conflicts: Array<{
    facet: string;
    base_text?: string;
    source_text?: string;
    target_text?: string;
    conflict_type: string;
  }>;
  auto_merged_count: number;
  conflict_count: number;
  created_at: string;
}

// Health types
export interface HealthStatus {
  status: string;
  version: string;
  uptime: number;
}

export interface SystemStatus {
  projects_count: number;
  conversations_count: number;
  turns_count: number;
  commits_count: number;
  storage?: {
    database_size_bytes: number;
    ledger_files_count: number;
  };
}

// Bridge types (TS Embedded Server)
export interface BridgeInfo {
  bridge: string;
  label?: string;
  description?: string;
  threshold: number;
  locale?: string;
  version?: number;
  prompt?: string;
}

// Draft Workflow types (TS Embedded Server)
export interface DraftWorkflowResult {
  draftId: string;
  projectId: string;
  baseCommitHash?: string;
  turnAnchorHash?: string;
  bridgeId: string;
  bridgePayload: Record<string, unknown>;
  mustHave: string[];
  mustntHave: string[];
  text: string;
  status: 'ephemeral' | 'adopted' | 'superseded';
  createdAt: string;
  schemaVersion: string;
  evidenceSentences: Array<{
    segmentId: string;
    text: string;
    turnHash: string;
    similarityScore: number;
    keywords: string[];
    polarityKeywords: Record<string, number>;
  }>;
  validationIterations: number;
}

// Ring Extraction types (TS Embedded Server)
export interface RingExtractionResult {
  turnId: string;
  ring1: {
    keywords: Array<{
      text: string;
      lemma: string;
      pos: string;
      polarity: number;
    }>;
    entities: Array<{
      text: string;
      type: string;
      salience: number;
    }>;
    timeAnchor?: string;
    topic?: string;
  };
  ring2: {
    intentSeed?: string;
    timeWindow?: string;
    preferenceSoft: string[];
    unknownSlot: string[];
  };
  ring3: {
    segments: Array<{
      segmentId: string;
      text: string;
      beginOffset: number;
      endOffset: number;
    }>;
  };
}

// Merge with LLM types (TS Embedded Server)
export interface MergeWithLLMResult {
  autoMerged: Array<{
    facet: string;
    mergedText: string | null;
    source: 'base' | 'source' | 'target';
    keywords: string[];
  }>;
  conflicts: Array<{
    facet: string;
    baseText: string | null;
    sourceText: string | null;
    targetText: string | null;
    conflictType: string;
  }>;
  status: 'clean' | 'conflicts';
  stats: {
    totalFacets: number;
    autoMergedCount: number;
    conflictCount: number;
    llmResolvedCount: number;
    bySource: {
      base: number;
      source: number;
      target: number;
    };
  };
}

// Draft types (Python Agent)
export interface LLMConfig {
  provider: string;
  model: string;
  temperature: number;
  max_tokens: number;
}

export interface DraftValidation {
  passed: boolean;
  missing_keywords: string[];
  forbidden_keywords: string[];
}

export interface Draft {
  draft_id: string;
  project_id: string;
  conversation_id: string;
  status: 'pending' | 'ready' | 'failed';
  base_commit_hash?: string;
  turn_anchor_hash?: string;
  bridge_id: string;
  intent: string;
  text?: string;
  must_have: string[];
  mustnt_have: string[];
  validation?: DraftValidation;
  llm_config?: LLMConfig;
  created_at: string;
  completed_at?: string;
}

// ============================================================================
// Error class
// ============================================================================

export class CoreApiError extends Error {
  code: string;
  details?: Record<string, unknown>;
  statusCode?: number;

  constructor(code: string, message: string, details?: Record<string, unknown>, statusCode?: number) {
    super(message);
    this.name = 'CoreApiError';
    this.code = code;
    this.details = details;
    this.statusCode = statusCode;
  }
}

// ============================================================================
// Client class
// ============================================================================

export class CoreClient {
  private baseUrl: string;
  private timeout: number;

  constructor(config: CoreClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.timeout = config.timeout ?? 30000;
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    queryParams?: Record<string, string | number | undefined>
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);

    if (queryParams) {
      Object.entries(queryParams).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const options: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      };

      if (body && (method === 'POST' || method === 'PATCH' || method === 'PUT' || method === 'DELETE')) {
        options.body = JSON.stringify(body);
      }

      logger.trace('http', `${method} ${url.toString()}`);

      const response = await fetch(url.toString(), options);
      const data = await response.json() as ApiResponse<T>;

      if (data.status === 'error' && data.error) {
        throw new CoreApiError(
          data.error.code,
          data.error.message,
          data.error.details,
          response.status
        );
      }

      if (!response.ok) {
        throw new CoreApiError(
          'HTTP_ERROR',
          `HTTP ${response.status}: ${response.statusText}`,
          undefined,
          response.status
        );
      }

      return data.data as T;
    } catch (error) {
      if (error instanceof CoreApiError) {
        throw error;
      }
      if ((error as Error).name === 'AbortError') {
        throw new CoreApiError('TIMEOUT', `Request timeout after ${this.timeout}ms`);
      }
      throw new CoreApiError('NETWORK_ERROR', (error as Error).message);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async requestPaginated<T>(
    path: string,
    queryParams?: Record<string, string | number | undefined>
  ): Promise<{ data: T[]; pagination: ApiResponse<T>['pagination'] }> {
    const url = new URL(`${this.baseUrl}${path}`);

    if (queryParams) {
      Object.entries(queryParams).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      });

      const result = await response.json() as ApiResponse<T[]>;

      if (result.status === 'error' && result.error) {
        throw new CoreApiError(
          result.error.code,
          result.error.message,
          result.error.details,
          response.status
        );
      }

      return {
        data: result.data ?? [],
        pagination: result.pagination,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // --------------------------------------------------------------------------
  // Health & Status
  // --------------------------------------------------------------------------

  async health(): Promise<HealthStatus> {
    const url = new URL(`${this.baseUrl}/health`);
    const response = await fetch(url.toString());
    return response.json();
  }

  async status(): Promise<SystemStatus> {
    return this.request<SystemStatus>('GET', '/api/v1/status');
  }

  // --------------------------------------------------------------------------
  // Projects
  // --------------------------------------------------------------------------

  async createProject(name: string, metadata?: Record<string, unknown>): Promise<Project> {
    return this.request<Project>('POST', '/api/v1/projects', { name, metadata });
  }

  async listProjects(options?: { limit?: number; offset?: number }): Promise<{ data: ProjectListItem[]; pagination?: ApiResponse<ProjectListItem>['pagination'] }> {
    return this.requestPaginated<ProjectListItem>('/api/v1/projects', options);
  }

  async getProject(projectId: string): Promise<Project> {
    return this.request<Project>('GET', `/api/v1/projects/${encodeURIComponent(projectId)}`);
  }

  async deleteProject(projectId: string): Promise<DeleteProjectResult> {
    return this.request<DeleteProjectResult>('DELETE', `/api/v1/projects/${encodeURIComponent(projectId)}`);
  }

  // --------------------------------------------------------------------------
  // Conversations
  // --------------------------------------------------------------------------

  async createConversation(projectId: string, title?: string, metadata?: Record<string, unknown>): Promise<Conversation> {
    return this.request<Conversation>('POST', '/api/v1/conversations', {
      project_id: projectId,
      title,
      metadata,
    });
  }

  async listConversations(projectId: string, options?: { limit?: number; offset?: number }): Promise<{ data: ConversationListItem[]; pagination?: ApiResponse<ConversationListItem>['pagination'] }> {
    return this.requestPaginated<ConversationListItem>('/api/v1/conversations', {
      project_id: projectId,
      ...options,
    });
  }

  // --------------------------------------------------------------------------
  // Turns
  // --------------------------------------------------------------------------

  async createTurn(
    projectId: string,
    conversationId: string,
    role: 'user' | 'assistant' | 'system' | 'tool',
    content: string
  ): Promise<Turn> {
    return this.request<Turn>('POST', '/api/v1/turns', {
      project_id: projectId,
      conversation_id: conversationId,
      role,
      content,
    });
  }

  async listTurns(
    projectId: string,
    options?: {
      conversation_id?: string;
      role?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ data: Turn[]; pagination?: ApiResponse<Turn>['pagination'] }> {
    return this.requestPaginated<Turn>('/api/v1/turns', {
      project_id: projectId,
      ...options,
    });
  }

  async getTurn(turnHash: string): Promise<TurnDetail> {
    return this.request<TurnDetail>('GET', `/api/v1/turns/${turnHash}`);
  }

  // --------------------------------------------------------------------------
  // Branches
  // --------------------------------------------------------------------------

  async createBranch(
    projectId: string,
    name: string,
    options?: {
      from_branch?: string;
      description?: string;
      checkout?: boolean;
    }
  ): Promise<Branch> {
    return this.request<Branch>('POST', '/api/v1/branches', {
      project_id: projectId,
      name,
      ...options,
    });
  }

  async listBranches(
    projectId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<{ data: Branch[]; pagination?: ApiResponse<Branch>['pagination'] }> {
    return this.requestPaginated<Branch>('/api/v1/branches', {
      project_id: projectId,
      ...options,
    });
  }

  async switchBranch(
    projectId: string,
    name: string,
    options?: {
      create?: boolean;
      from_branch?: string;
      description?: string;
    }
  ): Promise<CurrentBranch> {
    return this.request<CurrentBranch>('POST', '/api/v1/branches/switch', {
      project_id: projectId,
      name,
      ...options,
    });
  }

  async deleteBranch(projectId: string, name: string, force: boolean = false): Promise<{ deleted: string }> {
    return this.request<{ deleted: string }>('DELETE', '/api/v1/branches', {
      project_id: projectId,
      name,
      force,
    });
  }

  async getCurrentBranch(projectId: string): Promise<CurrentBranch> {
    return this.request<CurrentBranch>('GET', '/api/v1/branches/current', undefined, {
      project_id: projectId,
    });
  }

  // --------------------------------------------------------------------------
  // Commits
  // --------------------------------------------------------------------------

  async createCommit(
    projectId: string,
    conversationId: string,
    turnWindow: TurnWindow,
    options?: {
      branch?: string;
      message?: string;
      draft_id?: string;
      sign?: boolean;
    }
  ): Promise<Commit> {
    return this.request<Commit>('POST', '/api/v1/commits', {
      project_id: projectId,
      conversation_id: conversationId,
      turn_window: turnWindow,
      branch: options?.branch ?? 'main',
      message: options?.message,
      draft_id: options?.draft_id,
      sign: options?.sign ?? false,
    });
  }

  async listCommits(
    projectId: string,
    options?: {
      branch?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ data: CommitListItem[]; pagination?: ApiResponse<CommitListItem>['pagination'] }> {
    return this.requestPaginated<CommitListItem>('/api/v1/commits', {
      project_id: projectId,
      ...options,
    });
  }

  async getCommit(commitHash: string): Promise<CommitDetail> {
    return this.request<CommitDetail>('GET', `/api/v1/commits/${commitHash}`);
  }

  // --------------------------------------------------------------------------
  // Diff
  // --------------------------------------------------------------------------

  async diff(baseCommitHash: string, targetCommitHash: string): Promise<DiffResult> {
    return this.request<DiffResult>('POST', '/api/v1/diff', {
      base_commit_hash: baseCommitHash,
      target_commit_hash: targetCommitHash,
    });
  }

  // --------------------------------------------------------------------------
  // Merge
  // --------------------------------------------------------------------------

  async merge(
    projectId: string,
    baseCommitHash: string,
    sourceCommitHash: string,
    targetCommitHash: string
  ): Promise<MergeResult> {
    return this.request<MergeResult>('POST', '/api/v1/merge', {
      project_id: projectId,
      base_commit_hash: baseCommitHash,
      source_commit_hash: sourceCommitHash,
      target_commit_hash: targetCommitHash,
    });
  }

  // --------------------------------------------------------------------------
  // Export
  // --------------------------------------------------------------------------

  async exportCfpack(projectId: string): Promise<unknown> {
    return this.request<unknown>('GET', '/api/v1/export/cfpack', undefined, {
      project_id: projectId,
    });
  }

  async exportLedger(projectId: string): Promise<unknown> {
    return this.request<unknown>('GET', '/api/v1/export/ledger', undefined, {
      project_id: projectId,
    });
  }

  // --------------------------------------------------------------------------
  // Drafts (Agentic Layer)
  // --------------------------------------------------------------------------

  async createDraft(
    projectId: string,
    conversationId: string,
    bridgeId: 'plan' | 'summary' | 'explain' | 'clarify',
    intent: string,
    options?: {
      base_commit_hash?: string;
      turn_anchor_hash?: string;
      llm_config?: Partial<LLMConfig>;
    }
  ): Promise<Draft> {
    return this.request<Draft>('POST', '/api/v1/agent/drafts', {
      project_id: projectId,
      conversation_id: conversationId,
      bridge_id: bridgeId,
      intent,
      base_commit_hash: options?.base_commit_hash,
      turn_anchor_hash: options?.turn_anchor_hash,
      llm_config: options?.llm_config,
    });
  }

  async getDraft(draftId: string): Promise<Draft> {
    return this.request<Draft>('GET', `/api/v1/agent/drafts/${draftId}`);
  }

  async updateDraft(
    draftId: string,
    options: {
      feedback?: string;
      append_must_have?: string[];
    }
  ): Promise<Draft> {
    return this.request<Draft>('PATCH', `/api/v1/agent/drafts/${draftId}`, options);
  }

  // --------------------------------------------------------------------------
  // Bridges (TS Embedded Server)
  // --------------------------------------------------------------------------

  /**
   * List all available bridges
   */
  async listBridges(): Promise<{ bridges: BridgeInfo[] }> {
    return this.request<{ bridges: BridgeInfo[] }>('GET', '/api/v1/bridges');
  }

  /**
   * Get specific bridge details
   */
  async getBridge(bridgeId: string): Promise<BridgeInfo> {
    return this.request<BridgeInfo>('GET', `/api/v1/bridges/${encodeURIComponent(bridgeId)}`);
  }

  /**
   * Reload bridges from disk
   */
  async reloadBridges(): Promise<{ message: string }> {
    return this.request<{ message: string }>('POST', '/api/v1/bridges/reload');
  }

  // --------------------------------------------------------------------------
  // Draft Workflow (TS Embedded Server - 6-step workflow)
  // --------------------------------------------------------------------------

  /**
   * Generate a draft using the 6-step workflow
   * This is different from the Python agent/drafts - it runs the complete workflow
   */
  async generateDraft(
    projectId: string,
    userIntent: string,
    turns: Array<{ turnHash: string; role: string; content: string }>,
    options?: {
      bridgeId?: string;
      similarityThreshold?: number;
      baseCommitHash?: string;
      turnAnchorHash?: string;
    }
  ): Promise<DraftWorkflowResult> {
    return this.request<DraftWorkflowResult>('POST', '/api/v1/draft', {
      projectId,
      userIntent,
      turns,
      bridgeId: options?.bridgeId ?? 'plan',
      similarityThreshold: options?.similarityThreshold,
      baseCommitHash: options?.baseCommitHash,
      turnAnchorHash: options?.turnAnchorHash,
    });
  }

  // --------------------------------------------------------------------------
  // Ring Extraction (TS Embedded Server)
  // --------------------------------------------------------------------------

  /**
   * Extract Ring 1/2/3 from text
   */
  async extractRings(
    turnId: string,
    content: string,
    language?: string
  ): Promise<RingExtractionResult> {
    return this.request<RingExtractionResult>('POST', '/api/v1/extract', {
      turnId,
      content,
      language,
    });
  }

  // --------------------------------------------------------------------------
  // Merge (TS Embedded Server - with LLM conflict resolution)
  // --------------------------------------------------------------------------

  /**
   * Execute three-way merge with optional LLM conflict resolution
   */
  async mergeWithLLM(
    baseFacets: Array<{ facet: string; text: string | null; keywords?: string[] }>,
    sourceFacets: Array<{ facet: string; text: string | null; keywords?: string[] }>,
    targetFacets: Array<{ facet: string; text: string | null; keywords?: string[] }>,
    autoResolveConflicts?: boolean
  ): Promise<MergeWithLLMResult> {
    return this.request<MergeWithLLMResult>('POST', '/api/v1/merge', {
      baseFacets,
      sourceFacets,
      targetFacets,
      autoResolveConflicts,
    });
  }

  // --------------------------------------------------------------------------
  // Chat (Streaming LLM)
  // --------------------------------------------------------------------------

  /**
   * Get available LLM providers
   */
  async listProviders(): Promise<{ providers: string[]; default: string }> {
    return this.request<{ providers: string[]; default: string }>('GET', '/api/v1/chat/providers');
  }

  /**
   * Non-streaming chat request
   */
  async chat(
    messages: Array<{ role: string; content: string }>,
    options?: {
      provider?: string;
      model?: string;
      temperature?: number;
      max_tokens?: number;
    }
  ): Promise<{ content: string; model: string; usage?: Record<string, number> }> {
    return this.request<{ content: string; model: string; usage?: Record<string, number> }>(
      'POST',
      '/api/v1/chat',
      {
        messages,
        provider: options?.provider ?? 'claude',
        model: options?.model,
        temperature: options?.temperature,
        max_tokens: options?.max_tokens,
      }
    );
  }

  /**
   * Streaming chat request using Server-Sent Events
   *
   * @param messages - Array of chat messages
   * @param onToken - Callback for each token received
   * @param options - Optional configuration
   * @returns Promise that resolves with the complete response when stream ends
   */
  async chatStream(
    messages: Array<{ role: string; content: string }>,
    onToken: (token: string) => void,
    options?: {
      provider?: string;
      model?: string;
      temperature?: number;
      max_tokens?: number;
      onError?: (error: Error) => void;
    }
  ): Promise<string> {
    const url = `${this.baseUrl}/api/v1/chat/stream`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout * 10); // Longer timeout for streaming

    try {
      logger.trace('http', `POST ${url} (streaming)`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages,
          provider: options?.provider ?? 'claude',
          model: options?.model,
          temperature: options?.temperature,
          max_tokens: options?.max_tokens,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new CoreApiError(
          'HTTP_ERROR',
          `HTTP ${response.status}: ${errorText}`,
          undefined,
          response.status
        );
      }

      if (!response.body) {
        throw new CoreApiError('STREAM_ERROR', 'Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let accumulated = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process SSE events
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? ''; // Keep incomplete line in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;

          const dataStr = trimmed.slice(5).trim();
          if (dataStr === '[DONE]') continue;

          try {
            const event = JSON.parse(dataStr) as {
              type: 'token' | 'done' | 'error';
              content?: string;
              message?: string;
              model?: string;
            };

            if (event.type === 'token' && event.content) {
              accumulated += event.content;
              onToken(event.content);
            } else if (event.type === 'error' && event.message) {
              throw new CoreApiError('STREAM_ERROR', event.message);
            } else if (event.type === 'done') {
              // Stream complete
              if (event.content) {
                accumulated = event.content;
              }
            }
          } catch (parseError) {
            if (parseError instanceof CoreApiError) throw parseError;
            // Ignore JSON parse errors for malformed events
            logger.trace('http', `Failed to parse SSE event: ${dataStr}`);
          }
        }
      }

      return accumulated;
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw new CoreApiError('TIMEOUT', `Stream timeout after ${this.timeout * 10}ms`);
      }
      if (error instanceof CoreApiError) throw error;
      throw new CoreApiError('STREAM_ERROR', (error as Error).message);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// ============================================================================
// Default instance
// ============================================================================

let defaultClient: CoreClient | null = null;
let embeddedClient: CoreClient | null = null;

export function getCoreClient(): CoreClient {
  if (!defaultClient) {
    defaultClient = new CoreClient({
      baseUrl: process.env.CORE_API_URL ?? 'http://127.0.0.1:8000',
    });
  }
  return defaultClient;
}

export function setCoreClient(client: CoreClient): void {
  defaultClient = client;
}

/**
 * Get the embedded server client (for TS-native APIs)
 * Used for bridges, draft workflow, etc.
 */
export function getEmbeddedClient(): CoreClient {
  if (!embeddedClient) {
    embeddedClient = new CoreClient({
      baseUrl: process.env.EMBEDDED_API_URL ?? 'http://127.0.0.1:8100',
    });
  }
  return embeddedClient;
}

/**
 * Set the embedded server client
 */
export function setEmbeddedClient(client: CoreClient): void {
  embeddedClient = client;
}
