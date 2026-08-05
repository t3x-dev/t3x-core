/**
 * T3X API Client
 *
 * Type-safe HTTP client for the T3X API.
 */

import type {
  ApiErrorResponse,
  ApiResponse,
  ApiSuccessResponse,
  ApplyYOpsResult,
  AttachTransitionStatementInput,
  AttachTransitionStatementResult,
  Branch,
  CheckInput,
  CheckResult,
  CommitFromDraftInput,
  CommitFromDraftResult,
  CommitRepositoryStateInput,
  ContextParams,
  ContextResult,
  Conversation,
  ConversationSourceEvidence,
  CreateBranchInput,
  CreateConversationInput,
  CreateDraftInput,
  CreatedRepositoryCommit,
  CreateLeafInput,
  CreateMergeDraftInput,
  CreatePinInput,
  CreateProjectInput,
  CreateShareTokenInput,
  CreateTurnInput,
  CreateWebhookInput,
  CreateWorkspaceExtractionProposalInput,
  DiffResult,
  Draft,
  ExportCfpackInput,
  ExportLedgerInput,
  ExtractInput,
  ExtractResult,
  GenerateLeafInput,
  GenerationCapability,
  GenerationProviderCatalog,
  GenerationRequest,
  GenerationResponse,
  GenerationStreamEvent,
  GenerationStreamOptions,
  HealthResponse,
  ImportUrlInput,
  ImportUrlPreviewResult,
  ImportUrlResult,
  InspectTransitionResult,
  Leaf,
  ListBranchesResponse,
  ListCommitsResponse,
  ListConversationsResponse,
  ListDraftsResponse,
  ListLeavesResponse,
  ListPinsResponse,
  ListProjectsResponse,
  ListRepositoryWorkspacesResponse,
  ListTurnsResponse,
  MergeDraft,
  MergeDraftCommitInput,
  MergeDraftCommitResult,
  PaginationParams,
  Pin,
  PlatformImportResult,
  Project,
  ProjectWithStats,
  ProposeTransitionInput,
  ProposeTransitionResult,
  RenameConversationInput,
  RenameConversationResult,
  RepositoryWorkspaceCapability,
  RepositoryWorkspaceEnvelope,
  ShareToken,
  SourceThreadCapability,
  SourceThreadMemory,
  StatusResponse,
  StoredRepositoryCommit,
  Turn,
  TwoWayDiffInput,
  UpdateMergeDraftInput,
  UpdateProjectInput,
  UpdateWebhookInput,
  VerifyTransitionInput,
  VerifyTransitionResult,
  Webhook,
  WorkspaceExtractionProposalEnvelope,
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
    public status: number,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'T3xApiError';
  }
}

export class T3xClient {
  private baseUrl: string;
  private headers: Record<string, string>;
  private fetchFn: typeof fetch;

  /** Neutral model-invocation capability. Compatibility routes remain /v1/chat*. */
  readonly generation: GenerationCapability;
  /** Durable source metadata, immutable turns, context, and evidence. */
  readonly sourceThreads: SourceThreadCapability;
  /** Persisted Repository Review Workspace projections. */
  readonly workspaces: RepositoryWorkspaceCapability;

  constructor(config: T3xClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.headers = {
      'Content-Type': 'application/json',
      ...config.headers,
    };
    this.fetchFn = config.fetch ?? fetch;
    this.generation = Object.freeze<GenerationCapability>({
      complete: (input) => this.generate(input),
      stream: (input, options) => this.streamGeneration(input, options),
      providers: () => this.listGenerationProviders(),
    });
    this.sourceThreads = Object.freeze<SourceThreadCapability>({
      list: (projectId, params) => this.listSourceThreads(projectId, params),
      get: (id) => this.getSourceThread(id),
      create: (input) => this.createSourceThread(input),
      remove: (id) => this.deleteSourceThread(id),
      rename: (id, input) => this.renameSourceThread(id, input),
      listTurns: (conversationId, params) => this.listSourceThreadTurns(conversationId, params),
      getTurn: (hash) => this.getSourceThreadTurn(hash),
      getTurnChain: (hash) => this.getSourceThreadTurnChain(hash),
      appendTurn: (input) => this.appendSourceThreadTurn(input),
      memory: (id) => this.getSourceThreadMemory(id),
      evidence: (projectId, conversationId, params) =>
        this.getSourceThreadEvidence(projectId, conversationId, params),
    });
    this.workspaces = Object.freeze<RepositoryWorkspaceCapability>({
      list: (projectId) => this.listRepositoryWorkspaces(projectId),
      get: (projectId, workspaceId) => this.getRepositoryWorkspace(projectId, workspaceId),
      createExtractionProposal: (projectId, workspaceId, input) =>
        this.createWorkspaceExtractionProposal(projectId, workspaceId, input),
    });
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
      throw new T3xApiError(error.code, error.message, response.status, error.details);
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
    const json = (await response.json()) as
      | HealthResponse
      | ApiSuccessResponse<HealthResponse>
      | ApiErrorResponse;

    if (!response.ok) {
      if ('success' in json && !json.success) {
        throw new T3xApiError(json.error.code, json.error.message, response.status);
      }

      throw new T3xApiError(
        'UNKNOWN',
        response.statusText || 'Health check failed',
        response.status
      );
    }

    if ('success' in json) {
      if (!json.success) {
        throw new T3xApiError(json.error.code, json.error.message, response.status);
      }

      return json.data;
    }

    return json;
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
    await this.request<void>(
      'DELETE',
      `/v1/projects/${id}`,
      undefined,
      options?.permanent ? { permanent: 'true' } : undefined
    );
  }

