/**
 * T3X API Client
 *
 * Type-safe HTTP client for the T3X API.
 */

import { ZodError, type ZodType } from 'zod';
import {
  type AcceptCollaborationInvitationRequest,
  type AcceptCollaborationInvitationResponse,
  AcceptCollaborationInvitationResponseSchema,
  type CollaborationMutationResult,
  CollaborationMutationResultSchema,
  type CreateCollaborationInvitationResponse,
  CreateCollaborationInvitationResponseSchema,
  type CreateNamespaceInvitationRequest,
  type CreateProjectInvitationRequest,
  type ListNamespaceAccountsResponse,
  ListNamespaceAccountsResponseSchema,
  type ListNamespaceInvitationsResponse,
  ListNamespaceInvitationsResponseSchema,
  type ListNamespaceMembersResponse,
  ListNamespaceMembersResponseSchema,
  type ListProjectGuestsResponse,
  ListProjectGuestsResponseSchema,
  type ListProjectInvitationsResponse,
  ListProjectInvitationsResponseSchema,
  type TransferNamespaceOwnershipRequest,
  type TransferProjectRequest,
  type UpsertNamespaceMemberRequest,
  type UpsertNamespaceMemberResponse,
  UpsertNamespaceMemberResponseSchema,
  type UpsertProjectGuestRequest,
  type UpsertProjectGuestResponse,
  UpsertProjectGuestResponseSchema,
} from './collaboration.js';
import {
  type DeploymentCapabilities,
  DeploymentCapabilitiesSchema,
} from './deployment-capabilities.js';
import { transitionResponseSchemas } from './transition-runtime.js';
import type {
  ApiErrorResponse,
  ApiResponse,
  ApiSuccessResponse,
  AttachTransitionStatementInput,
  AttachTransitionStatementResult,
  Branch,
  CheckInput,
  CheckResult,
  CommitRepositoryStateInput,
  CommitTransitionInput,
  CommitTransitionResult,
  ContextParams,
  ContextResult,
  Conversation,
  ConversationSourceEvidence,
  CreateBranchInput,
  CreateConversationInput,
  CreatedRepositoryCommit,
  CreateLeafInput,
  CreateMergeDraftInput,
  CreatePinInput,
  CreateProjectInput,
  CreateShareTokenInput,
  CreateTurnInput,
  CreateWebhookInput,
  CreateWorkspaceExtractionProposalInput,
  DecideTransitionInput,
  DecideTransitionResult,
  DecideWorkspaceTransitionInput,
  DiffResult,
  ExportCfpackInput,
  ExportLedgerInput,
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
  LegacyYOpsEvidence,
  LegacyYOpsEvidenceParams,
  ListBranchesResponse,
  ListCommitsResponse,
  ListConversationsResponse,
  ListLeavesResponse,
  ListPinsResponse,
  ListProjectsResponse,
  ListRepositoryWorkspacesResponse,
  ListTurnsResponse,
  ListWorkspaceTransitionReviewSnapshotsParams,
  ListWorkspaceTransitionReviewSnapshotsResponse,
  ListYSchemaArtifactsParams,
  MergeDraft,
  MergeDraftCommitInput,
  MergeDraftCommitResult,
  PaginationParams,
  Pin,
  PlatformImportResult,
  Project,
  ProjectWithStats,
  ProjectYSchemaVersionHistory,
  ProposeTransitionInput,
  ProposeTransitionResult,
  PublishWorkspaceYSchemaCompositionInput,
  RenameConversationInput,
  RenameConversationResult,
  RepositoryWorkspaceCapability,
  RepositoryWorkspaceEnvelope,
  ReviewWorkspaceTransitionInput,
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
  WorkspaceTransitionDecisionEnvelope,
  WorkspaceTransitionReviewEnvelope,
  WorkspaceTransitionReviewSnapshotEnvelope,
  WorkspaceYSchemaCompositionResult,
  YSchemaArtifactManifest,
  YSchemaArtifactRegistryPage,
  YSchemaCompositionDraft,
  YSchemaCompositionPreview,
} from './types.js';

export interface T3xClientConfig {
  baseUrl: string;
  headers?: Record<string, string>;
  fetch?: typeof fetch;
}

