import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  mockFindProjectById,
  mockGetVerifiedTransitionCommitGraph,
  mockFindConversationById,
  mockFindLeafById,
  mockGetMergeDraft,
  mockApiClient,
} = vi.hoisted(() => ({
  mockFindProjectById: vi.fn(),
  mockGetVerifiedTransitionCommitGraph: vi.fn(),
  mockFindConversationById: vi.fn(),
  mockFindLeafById: vi.fn(),
  mockGetMergeDraft: vi.fn(),
  mockApiClient: {
    getProject: vi.fn(),
    getCommit: vi.fn(),
    inspectTransition: vi.fn(),
    getLeaf: vi.fn(),
    getMergeDraft: vi.fn(),
    sourceThreads: { get: vi.fn() },
    workspaces: { get: vi.fn() },
  },
}));

vi.mock('../db.js', () => ({
  getDB: vi.fn(() => Promise.resolve({})),
  closeDB: vi.fn(() => Promise.resolve()),
}));

vi.mock('@t3x-dev/api-client', () => ({
  createClient: vi.fn(() => mockApiClient),
}));

vi.mock('@t3x-dev/storage', () => ({
  findProjects: vi.fn(),
  findProjectById: mockFindProjectById,
  findAgentDraftById: vi.fn(),
  findAgentDraftsByProject: vi.fn(),
  findBranchesByProject: vi.fn(),
  findConversationById: mockFindConversationById,
  findConversationsByProject: vi.fn(),
  findLeafById: mockFindLeafById,
  findLeavesByProject: vi.fn(),
  findPinById: vi.fn(),
  findPinsByProject: vi.fn(),
  getVerifiedTransitionCommitGraph: mockGetVerifiedTransitionCommitGraph,
  getMergeDraft: mockGetMergeDraft,
  listCommits: vi.fn(),
  insertProject: vi.fn(),
  insertBranch: vi.fn(),
  insertConversation: vi.fn(),
  insertTurn: vi.fn(),
  insertDraft: vi.fn(),
  updateDraft: vi.fn(),
  commitDraft: vi.fn(),
  createCommit: vi.fn(),
  createLeaf: vi.fn(),
  createPin: vi.fn(),
  deletePin: vi.fn(),
  createMergeDraft: vi.fn(),
  updateMergeDraft: vi.fn(),
  cancelMergeDraft: vi.fn(),
  updateLeaf: vi.fn(),
  updateLeafOutput: vi.fn(),
}));

vi.mock('@t3x-dev/core', () => ({
  ALL_LEAF_TYPES: [
    'tweet',
    'linkedin',
    'reddit',
    'threads',
    'article',
    'email',
    'slack',
    'deploy_agent',
  ],
  diffCommits: vi.fn(),
  prepareMerge: vi.fn(),
  executeMerge: vi.fn(),
  Extractor: vi.fn(),
  GateRunner: vi.fn(),
  runTransforms: vi.fn(),
  createDefaultProviderRegistry: vi.fn(() => ({
    tryWithFallback: vi.fn(),
  })),
  extractAndApply: vi.fn(),
  DEFAULT_STYLE: {},
  normalizeRuntimeProviderId: vi.fn((providerId: string | null | undefined) =>
    providerId === 'claude' ? 'anthropic' : providerId
  ),
  isGenerationRuntimeProviderId: vi.fn((providerId: string) =>
    ['openai', 'anthropic', 'gemini'].includes(providerId)
  ),
  runtimeProviderIdForPublic: vi.fn((providerId: string | null | undefined) =>
    providerId === 'claude' ? 'anthropic' : providerId
  ),
  collectLessonsFromAssertions: vi.fn(() => []),
  generateLeafOutput: vi.fn(),
}));

import { createMcpServer } from '../server.js';

const originalBackend = process.env.T3X_MCP_BACKEND;