  async restoreProject(id: string): Promise<Project> {
    return this.request<Project>('POST', `/v1/projects/${id}/restore`);
  }

  // ============================================
  // Source Threads
  // ============================================

  async listSourceThreads(
    projectId: string,
    params?: PaginationParams
  ): Promise<ListConversationsResponse> {
    return this.request<ListConversationsResponse>('GET', '/v1/conversations', undefined, {
      project_id: projectId,
      ...params,
    });
  }

  async getSourceThread(id: string): Promise<Conversation> {
    return this.request<Conversation>('GET', `/v1/conversations/${id}`);
  }

  async createSourceThread(input: CreateConversationInput): Promise<Conversation> {
    return this.request<Conversation>('POST', '/v1/conversations', input);
  }

  async deleteSourceThread(id: string): Promise<void> {
    await this.request<void>('DELETE', `/v1/conversations/${id}`);
  }

  async renameSourceThread(
    id: string,
    input: RenameConversationInput
  ): Promise<RenameConversationResult> {
    return this.request<RenameConversationResult>('PATCH', `/v1/conversations/${id}/rename`, input);
  }

  async getSourceThreadMemory(id: string): Promise<SourceThreadMemory> {
    return this.request<SourceThreadMemory>('GET', `/v1/conversations/${id}/memory`);
  }

  async getSourceThreadEvidence(
    projectId: string,
    conversationId: string,
    params?: PaginationParams
  ): Promise<ConversationSourceEvidence> {
    return this.request<ConversationSourceEvidence>(
      'GET',
      `/v1/projects/${encodeURIComponent(projectId)}/sources/conversations/${encodeURIComponent(
        conversationId
      )}`,
      undefined,
      {
        limit: params?.limit,
        offset: params?.offset,
      }
    );
  }

  // ============================================
  // Source Thread Turns
  // ============================================

  async listSourceThreadTurns(
    conversationId: string,
    params?: PaginationParams
  ): Promise<ListTurnsResponse> {
    return this.request<ListTurnsResponse>('GET', '/v1/turns', undefined, {
      conversation_id: conversationId,
      ...params,
    });
  }

  async getSourceThreadTurn(hash: string): Promise<Turn> {
    return this.request<Turn>('GET', `/v1/turns/${hash}`);
  }

  async getSourceThreadTurnChain(hash: string): Promise<Turn[]> {
    return this.request<Turn[]>('GET', `/v1/turns/${hash}/chain`);
  }

  async appendSourceThreadTurn(input: CreateTurnInput): Promise<Turn> {
    return this.request<Turn>('POST', '/v1/turns', input);
  }

  /** @deprecated Use sourceThreads.list() or listSourceThreads(). */
  async listConversations(
    projectId: string,
    params?: PaginationParams
  ): Promise<ListConversationsResponse> {
    return this.listSourceThreads(projectId, params);
  }

  /** @deprecated Use sourceThreads.get() or getSourceThread(). */
  async getConversation(id: string): Promise<Conversation> {
    return this.getSourceThread(id);
  }

  /** @deprecated Use sourceThreads.create() or createSourceThread(). */
  async createConversation(input: CreateConversationInput): Promise<Conversation> {
    return this.createSourceThread(input);
  }

  /** @deprecated Use sourceThreads.remove() or deleteSourceThread(). */
  async deleteConversation(id: string): Promise<void> {
    await this.deleteSourceThread(id);
  }

