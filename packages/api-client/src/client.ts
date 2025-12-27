/**
 * T3X API Client
 *
 * Type-safe HTTP client for the T3X API.
 */

import type {
  ApiResponse,
  ApiSuccessResponse,
  Branch,
  ChatInput,
  ChatProvider,
  ChatResponse,
  Commit,
  Conversation,
  CreateBranchInput,
  CreateCommitInput,
  CreateConversationInput,
  CreateDraftInput,
  CreateProjectInput,
  CreateTurnInput,
  DiffResult,
  Draft,
  ExportCfpackInput,
  ExportLedgerInput,
  HealthResponse,
  ListBranchesResponse,
  ListCommitsResponse,
  ListConversationsResponse,
  ListDraftsResponse,
  ListProjectsResponse,
  ListTurnsResponse,
  MergeInput,
  MergeResult,
  PaginationParams,
  Project,
  ProjectWithStats,
  StatusResponse,
  ThreeWayDiffInput,
  Turn,
  TwoWayDiffInput,
  UpdateProjectInput,
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

  async health(): Promise<HealthResponse> {
    const response = await this.fetchFn(`${this.baseUrl}/health`, {
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

  async deleteProject(id: string): Promise<void> {
    await this.request<void>('DELETE', `/v1/projects/${id}`);
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
    return this.request<ListCommitsResponse>('GET', '/v1/commits', undefined, {
      project_id: projectId,
      branch,
      ...params,
    });
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
  // Diff
  // ============================================

  async twoWayDiff(input: TwoWayDiffInput): Promise<DiffResult> {
    return this.request<DiffResult>('POST', '/v1/diff/two-way', input);
  }

  async threeWayDiff(input: ThreeWayDiffInput): Promise<DiffResult> {
    return this.request<DiffResult>('POST', '/v1/diff/three-way', input);
  }

  // ============================================
  // Merge
  // ============================================

  async merge(input: MergeInput): Promise<MergeResult> {
    return this.request<MergeResult>('POST', '/v1/merge', input);
  }

  async resolveMerge(projectId: string, resolution: Record<string, unknown>): Promise<MergeResult> {
    return this.request<MergeResult>('POST', '/v1/merge/resolve', {
      project_id: projectId,
      resolution,
    });
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
}

/**
 * Create a T3X API client
 */
export function createClient(config: T3xClientConfig): T3xClient {
  return new T3xClient(config);
}
