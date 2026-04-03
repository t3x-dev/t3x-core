/**
 * T3X API Client
 *
 * Type-safe HTTP client for the T3X API.
 */

import type {
  ApiResponse,
  ApiSuccessResponse,
  ApplyYOpsResult,
  Branch,
  ChatInput,
  ChatProvider,
  ChatResponse,
  CheckInput,
  CheckResult,
  Commit,
  CommitFromDraftInput,
  CommitFromDraftResult,
  ContextParams,
  ContextResult,
  Conversation,
  CreateBranchInput,
  CreateCommitInput,
  CreateConversationInput,
  CreateDraftInput,
  CreateLeafInput,
  CreateProjectInput,
  CreateShareTokenInput,
  CreateTurnInput,
  CreateWebhookInput,
  DiffResult,
  Draft,
  ExportCfpackInput,
  ExportLedgerInput,
  ExtractInput,
  ExtractResult,
  GenerateLeafInput,
  HealthResponse,
  ImportUrlInput,
  ImportUrlPreviewResult,
  ImportUrlResult,
  Leaf,
  ListBranchesResponse,
  ListCommitsResponse,
  ListConversationsResponse,
  ListDraftsResponse,
  ListLeavesResponse,
  ListProjectsResponse,
  ListTurnsResponse,
  PaginationParams,
  PlatformImportResult,
  Project,
  ProjectWithStats,
  ShareToken,
  StatusResponse,
  Turn,
  TwoWayDiffInput,
  UpdateProjectInput,
  UpdateWebhookInput,
  Webhook,
} from './types.js';

export interface T3xClientConfig {
  baseUrl: string;
  headers?: Record<string, string>;
  fetch?: typeof fetch;
}

export class T3xApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'T3xApiError';
  }
}

export class T3xClient {
  private baseUrl: string;
  private headers: Record<string, string>;
  private fetchFn: typeof fetch;