  /** @deprecated Use sourceThreads.rename() or renameSourceThread(). */
  async renameConversation(
    id: string,
    input: RenameConversationInput
  ): Promise<RenameConversationResult> {
    return this.renameSourceThread(id, input);
  }

  /** @deprecated Use sourceThreads.evidence() or getSourceThreadEvidence(). */
  async getConversationSourceEvidence(
    projectId: string,
    conversationId: string,
    params?: PaginationParams
  ): Promise<ConversationSourceEvidence> {
    return this.getSourceThreadEvidence(projectId, conversationId, params);
  }

  /** @deprecated Use sourceThreads.listTurns() or listSourceThreadTurns(). */
  async listTurns(conversationId: string, params?: PaginationParams): Promise<ListTurnsResponse> {
    return this.listSourceThreadTurns(conversationId, params);
  }

  /** @deprecated Use sourceThreads.getTurn() or getSourceThreadTurn(). */
  async getTurn(hash: string): Promise<Turn> {
    return this.getSourceThreadTurn(hash);
  }

  /** @deprecated Use sourceThreads.getTurnChain() or getSourceThreadTurnChain(). */
  async getTurnChain(hash: string): Promise<Turn[]> {
    return this.getSourceThreadTurnChain(hash);
  }

  /** @deprecated Use sourceThreads.appendTurn() or appendSourceThreadTurn(). */
  async createTurn(input: CreateTurnInput): Promise<Turn> {
    return this.appendSourceThreadTurn(input);
  }

  // ============================================
  // Commits
  // ============================================

  async listCommits(projectId: string, params?: PaginationParams): Promise<ListCommitsResponse> {
    return this.request<ListCommitsResponse>(
      'GET',
      `/v1/projects/${projectId}/commits`,
      undefined,
      { ...params }
    );
  }

  async getCommit(projectId: string, digest: string): Promise<StoredRepositoryCommit> {
    return this.request<StoredRepositoryCommit>(
      'GET',
      `/v1/commits/${encodeURIComponent(digest)}`,
      undefined,
      { project_id: projectId }
    );
  }