export interface T3xRequestOptions {
  signal?: AbortSignal;
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
      legacyYOpsEvidence: (projectId, conversationId, params) =>
        this.getLegacyYOpsEvidence(projectId, conversationId, params),
    });
    this.workspaces = Object.freeze<RepositoryWorkspaceCapability>({
      list: (projectId) => this.listRepositoryWorkspaces(projectId),
      get: (projectId, workspaceId) => this.getRepositoryWorkspace(projectId, workspaceId),
      createExtractionProposal: (projectId, workspaceId, input) =>
        this.createWorkspaceExtractionProposal(projectId, workspaceId, input),
      reviewTransition: (projectId, workspaceId, input) =>
        this.reviewWorkspaceTransition(projectId, workspaceId, input),
      decideTransition: (projectId, workspaceId, input) =>
        this.decideWorkspaceTransition(projectId, workspaceId, input),
      listReviewSnapshots: (projectId, workspaceId, params) =>
        this.listWorkspaceTransitionReviewSnapshots(projectId, workspaceId, params),
      getLatestReviewSnapshot: (projectId, workspaceId, params) =>
        this.getLatestWorkspaceTransitionReviewSnapshot(projectId, workspaceId, params),
      getReviewSnapshot: (projectId, workspaceId, snapshotId, options) =>
        this.getWorkspaceTransitionReviewSnapshot(projectId, workspaceId, snapshotId, options),
    });
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | number | undefined>,
    options?: T3xRequestOptions,
    responseSchema?: ZodType<unknown>
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
      signal: options?.signal,
    });

    const data = (await response.json()) as ApiResponse<T>;

    if (!response.ok || !data.success) {
      const error = !data.success ? data.error : { code: 'UNKNOWN', message: 'Unknown error' };
      throw new T3xApiError(error.code, error.message, response.status, error.details);
    }

    const payload = (data as ApiSuccessResponse<T>).data;
    if (responseSchema === undefined) return payload;
    try {
      return responseSchema.parse(payload) as T;
    } catch (error) {
      if (error instanceof ZodError) {
        throw new T3xApiError(
          'INVALID_RESPONSE',
          'API response did not match the client runtime schema',
          response.status,
          { issues: error.issues }
        );
      }
      throw error;
    }
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

  /** Public deployment-scoped capabilities; never actor entitlements. */
  async getDeploymentCapabilities(): Promise<DeploymentCapabilities> {
    return this.request<DeploymentCapabilities>(
      'GET',
      '/v1/deployment/capabilities',
      undefined,
      undefined,
      undefined,
      DeploymentCapabilitiesSchema
    );
  }

  // ============================================
  // Namespace collaboration
  // ============================================

  async listNamespaceAccounts(options?: T3xRequestOptions): Promise<ListNamespaceAccountsResponse> {
    return this.request<ListNamespaceAccountsResponse>(
      'GET',
      '/v1/namespaces',
      undefined,
      undefined,
      options,
      ListNamespaceAccountsResponseSchema
    );
  }

  async listNamespaceMembers(
    namespaceId: string,
    options?: T3xRequestOptions
  ): Promise<ListNamespaceMembersResponse> {
    return this.request<ListNamespaceMembersResponse>(
      'GET',
      `/v1/namespaces/${encodeURIComponent(namespaceId)}/members`,
      undefined,
      undefined,
      options,
      ListNamespaceMembersResponseSchema
    );
  }

  async upsertNamespaceMember(
    namespaceId: string,
    input: UpsertNamespaceMemberRequest,
    options?: T3xRequestOptions
  ): Promise<UpsertNamespaceMemberResponse> {
    return this.request<UpsertNamespaceMemberResponse>(
      'PUT',
      `/v1/namespaces/${encodeURIComponent(namespaceId)}/members`,
      input,
      undefined,
      options,
      UpsertNamespaceMemberResponseSchema
    );
  }

  async revokeNamespaceMember(
    namespaceId: string,
    membershipId: string,
    options?: T3xRequestOptions
  ): Promise<CollaborationMutationResult> {
    return this.request<CollaborationMutationResult>(
      'DELETE',
      `/v1/namespaces/${encodeURIComponent(namespaceId)}/members/${encodeURIComponent(
        membershipId
      )}`,
      undefined,
      undefined,
      options,
      CollaborationMutationResultSchema
    );
  }

  async transferNamespaceOwnership(
    namespaceId: string,
    input: TransferNamespaceOwnershipRequest,
    options?: T3xRequestOptions
  ): Promise<CollaborationMutationResult> {
    return this.request<CollaborationMutationResult>(
      'POST',
      `/v1/namespaces/${encodeURIComponent(namespaceId)}/ownership-transfer`,
      input,
      undefined,
      options,
      CollaborationMutationResultSchema
    );
  }

  async listNamespaceInvitations(
    namespaceId: string,
    options?: T3xRequestOptions
  ): Promise<ListNamespaceInvitationsResponse> {
    return this.request<ListNamespaceInvitationsResponse>(
      'GET',
      `/v1/namespaces/${encodeURIComponent(namespaceId)}/invitations`,
      undefined,
      undefined,
      options,
      ListNamespaceInvitationsResponseSchema
    );
  }

  async createNamespaceInvitation(
    namespaceId: string,
    input: CreateNamespaceInvitationRequest,
    options?: T3xRequestOptions
  ): Promise<CreateCollaborationInvitationResponse> {
    return this.request<CreateCollaborationInvitationResponse>(
      'POST',
      `/v1/namespaces/${encodeURIComponent(namespaceId)}/invitations`,
      input,
      undefined,
      options,
      CreateCollaborationInvitationResponseSchema
    );
  }

  // ============================================
  // Project collaboration
  // ============================================

  async listProjectGuests(
    projectId: string,
    options?: T3xRequestOptions
  ): Promise<ListProjectGuestsResponse> {
    return this.request<ListProjectGuestsResponse>(
      'GET',
      `/v1/projects/${encodeURIComponent(projectId)}/guests`,
      undefined,
      undefined,
      options,
      ListProjectGuestsResponseSchema
    );
  }

  async upsertProjectGuest(
    projectId: string,
    input: UpsertProjectGuestRequest,
    options?: T3xRequestOptions
  ): Promise<UpsertProjectGuestResponse> {
    return this.request<UpsertProjectGuestResponse>(
      'PUT',
      `/v1/projects/${encodeURIComponent(projectId)}/guests`,
      input,
      undefined,
      options,
      UpsertProjectGuestResponseSchema
    );
  }

  async revokeProjectGuest(
    projectId: string,
    grantId: string,
    options?: T3xRequestOptions
  ): Promise<CollaborationMutationResult> {
    return this.request<CollaborationMutationResult>(
      'DELETE',
      `/v1/projects/${encodeURIComponent(projectId)}/guests/${encodeURIComponent(grantId)}`,
      undefined,
      undefined,
      options,
      CollaborationMutationResultSchema
    );
  }

  async transferProject(
    projectId: string,
    input: TransferProjectRequest,
    options?: T3xRequestOptions
  ): Promise<CollaborationMutationResult> {
    return this.request<CollaborationMutationResult>(
      'POST',
      `/v1/projects/${encodeURIComponent(projectId)}/transfer`,
      input,
      undefined,
      options,
      CollaborationMutationResultSchema
    );
  }

  async listProjectInvitations(
    projectId: string,
    options?: T3xRequestOptions
  ): Promise<ListProjectInvitationsResponse> {
    return this.request<ListProjectInvitationsResponse>(
      'GET',
      `/v1/projects/${encodeURIComponent(projectId)}/invitations`,
      undefined,
      undefined,
      options,
      ListProjectInvitationsResponseSchema
    );
  }

  async createProjectInvitation(
    projectId: string,
    input: CreateProjectInvitationRequest,
    options?: T3xRequestOptions
  ): Promise<CreateCollaborationInvitationResponse> {
    return this.request<CreateCollaborationInvitationResponse>(
      'POST',
      `/v1/projects/${encodeURIComponent(projectId)}/invitations`,
      input,
      undefined,
      options,
      CreateCollaborationInvitationResponseSchema
    );
  }

  async revokeCollaborationInvitation(
    invitationId: string,
    options?: T3xRequestOptions
  ): Promise<CollaborationMutationResult> {
    return this.request<CollaborationMutationResult>(
      'DELETE',
      `/v1/invitations/${encodeURIComponent(invitationId)}`,
      undefined,
      undefined,
      options,
      CollaborationMutationResultSchema
    );
  }

  async acceptCollaborationInvitation(
    input: AcceptCollaborationInvitationRequest,
    options?: T3xRequestOptions
  ): Promise<AcceptCollaborationInvitationResponse> {
    return this.request<AcceptCollaborationInvitationResponse>(
      'POST',
      '/v1/invitations/accept',
      input,
      undefined,
      options,
      AcceptCollaborationInvitationResponseSchema
    );
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

  async getLegacyYOpsEvidence(
    projectId: string,
    conversationId: string,
    params?: LegacyYOpsEvidenceParams
  ): Promise<LegacyYOpsEvidence> {
    return this.request<LegacyYOpsEvidence>(
      'GET',
      `/v1/projects/${encodeURIComponent(projectId)}/sources/conversations/${encodeURIComponent(
        conversationId
      )}/legacy-yops`,
      undefined,
      {
        limit: params?.limit,
        offset: params?.offset,
        topic_id: params?.topicId,
        archived_only: params?.archivedOnly === undefined ? undefined : String(params.archivedOnly),
        order: params?.order,
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

  async reviewWorkspaceTransition(
    projectId: string,
    workspaceId: string,
    input: ReviewWorkspaceTransitionInput
  ): Promise<WorkspaceTransitionReviewEnvelope> {
    return this.request<WorkspaceTransitionReviewEnvelope>(
      'POST',
      `/v1/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(workspaceId)}/transition/review`,
      input
    );
  }

  async decideWorkspaceTransition(
    projectId: string,
    workspaceId: string,
    input: DecideWorkspaceTransitionInput
  ): Promise<WorkspaceTransitionDecisionEnvelope> {
    return this.request<WorkspaceTransitionDecisionEnvelope>(
      'POST',
      `/v1/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(workspaceId)}/transition/decide`,
      input
    );
  }

  async listWorkspaceTransitionReviewSnapshots(
    projectId: string,
    workspaceId: string,
    params?: ListWorkspaceTransitionReviewSnapshotsParams
  ): Promise<ListWorkspaceTransitionReviewSnapshotsResponse> {
    return this.request<ListWorkspaceTransitionReviewSnapshotsResponse>(
      'GET',
      `/v1/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(workspaceId)}/transition/review-snapshots`,
      undefined,
      params
        ? {
            transition_id: params.transition_id,
            limit: params.limit,
          }
        : undefined
    );
  }

  async getLatestWorkspaceTransitionReviewSnapshot(
    projectId: string,
    workspaceId: string,
    params?: Pick<ListWorkspaceTransitionReviewSnapshotsParams, 'transition_id'>
  ): Promise<WorkspaceTransitionReviewSnapshotEnvelope> {
    return this.request<WorkspaceTransitionReviewSnapshotEnvelope>(
      'GET',
      `/v1/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(workspaceId)}/transition/review-snapshots/latest`,
      undefined,
      params ? { transition_id: params.transition_id } : undefined
    );
  }

  async getWorkspaceTransitionReviewSnapshot(
    projectId: string,
    workspaceId: string,
    snapshotId: string,
    options?: T3xRequestOptions
  ): Promise<WorkspaceTransitionReviewSnapshotEnvelope> {
    return this.request<WorkspaceTransitionReviewSnapshotEnvelope>(
      'GET',
      `/v1/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(workspaceId)}/transition/review-snapshots/${encodeURIComponent(snapshotId)}`,
      undefined,
      undefined,
      options
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

  // ============================================
  // Transition control plane
  // ============================================

  async proposeTransition(
    projectId: string,
    input: ProposeTransitionInput
  ): Promise<ProposeTransitionResult> {
    return this.request<ProposeTransitionResult>(
      'POST',
      `/v1/projects/${encodeURIComponent(projectId)}/transitions`,
      input,
      undefined,
      undefined,
      transitionResponseSchemas.propose
    );
  }

  async inspectTransition(
    projectId: string,
    transitionId: string,
    options?: T3xRequestOptions
  ): Promise<InspectTransitionResult> {
    return this.request<InspectTransitionResult>(
      'GET',
      `/v1/projects/${encodeURIComponent(projectId)}/transitions/${encodeURIComponent(transitionId)}`,
      undefined,
      undefined,
      options,
      transitionResponseSchemas.inspect
    );
  }

  async verifyTransition(
    projectId: string,
    transitionId: string,
    input: VerifyTransitionInput
  ): Promise<VerifyTransitionResult> {
    return this.request<VerifyTransitionResult>(
      'POST',
      `/v1/projects/${encodeURIComponent(projectId)}/transitions/${encodeURIComponent(transitionId)}/verify`,
      input,
      undefined,
      undefined,
      transitionResponseSchemas.verify
    );
  }

  async attachTransitionStatement(
    projectId: string,
    transitionId: string,
    input: AttachTransitionStatementInput
  ): Promise<AttachTransitionStatementResult> {
    return this.request<AttachTransitionStatementResult>(
      'POST',
      `/v1/projects/${encodeURIComponent(projectId)}/transitions/${encodeURIComponent(transitionId)}/statements`,
      input,
      undefined,
      undefined,
      transitionResponseSchemas.attachStatement
    );
  }

  async decideTransition(
    projectId: string,
    transitionId: string,
    input: DecideTransitionInput
  ): Promise<DecideTransitionResult> {
    return this.request<DecideTransitionResult>(
      'POST',
      `/v1/projects/${encodeURIComponent(projectId)}/transitions/${encodeURIComponent(transitionId)}/decisions`,
      input,
      undefined,
      undefined,
      transitionResponseSchemas.decide
    );
  }

  async commitTransition(
    projectId: string,
    transitionId: string,
    input: CommitTransitionInput
  ): Promise<CommitTransitionResult> {
    return this.request<CommitTransitionResult>(
      'POST',
      `/v1/projects/${encodeURIComponent(projectId)}/transitions/${encodeURIComponent(transitionId)}/commits`,
      input,
      undefined,
      undefined,
      transitionResponseSchemas.commit
    );
  }

  // ============================================
  // YSchema Composition Registry
  // ============================================

  async listYSchemaArtifacts(
    params: ListYSchemaArtifactsParams = {}
  ): Promise<YSchemaArtifactRegistryPage> {
    const { projectId, ...query } = params;
    const path = projectId
      ? `/v1/projects/${encodeURIComponent(projectId)}/yschema/artifacts`
      : '/v1/yschema/artifacts';
    return this.request<YSchemaArtifactRegistryPage>(
      'GET',
      path,
      undefined,
      query as Record<string, string | number | undefined>
    );
  }

  async listProjectYSchemaVersions(
    projectId: string,
    family?: 'esphome-device' | 'prd' | 'prompt' | 'skill'
  ): Promise<ProjectYSchemaVersionHistory> {
    return this.request<ProjectYSchemaVersionHistory>(
      'GET',
      `/v1/projects/${encodeURIComponent(projectId)}/yschema/versions`,
      undefined,
      { family }
    );
  }

  async previewYSchemaComposition(
    composition: YSchemaCompositionDraft,
    projectId?: string
  ): Promise<YSchemaCompositionPreview> {
    const path = projectId
      ? `/v1/projects/${encodeURIComponent(projectId)}/yschema/compositions/preview`
      : '/v1/yschema/compositions/preview';
    return this.request<YSchemaCompositionPreview>('POST', path, composition);
  }

  async getWorkspaceYSchemaComposition(
    projectId: string,
    workspaceId: string
  ): Promise<WorkspaceYSchemaCompositionResult> {
    return this.request<WorkspaceYSchemaCompositionResult>(
      'GET',
      `/v1/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(
        workspaceId
      )}/schema-composition`
    );
  }

  async saveWorkspaceYSchemaComposition(
    projectId: string,
    workspaceId: string,
    composition: YSchemaCompositionDraft,
    workspaceRevision: number
  ): Promise<WorkspaceYSchemaCompositionResult> {
    return this.request<WorkspaceYSchemaCompositionResult>(
      'PUT',
      `/v1/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(
        workspaceId
      )}/schema-composition`,
      { composition, if_revision: workspaceRevision }
    );
  }

  async applyWorkspaceYSchemaComposition(
    projectId: string,
    workspaceId: string,
    input: { workspaceRevision: number; compositionRevision: number; compositionHash: string }
  ): Promise<WorkspaceYSchemaCompositionResult> {
    return this.request<WorkspaceYSchemaCompositionResult>(
      'POST',
      `/v1/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(
        workspaceId
      )}/schema-composition/apply`,
      {
        if_revision: input.workspaceRevision,
        composition_revision: input.compositionRevision,
        composition_hash: input.compositionHash,
      }
    );
  }

  async publishWorkspaceYSchemaComposition(
    projectId: string,
    workspaceId: string,
    input: PublishWorkspaceYSchemaCompositionInput
  ): Promise<YSchemaArtifactManifest> {
    return this.request<YSchemaArtifactManifest>(
      'POST',
      `/v1/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(
        workspaceId
      )}/schema-composition/publish`,
      {
        composition_revision: input.compositionRevision,
        composition_hash: input.compositionHash,
        canonical_name: input.canonicalName,
        version: input.version,
        title: input.title,
        ...(input.description ? { description: input.description } : {}),
        ...(input.releaseNotes ? { release_notes: input.releaseNotes } : {}),
        ...(input.tags?.length ? { tags: input.tags } : {}),
      }
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