  constructor(config: T3xClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.headers = {
      'Content-Type': 'application/json',
      ...config.headers,
    };
    this.fetchFn = config.fetch ?? fetch;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | number | undefined>
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);

    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      });
    }

    const response = await this.fetchFn(url.toString(), {
      method,
      headers: this.headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = (await response.json()) as ApiResponse<T>;

    if (!response.ok || !data.success) {
      const error = !data.success ? data.error : { code: 'UNKNOWN', message: 'Unknown error' };
      throw new T3xApiError(error.code, error.message, response.status);
    }

    return (data as ApiSuccessResponse<T>).data;
  }

  // ============================================
  // Health & Status
  // ============================================

  /** Root URL (strips /api suffix from baseUrl for root-level endpoints) */
  private get rootUrl(): string {
    return this.baseUrl.replace(/\/api$/, '');
  }

  async health(): Promise<HealthResponse> {
    const response = await this.fetchFn(`${this.rootUrl}/health`, {
      headers: this.headers,
    });
    return response.json() as Promise<HealthResponse>;
  }

  async status(): Promise<StatusResponse> {
    return this.request<StatusResponse>('GET', '/v1/status');
  }

  // ============================================
  // Projects
  // ============================================

  async listProjects(params?: PaginationParams): Promise<ListProjectsResponse> {
    return this.request<ListProjectsResponse>(
      'GET',
      '/v1/projects',
      undefined,
      params as Record<string, string | number | undefined>
    );
  }

  async getProject(id: string): Promise<ProjectWithStats> {
    return this.request<ProjectWithStats>('GET', `/v1/projects/${id}`);
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    return this.request<Project>('POST', '/v1/projects', input);
  }

  async updateProject(id: string, input: UpdateProjectInput): Promise<Project> {
    return this.request<Project>('PATCH', `/v1/projects/${id}`, input);
  }

  async deleteProject(id: string, options?: { permanent?: boolean }): Promise<void> {
    await this.request<void>('DELETE', `/v1/projects/${id}`, undefined,
      options?.permanent ? { permanent: 'true' } : undefined
    );
  }

  async restoreProject(id: string): Promise<Project> {
    return this.request<Project>('POST', `/v1/projects/${id}/restore`);
  }

  // ============================================
  // Conversations
  // ============================================

  async listConversations(
    projectId: string,
    params?: PaginationParams
  ): Promise<ListConversationsResponse> {
    return this.request<ListConversationsResponse>('GET', '/v1/conversations', undefined, {
      project_id: projectId,
      ...params,
    });
  }

  async getConversation(id: string): Promise<Conversation> {
    return this.request<Conversation>('GET', `/v1/conversations/${id}`);
  }

  async createConversation(input: CreateConversationInput): Promise<Conversation> {
    return this.request<Conversation>('POST', '/v1/conversations', input);
  }

  async deleteConversation(id: string): Promise<void> {
    await this.request<void>('DELETE', `/v1/conversations/${id}`);
  }

  // ============================================
  // Turns
  // ============================================

  async listTurns(conversationId: string, params?: PaginationParams): Promise<ListTurnsResponse> {
    return this.request<ListTurnsResponse>('GET', '/v1/turns', undefined, {
      conversation_id: conversationId,
      ...params,
    });
  }

  async getTurn(hash: string): Promise<Turn> {
    return this.request<Turn>('GET', `/v1/turns/${hash}`);
  }

  async getTurnChain(hash: string): Promise<Turn[]> {
    return this.request<Turn[]>('GET', `/v1/turns/${hash}/chain`);
  }

  async createTurn(input: CreateTurnInput): Promise<Turn> {
    return this.request<Turn>('POST', '/v1/turns', input);
  }

  // ============================================
  // Commits
  // ============================================

  async listCommits(
    projectId: string,
    branch?: string,
    params?: PaginationParams
  ): Promise<ListCommitsResponse> {
    return this.request<ListCommitsResponse>(
      'GET',
      `/v1/projects/${projectId}/commits`,
      undefined,
      { branch, ...params }
    );
  }

  async getCommit(hash: string): Promise<Commit> {
    return this.request<Commit>('GET', `/v1/commits/${hash}`);
  }

  async createCommit(input: CreateCommitInput): Promise<Commit> {
    return this.request<Commit>('POST', '/v1/commits', input);
  }

  // ============================================
  // Branches
  // ============================================

  async listBranches(projectId: string, params?: PaginationParams): Promise<ListBranchesResponse> {
    return this.request<ListBranchesResponse>('GET', '/v1/branches', undefined, {
      project_id: projectId,
      ...params,
    });
  }

  async getCurrentBranch(projectId: string): Promise<Branch> {
    return this.request<Branch>('GET', '/v1/branches/current', undefined, {
      project_id: projectId,
    });
  }

  async createBranch(input: CreateBranchInput): Promise<Branch> {
    return this.request<Branch>('POST', '/v1/branches', input);
  }

  async switchBranch(projectId: string, branchName: string): Promise<Branch> {
    return this.request<Branch>('POST', '/v1/branches/switch', {
      project_id: projectId,
      branch_name: branchName,
    });
  }

  // ============================================
  // Drafts
  // ============================================

  async listDrafts(projectId: string, params?: PaginationParams): Promise<ListDraftsResponse> {
    return this.request<ListDraftsResponse>('GET', '/v1/drafts', undefined, {
      project_id: projectId,
      ...params,
    });
  }

  async getDraft(id: string): Promise<Draft> {
    return this.request<Draft>('GET', `/v1/drafts/${id}`);
  }

  async createDraft(input: CreateDraftInput): Promise<Draft> {
    return this.request<Draft>('POST', '/v1/drafts', input);
  }

  async deleteDraft(id: string): Promise<void> {
    await this.request<void>('DELETE', `/v1/drafts/${id}`);
  }

  async applyYOps(
    draftId: string,
    yops: unknown[],
    ifRevision: number
  ): Promise<ApplyYOpsResult> {
    return this.request<ApplyYOpsResult>(
      'POST',
      `/v1/drafts/${draftId}/apply-yops`,
      { yops, if_revision: ifRevision }
    );
  }

  // ============================================
  // Agent Drafts
  // ============================================

  async listAgentDrafts(projectId: string, params?: PaginationParams): Promise<ListDraftsResponse> {
    return this.request<ListDraftsResponse>('GET', '/v1/agent/drafts', undefined, {
      project_id: projectId,
      ...params,
    });
  }

  async getAgentDraft(id: string): Promise<Draft> {
    return this.request<Draft>('GET', `/v1/agent/drafts/${id}`);
  }

  async createAgentDraft(input: CreateDraftInput): Promise<Draft> {
    return this.request<Draft>('POST', '/v1/agent/drafts', input);
  }

  // ============================================
  // Merge
  // ============================================

  async prepareMerge(input: { source_hash: string; target_hash: string }): Promise<unknown> {
    return this.request<unknown>('POST', '/v1/merge/prepare', input);
  }

  async executeMerge(input: {
    source_hash: string;
    target_hash: string;
    prepared: unknown;
    decisions: unknown;
    message: string;
    branch?: string;
  }): Promise<unknown> {
    return this.request<unknown>('POST', '/v1/merge/execute', input);
  }

  // ============================================
  // Diff
  // ============================================

  async twoWayDiff(input: TwoWayDiffInput): Promise<DiffResult> {
    return this.request<DiffResult>('POST', '/v1/diff/two-way', input);
  }

  // ============================================
  // Export
  // ============================================

  async exportCfpack(input: ExportCfpackInput): Promise<Blob> {
    const url = new URL(`${this.baseUrl}/v1/export/cfpack`);
    Object.entries(input).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    });

    const response = await this.fetchFn(url.toString(), {
      headers: this.headers,
    });

    if (!response.ok) {
      throw new T3xApiError('EXPORT_FAILED', 'Failed to export cfpack', response.status);
    }

    return response.blob();
  }

  async exportLedger(input: ExportLedgerInput): Promise<string> {
    const url = new URL(`${this.baseUrl}/v1/export/ledger`);
    Object.entries(input).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    });

    const response = await this.fetchFn(url.toString(), {
      headers: this.headers,
    });

    if (!response.ok) {
      throw new T3xApiError('EXPORT_FAILED', 'Failed to export ledger', response.status);
    }

    return response.text();
  }

  // ============================================
  // Chat
  // ============================================

  async chat(input: ChatInput): Promise<ChatResponse> {
    return this.request<ChatResponse>('POST', '/v1/chat', input);
  }

  async listChatProviders(): Promise<ChatProvider[]> {
    return this.request<ChatProvider[]>('GET', '/v1/chat/providers');
  }

  // ============================================
  // Leaves
  // ============================================

  async listLeaves(projectId: string): Promise<ListLeavesResponse> {
    return this.request<ListLeavesResponse>('GET', `/v1/projects/${projectId}/leaves`);
  }

  async getLeaf(id: string): Promise<Leaf> {
    return this.request<Leaf>('GET', `/v1/leaves/${id}`);
  }

  async createLeaf(input: CreateLeafInput): Promise<Leaf> {
    return this.request<Leaf>('POST', '/v1/leaves', input);
  }

  async generateLeaf(id: string, input?: GenerateLeafInput): Promise<Leaf> {
    return this.request<Leaf>('POST', `/v1/leaves/${id}/generate`, input);
  }

  async deleteLeaf(id: string): Promise<void> {
    await this.request<void>('DELETE', `/v1/leaves/${id}`);
  }

  // ============================================
  // Share Tokens
  // ============================================

  async createShareToken(input: CreateShareTokenInput): Promise<ShareToken> {
    return this.request<ShareToken>('POST', '/v1/share', input);
  }

  async listShareTokensByEntity(entityType: string, entityId: string): Promise<ShareToken[]> {
    return this.request<ShareToken[]>('GET', `/v1/share/entity/${entityType}/${entityId}`);
  }

  async revokeShareToken(id: string): Promise<void> {
    await this.request<void>('DELETE', `/v1/share/${id}`);
  }

  // ============================================
  // Webhooks
  // ============================================

  async listWebhooks(projectId?: string): Promise<Webhook[]> {
    return this.request<Webhook[]>('GET', '/v1/webhooks', undefined, {
      project_id: projectId,
    });
  }

  async createWebhook(input: CreateWebhookInput): Promise<Webhook> {
    return this.request<Webhook>('POST', '/v1/webhooks', input);
  }

  async updateWebhook(id: string, input: UpdateWebhookInput): Promise<Webhook> {
    return this.request<Webhook>('PATCH', `/v1/webhooks/${id}`, input);
  }

  async deleteWebhook(id: string): Promise<void> {
    await this.request<void>('DELETE', `/v1/webhooks/${id}`);
  }

  async testWebhook(id: string): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>('POST', `/v1/webhooks/${id}/test`);
  }

  // ============================================
  // Import
  // ============================================

  async importCfpack(data: unknown): Promise<{ project_id: string }> {
    return this.request<{ project_id: string }>('POST', '/v1/import/cfpack', data);
  }

  async previewUrl(input: ImportUrlInput): Promise<ImportUrlPreviewResult> {
    return this.request<ImportUrlPreviewResult>('POST', '/v1/import/url/preview', input);
  }

  async importUrl(input: ImportUrlInput): Promise<ImportUrlResult> {
    return this.request<ImportUrlResult>('POST', '/v1/import/url', input);
  }

  async importDocument(projectId: string, file: Blob, filename: string): Promise<ImportUrlResult> {
    const formData = new FormData();
    formData.append('file', file, filename);
    formData.append('project_id', projectId);

    const url = new URL(`${this.baseUrl}/v1/import/document`);
    const headers = { ...this.headers };
    // Remove Content-Type to let fetch set multipart boundary
    delete headers['Content-Type'];

    const response = await this.fetchFn(url.toString(), {
      method: 'POST',
      headers,
      body: formData,
    });

    const data = (await response.json()) as ApiResponse<ImportUrlResult>;
    if (!response.ok || !data.success) {
      const error = !data.success ? data.error : { code: 'UNKNOWN', message: 'Unknown error' };
      throw new T3xApiError(error.code, error.message, response.status);
    }
    return (data as ApiSuccessResponse<ImportUrlResult>).data;
  }

  async importPlatform(
    projectId: string,
    platformData: string,
    conversationIds?: string[]
  ): Promise<PlatformImportResult> {
    return this.request<PlatformImportResult>('POST', '/v1/import/platform', {
      project_id: projectId,
      platform_data: platformData,
      conversation_ids: conversationIds,
    });
  }

  // ============================================
  // Integration Verbs
  // ============================================

  async extract(input: ExtractInput): Promise<ExtractResult> {
    return this.request<ExtractResult>('POST', '/v1/extract', input);
  }

  async check(input: CheckInput): Promise<CheckResult> {
    return this.request<CheckResult>('POST', '/v1/check', input);
  }

  async context(projectId: string, params?: ContextParams): Promise<ContextResult> {
    return this.request<ContextResult>(
      'GET',
      `/v1/projects/${projectId}/context`,
      undefined,
      params as Record<string, string | number | undefined>
    );
  }

  async commitFromDraft(input: CommitFromDraftInput): Promise<CommitFromDraftResult> {
    return this.request<CommitFromDraftResult>('POST', '/v1/commit', input);
  }

  // ============================================
  // Readiness
  // ============================================

  async ready(): Promise<{ status: string; checks: { database: string } }> {
    const response = await this.fetchFn(`${this.rootUrl}/ready`, {
      headers: this.headers,
    });
    const json = (await response.json()) as ApiResponse<{
      status: string;
      checks: { database: string };
    }>;
    if (!response.ok || !json.success) {
      const err = !json.success ? json.error : { code: 'NOT_READY', message: 'Service not ready' };
      throw new T3xApiError(err.code, err.message, response.status);
    }
    return (json as ApiSuccessResponse<{ status: string; checks: { database: string } }>).data;
  }
}

/**
 * Create a T3X API client
 */
export function createClient(config: T3xClientConfig): T3xClient {
  return new T3xClient(config);
}