  async commitRepositoryState(input: CommitRepositoryStateInput): Promise<CreatedRepositoryCommit> {
    return this.request<CreatedRepositoryCommit>('POST', '/v1/commits', input);
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

  async applyYOps(draftId: string, yops: unknown[], ifRevision: number): Promise<ApplyYOpsResult> {
    return this.request<ApplyYOpsResult>('POST', `/v1/drafts/${draftId}/apply-yops`, {
      yops,
      if_revision: ifRevision,
    });
  }

  // ============================================
  // Agent Drafts
  // ============================================

  async getAgentDraft(id: string): Promise<Draft> {
    return this.request<Draft>('GET', `/v1/agent/drafts/${id}`);
  }

  async createAgentDraft(input: CreateDraftInput): Promise<Draft> {
    return this.request<Draft>('POST', '/v1/agent/drafts', input);
  }

  // ============================================
  // Merge
  // ============================================

  async prepareMerge(input: {
    project_id: string;
    source_hash: string;
    target_hash: string;
  }): Promise<unknown> {
    return this.request<unknown>('POST', '/v1/merge/prepare', input);
  }

  async executeMerge(input: {
    project_id: string;
    source_hash: string;
    target_hash: string;
    prepared: unknown;
    decisions: unknown;
    message: string;
    branch: string;
  }): Promise<unknown> {
    return this.request<unknown>('POST', '/v1/merge/execute', input);
  }

  // ============================================
  // Merge Drafts
  // ============================================

  async createMergeDraft(input: CreateMergeDraftInput): Promise<MergeDraft> {
    return this.request<MergeDraft>('POST', '/v1/merge/drafts', input);
  }

  async commitMergeDraft(
    id: string,
    input: MergeDraftCommitInput
  ): Promise<MergeDraftCommitResult> {
    return this.request<MergeDraftCommitResult>('POST', `/v1/merge/drafts/${id}/commit`, input);
  }

  async deleteMergeDraft(id: string): Promise<{ deleted: boolean }> {
    return this.request<{ deleted: boolean }>('DELETE', `/v1/merge/drafts/${id}`);
  }

  async getMergeDraft(id: string): Promise<MergeDraft> {
    return this.request<MergeDraft>('GET', `/v1/merge/drafts/${id}`);
  }

  async updateMergeDraft(id: string, input: UpdateMergeDraftInput): Promise<MergeDraft> {
    return this.request<MergeDraft>('PATCH', `/v1/merge/drafts/${id}`, input);
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
  // Generation
  // ============================================

  async generate(input: GenerationRequest): Promise<GenerationResponse> {
    return this.request<GenerationResponse>('POST', '/v1/chat', input);
  }

  async listGenerationProviders(): Promise<GenerationProviderCatalog> {
    return this.request<GenerationProviderCatalog>('GET', '/v1/chat/providers');
  }

  async *streamGeneration(
    input: GenerationRequest,
    options?: GenerationStreamOptions
  ): AsyncGenerator<GenerationStreamEvent, void, unknown> {
    const response = await this.fetchFn(`${this.baseUrl}/v1/chat/stream`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(input),
      signal: options?.signal,
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as ApiErrorResponse | null;
      const error = data?.success === false ? data.error : null;
      throw new T3xApiError(
        error?.code ?? 'GENERATION_FAILED',
        error?.message || response.statusText || 'Generation stream failed',
        response.status,
        error?.details
      );
    }
    if (response.body === null) {
      throw new T3xApiError(
        'GENERATION_STREAM_UNAVAILABLE',
        'Generation stream response has no body',
        response.status
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const records = buffer.split(/\r?\n\r?\n/);
        buffer = records.pop() ?? '';
        for (const record of records) {
          const data = record
            .split(/\r?\n/)
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trim())
            .join('\n');
          if (data.length === 0 || data === '[DONE]') continue;
          try {
            yield JSON.parse(data) as GenerationStreamEvent;
          } catch {
            // Ignore malformed upstream records. The server owns event validation.
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /** @deprecated Use generation.complete() or generate(). */
  async chat(input: GenerationRequest): Promise<GenerationResponse> {
    return this.generate(input);
  }

  /** @deprecated Use generation.providers() or listGenerationProviders(). */
  async listChatProviders(): Promise<GenerationProviderCatalog> {
    return this.listGenerationProviders();
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
  // Pins
  // ============================================

  async listPins(projectId: string): Promise<ListPinsResponse> {
    return this.request<ListPinsResponse>('GET', `/v1/projects/${projectId}/pins`);
  }

  async createPin(projectId: string, input: CreatePinInput): Promise<Pin> {
    return this.request<Pin>('POST', `/v1/projects/${projectId}/pins`, input);
  }

  async getPin(id: string): Promise<Pin> {
    return this.request<Pin>('GET', `/v1/pins/${id}`);
  }

  async deletePin(id: string): Promise<{ deleted: boolean }> {
    return this.request<{ deleted: boolean }>('DELETE', `/v1/pins/${id}`);
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

  async listRepositoryWorkspaces(projectId: string): Promise<ListRepositoryWorkspacesResponse> {
    return this.request<ListRepositoryWorkspacesResponse>(
      'GET',
      `/v1/projects/${encodeURIComponent(projectId)}/workspaces`
    );
  }

  async getRepositoryWorkspace(
    projectId: string,
    workspaceId: string
  ): Promise<RepositoryWorkspaceEnvelope> {
    return this.request<RepositoryWorkspaceEnvelope>(
      'GET',
      `/v1/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(workspaceId)}`
    );
  }

  async createWorkspaceExtractionProposal(
    projectId: string,
    workspaceId: string,
    input: CreateWorkspaceExtractionProposalInput
  ): Promise<WorkspaceExtractionProposalEnvelope> {
    return this.request<WorkspaceExtractionProposalEnvelope>(
      'POST',
      `/v1/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(workspaceId)}/extraction-proposals`,
      input
    );
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
  // Transition control plane
  // ============================================

  async proposeTransition(
    projectId: string,
    input: ProposeTransitionInput
  ): Promise<ProposeTransitionResult> {
    return this.request<ProposeTransitionResult>(
      'POST',
      `/v1/projects/${projectId}/transitions`,
      input
    );
  }

  async inspectTransition(
    projectId: string,
    transitionId: string
  ): Promise<InspectTransitionResult> {
    return this.request<InspectTransitionResult>(
      'GET',
      `/v1/projects/${projectId}/transitions/${transitionId}`
    );
  }

  async verifyTransition(
    projectId: string,
    transitionId: string,
    input: VerifyTransitionInput
  ): Promise<VerifyTransitionResult> {
    return this.request<VerifyTransitionResult>(
      'POST',
      `/v1/projects/${projectId}/transitions/${transitionId}/verify`,
      input
    );
  }

  async attachTransitionStatement(
    projectId: string,
    transitionId: string,
    input: AttachTransitionStatementInput
  ): Promise<AttachTransitionStatementResult> {
    return this.request<AttachTransitionStatementResult>(
      'POST',
      `/v1/projects/${projectId}/transitions/${transitionId}/statements`,
      input
    );
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