async function connectClientAndServer() {
  const { server } = createMcpServer({ toolsets: ['core'] });
  const client = new Client(
    { name: 't3x-mcp-test-client', version: '0.0.0' },
    { capabilities: {} }
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return { client, server };
}

afterEach(() => {
  vi.clearAllMocks();
  if (originalBackend === undefined) {
    delete process.env.T3X_MCP_BACKEND;
  } else {
    process.env.T3X_MCP_BACKEND = originalBackend;
  }
});

describe('MCP resources', () => {
  it('advertises resources capability during initialization', async () => {
    const { client } = await connectClientAndServer();

    expect(client.getServerCapabilities()).toMatchObject({
      resources: {},
      tools: {},
    });

    await client.close();
  });

  it('lists the first batch of resource templates', async () => {
    const { client } = await connectClientAndServer();

    const result = await client.listResourceTemplates();

    expect(result.resourceTemplates).toEqual([
      expect.objectContaining({
        name: 'project',
        uriTemplate: 't3x://projects/{project_id}',
      }),
      expect.objectContaining({
        name: 'commit',
        uriTemplate: 't3x://projects/{project_id}/commits/{commit_digest}',
      }),
      expect.objectContaining({
        name: 'transition',
        uriTemplate: 't3x://projects/{project_id}/transitions/{transition_id}',
      }),
      expect.objectContaining({
        name: 'workspace',
        uriTemplate: 't3x://projects/{project_id}/workspaces/{workspace_id}',
      }),
      expect.objectContaining({
        name: 'source_thread',
        uriTemplate: 't3x://source-threads/{source_thread_id}',
      }),
      expect.objectContaining({
        name: 'conversation_compatibility',
        uriTemplate: 't3x://conversations/{conversation_id}',
      }),
      expect.objectContaining({
        name: 'leaf',
        uriTemplate: 't3x://leaves/{leaf_id}',
      }),
      expect.objectContaining({
        name: 'merge_draft',
        uriTemplate: 't3x://merge-drafts/{draft_id}',
      }),
    ]);

    await client.close();
  });

  it('reads a project resource from a stable URI', async () => {
    mockFindProjectById.mockResolvedValue({
      projectId: 'proj_123',
      name: 'Demo project',
      ownerId: null,
      createdAt: new Date('2026-04-21T10:00:00.000Z'),
      deletedAt: null,
      metadataJson: '{"source":"test"}',
      providerConfig: null,
      defaultProvider: 'anthropic',
      defaultModel: 'claude-sonnet-4-20250514',
      autopilotConfig: undefined,
      businessRules: [],
      extractionStyle: null,
    });
    const { client } = await connectClientAndServer();

    const result = await client.readResource({ uri: 't3x://projects/proj_123' });

    expect(result.contents).toHaveLength(1);
    expect(result.contents[0]).toMatchObject({
      uri: 't3x://projects/proj_123',
      mimeType: 'application/json',
    });
    expect(JSON.parse(result.contents[0].text)).toMatchObject({
      kind: 'project',
      project_id: 'proj_123',
      name: 'Demo project',
      default_provider: 'anthropic',
      default_model: 'claude-sonnet-4-20250514',
      metadata: { source: 'test' },
    });

    await client.close();
  });

  it('reads a commit resource from a stable URI', async () => {
    mockGetVerifiedTransitionCommitGraph.mockResolvedValue({
      recordedAt: '2026-04-21T11:00:00.000Z',
      commit: {
        schema: 't3x/commit/v2',
        parents: [{ kind: 'commit', schema: 't3x/commit/v2', digest: 'sha256:parent' }],
        decision: { kind: 'decision', schema: 't3x/decision/v1', digest: 'sha256:decision' },
        result: { kind: 'state', schema: 't3x/state/v1', digest: 'sha256:state' },
      },
    });
    const { client } = await connectClientAndServer();

    const result = await client.readResource({
      uri: 't3x://projects/proj_123/commits/sha256%3Acommit123',
    });

    expect(JSON.parse(result.contents[0].text)).toMatchObject({
      digest: 'sha256:commit123',
      recorded_at: '2026-04-21T11:00:00.000Z',
      object: { schema: 't3x/commit/v2' },
    });

    await client.close();
  });

  it('reads a conversation resource from a stable URI', async () => {
    mockFindConversationById.mockResolvedValue({
      conversationId: 'conv_123',
      projectId: 'proj_123',
      title: 'Trip planning',
      alias: 'trip_planning',
      parentCommitHash: 'sha256:parent',
      positionX: 100,
      positionY: 200,
      createdAt: new Date('2026-04-21T13:00:00.000Z'),
      metadataJson: '{"channel":"chat"}',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
    });
    const { client } = await connectClientAndServer();

    const result = await client.readResource({ uri: 't3x://conversations/conv_123' });

    expect(JSON.parse(result.contents[0].text)).toMatchObject({
      kind: 'source_thread',
      conversation_id: 'conv_123',
      project_id: 'proj_123',
      title: 'Trip planning',
      alias: 'trip_planning',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      metadata: { channel: 'chat' },
    });

    await client.close();
  });

  it('reads the canonical source-thread URI through storage compatibility', async () => {
    mockFindConversationById.mockResolvedValue({
      conversationId: 'conv_123',
      projectId: 'proj_123',
      title: 'Trip planning',
      alias: null,
      parentCommitHash: null,
      positionX: null,
      positionY: null,
      createdAt: new Date('2026-04-21T13:00:00.000Z'),
      metadataJson: null,
      provider: null,
      model: null,
    });
    const { client } = await connectClientAndServer();

    const result = await client.readResource({ uri: 't3x://source-threads/conv_123' });

    expect(JSON.parse(result.contents[0].text)).toMatchObject({
      kind: 'source_thread',
      conversation_id: 'conv_123',
      project_id: 'proj_123',
    });

    await client.close();
  });

  it('uses the authenticated API boundary for resources in api backend mode', async () => {
    process.env.T3X_MCP_BACKEND = 'api';
    mockApiClient.sourceThreads.get.mockResolvedValueOnce({
      conversation_id: 'conv_api',
      project_id: 'proj_api',
      title: 'Authenticated source',
    });
    const { getDB } = await import('../db.js');
    const callsBeforeRead = (getDB as ReturnType<typeof vi.fn>).mock.calls.length;
    const { client } = await connectClientAndServer();

    const result = await client.readResource({ uri: 't3x://source-threads/conv_api' });

    expect(mockApiClient.sourceThreads.get).toHaveBeenCalledWith('conv_api');
    expect((getDB as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(callsBeforeRead);
    expect(JSON.parse(result.contents[0].text)).toEqual({
      kind: 'source_thread',
      conversation_id: 'conv_api',
      project_id: 'proj_api',
      title: 'Authenticated source',
    });

    await client.close();
  });

  it('reads a project-scoped Workspace resource through the authenticated API boundary', async () => {
    process.env.T3X_MCP_BACKEND = 'api';
    mockApiClient.workspaces.get.mockResolvedValueOnce({
      candidate_id: 'candidate_1',
      yops_draft_id: 'draft:1',
      workspace: { id: 'workspace_1', projectId: 'proj_1', revision: 5 },
    });
    const { getDB } = await import('../db.js');
    const callsBeforeRead = (getDB as ReturnType<typeof vi.fn>).mock.calls.length;
    const { client } = await connectClientAndServer();

    const result = await client.readResource({
      uri: 't3x://projects/proj_1/workspaces/workspace_1',
    });

    expect(mockApiClient.workspaces.get).toHaveBeenCalledWith('proj_1', 'workspace_1');
    expect((getDB as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(callsBeforeRead);
    expect(JSON.parse(result.contents[0].text)).toMatchObject({
      kind: 'workspace',
      candidate_id: 'candidate_1',
      workspace: { id: 'workspace_1', revision: 5 },
    });

    await client.close();
  });

  it('reads a project-scoped Transition resource through the authenticated API boundary', async () => {
    process.env.T3X_MCP_BACKEND = 'api';
    mockApiClient.inspectTransition.mockResolvedValueOnce({
      transition_id: 'trn_00000000000000000000000000000001',
      view: {
        transition_id: 'trn_00000000000000000000000000000001',
        project_id: 'proj_1',
        workspace_id: 'workspace_1',
        precondition: { ref_name: 'main' },
      },
    });
    const { getDB } = await import('../db.js');
    const callsBeforeRead = (getDB as ReturnType<typeof vi.fn>).mock.calls.length;
    const { client } = await connectClientAndServer();

    const result = await client.readResource({
      uri: 't3x://projects/proj_1/transitions/trn_00000000000000000000000000000001',
    });

    expect(mockApiClient.inspectTransition).toHaveBeenCalledWith(
      'proj_1',
      'trn_00000000000000000000000000000001'
    );
    expect((getDB as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(callsBeforeRead);
    expect(JSON.parse(result.contents[0].text)).toMatchObject({
      kind: 'transition',
      transition_id: 'trn_00000000000000000000000000000001',
      view: { project_id: 'proj_1', workspace_id: 'workspace_1' },
    });

    await client.close();
  });

  it('fails closed for Workspace resources in direct-storage mode', async () => {
    const { client } = await connectClientAndServer();

    await expect(
      client.readResource({ uri: 't3x://projects/proj_1/workspaces/workspace_1' })
    ).rejects.toThrow('T3X_MCP_BACKEND=api');

    await client.close();
  });

  it('fails closed for Transition resources in direct-storage mode', async () => {
    const { client } = await connectClientAndServer();

    await expect(
      client.readResource({
        uri: 't3x://projects/proj_1/transitions/trn_00000000000000000000000000000001',
      })
    ).rejects.toThrow('T3X_MCP_BACKEND=api');

    await client.close();
  });

  it('reads a leaf resource from a stable URI', async () => {
    mockFindLeafById.mockResolvedValue({
      id: 'leaf_123',
      commit_hash: 'sha256:commit123',
      type: 'article',
      title: 'Hangzhou article',
      constraints: [{ id: 'cst_1', type: 'require', match_mode: 'exact', value: 'West Lake' }],
      config: { model: 'claude-sonnet-4-20250514' },
      output: 'A polished article',
      generated_at: '2026-04-21T14:00:00.000Z',
      assertions: [{ id: 'ast_1', constraint_id: 'cst_1', passed: true, details: 'Included' }],
      runner_assertions: undefined,
      project_id: 'proj_123',
      created_at: '2026-04-21T13:30:00.000Z',
      created_by: 'user_1',
    });
    const { client } = await connectClientAndServer();

    const result = await client.readResource({ uri: 't3x://leaves/leaf_123' });

    expect(JSON.parse(result.contents[0].text)).toMatchObject({
      kind: 'leaf',
      leaf_id: 'leaf_123',
      project_id: 'proj_123',
      commit_hash: 'sha256:commit123',
      type: 'article',
      title: 'Hangzhou article',
      constraint_count: 1,
      assertion_count: 1,
      has_output: true,
    });

    await client.close();
  });

  it('reads a merge draft resource from a stable URI', async () => {
    mockGetMergeDraft.mockResolvedValue({
      draftId: 'merge_123',
      projectId: 'proj_123',
      sourceHash: 'sha256:source',
      targetHash: 'sha256:target',
      sourceBranch: 'feature',
      targetBranch: 'main',
      preparedJson: JSON.stringify({
        identical: ['budget'],
        similarPairs: [{ source: 'hotel', target: 'lodging' }],
      }),
      status: 'pending',
      message: 'Merge feature into main',
      createdAt: new Date('2026-04-21T15:00:00.000Z'),
      updatedAt: new Date('2026-04-21T15:10:00.000Z'),
    });
    const { client } = await connectClientAndServer();

    const result = await client.readResource({ uri: 't3x://merge-drafts/merge_123' });

    expect(JSON.parse(result.contents[0].text)).toMatchObject({
      kind: 'merge_draft',
      draft_id: 'merge_123',
      project_id: 'proj_123',
      source_hash: 'sha256:source',
      target_hash: 'sha256:target',
      source_branch: 'feature',
      target_branch: 'main',
      status: 'pending',
      message: 'Merge feature into main',
      prepared: {
        identical: ['budget'],
        similarPairs: [{ source: 'hotel', target: 'lodging' }],
      },
    });

    await client.close();
  });
});
