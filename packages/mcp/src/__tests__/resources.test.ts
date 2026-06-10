import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  mockFindProjectById,
  mockGetCommit,
  mockFindDraftById,
  mockFindConversationById,
  mockFindLeafById,
  mockGetMergeDraft,
} = vi.hoisted(() => ({
  mockFindProjectById: vi.fn(),
  mockGetCommit: vi.fn(),
  mockFindDraftById: vi.fn(),
  mockFindConversationById: vi.fn(),
  mockFindLeafById: vi.fn(),
  mockGetMergeDraft: vi.fn(),
}));

vi.mock('../db.js', () => ({
  getDB: vi.fn(() => Promise.resolve({})),
  closeDB: vi.fn(() => Promise.resolve()),
}));

vi.mock('@t3x-dev/storage', () => ({
  findProjects: vi.fn(),
  findProjectById: mockFindProjectById,
  findDraftById: mockFindDraftById,
  listDraftsByProject: vi.fn(),
  findAgentDraftById: vi.fn(),
  findAgentDraftsByProject: vi.fn(),
  findBranchesByProject: vi.fn(),
  findConversationById: mockFindConversationById,
  findConversationsByProject: vi.fn(),
  findLeafById: mockFindLeafById,
  findLeavesByProject: vi.fn(),
  findPinById: vi.fn(),
  findPinsByProject: vi.fn(),
  getCommit: mockGetCommit,
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
        uriTemplate: 't3x://commits/{commit_hash}',
      }),
      expect.objectContaining({
        name: 'workbench_draft',
        uriTemplate: 't3x://workbench-drafts/{draft_id}',
      }),
      expect.objectContaining({
        name: 'conversation',
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
    mockGetCommit.mockResolvedValue({
      hash: 'sha256:commit123',
      schema: 't3x/commit',
      parents: ['sha256:parent'],
      author: { type: 'human', name: 'Test' },
      committed_at: '2026-04-21T11:00:00.000Z',
      content: {
        trees: [{ key: 'budget', slots: { amount: '5000' }, children: [] }],
        relations: [],
      },
      project_id: 'proj_123',
      message: 'Initial structured-state commit',
      branch: 'main',
      provenance: { method: 'llm_extraction' },
      yops_log_ids: ['yl_1'],
      sources: [{ type: 'conversation', id: 'conv_1', title: 'Trip plan' }],
    });
    const { client } = await connectClientAndServer();

    const result = await client.readResource({ uri: 't3x://commits/sha256:commit123' });

    expect(JSON.parse(result.contents[0].text)).toMatchObject({
      kind: 'commit',
      hash: 'sha256:commit123',
      project_id: 'proj_123',
      branch: 'main',
      message: 'Initial structured-state commit',
      tree_count: 1,
      relation_count: 0,
    });

    await client.close();
  });

  it('reads a workbench draft resource from a stable URI', async () => {
    mockFindDraftById.mockResolvedValue({
      id: 'draft_123',
      project_id: 'proj_123',
      title: 'Extracted knowledge',
      goal: undefined,
      parent_commit_hash: undefined,
      forked_from: undefined,
      nodes: [{ key: 'budget', slots: { amount: '5000' }, children: [] }],
      constraints: [],
      instructions: undefined,
      preview_type: undefined,
      preview_output: undefined,
      preview_generated_at: undefined,
      status: 'editing',
      committed_as: undefined,
      committed_leaf_id: undefined,
      target_branch: 'main',
      revision: 3,
      created_at: '2026-04-21T12:00:00.000Z',
      updated_at: '2026-04-21T12:05:00.000Z',
      extraction_mode: 'deterministic',
      semantic_points: undefined,
      extraction_cursor: undefined,
    });
    const { client } = await connectClientAndServer();

    const result = await client.readResource({ uri: 't3x://workbench-drafts/draft_123' });

    expect(JSON.parse(result.contents[0].text)).toMatchObject({
      kind: 'workbench_draft',
      draft_id: 'draft_123',
      project_id: 'proj_123',
      title: 'Extracted knowledge',
      status: 'editing',
      revision: 3,
      node_count: 1,
      constraint_count: 0,
      target_branch: 'main',
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
      kind: 'conversation',
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
