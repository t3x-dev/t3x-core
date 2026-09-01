import { afterEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ──

const mockDB = {};
const mockApiClient = {
  getProject: vi.fn(),
  listProjects: vi.fn(),
  sourceThreads: {
    get: vi.fn(),
    list: vi.fn(),
    evidence: vi.fn(),
  },
  workspaces: {
    get: vi.fn(),
    list: vi.fn(),
  },
};

vi.mock('../db.js', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
}));

vi.mock('@t3x-dev/api-client', () => ({
  createClient: vi.fn(() => mockApiClient),
}));

const MOCK_PROJECT = {
  projectId: 'proj_test1',
  name: 'Test Project',
  createdAt: new Date('2026-01-01'),
  metadataJson: null,
  deletedAt: null,
  ownerId: null,
  defaultProvider: null,
  defaultModel: null,
  providerConfig: null,
  extractionStyle: null,
};

const MOCK_LEAF = {
  id: 'leaf_test1',
  commit_hash: 'sha256:abc',
  type: 'deploy_agent',
  title: 'Test Leaf',
};

const MOCK_PIN = {
  id: 'pin_test1',
  project_id: 'proj_test1',
  type: 'conversation',
  ref_id: 'conv_test1',
};

const MOCK_CONVERSATION = {
  conversationId: 'conv_test1',
  projectId: 'proj_test1',
  name: 'Test Conversation',
};

const MOCK_BRANCH = {
  branchId: 'branch_main',
  projectId: 'proj_test1',
  name: 'main',
};

vi.mock('@t3x-dev/storage', () => ({
  findProjectById: vi.fn((_db: unknown, id: string) =>
    Promise.resolve(id === 'proj_test1' ? MOCK_PROJECT : null)
  ),
  findProjects: vi.fn(() => Promise.resolve([MOCK_PROJECT])),
  getVerifiedTransitionCommitGraph: vi.fn((_db: unknown, projectId: string, hash: string) =>
    Promise.resolve(
      projectId === 'proj_test1' && hash === 'sha256:abc'
        ? {
            recordedAt: '2026-01-01T00:00:00.000Z',
            commit: { schema: 't3x/commit/v2', parents: [] },
          }
        : null
    )
  ),
  listCommitHistory: vi.fn(() =>
    Promise.resolve([
      {
        digest: 'sha256:abc',
        recordedAt: '2026-01-01T00:00:00.000Z',
        parents: [],
      },
    ])
  ),
  findLeafById: vi.fn((_db: unknown, id: string) =>
    Promise.resolve(id === 'leaf_test1' ? MOCK_LEAF : null)
  ),
  findLeavesByProject: vi.fn(() => Promise.resolve([MOCK_LEAF])),
  findPinById: vi.fn((_db: unknown, id: string) =>
    Promise.resolve(id === 'pin_test1' ? MOCK_PIN : null)
  ),
  findPinsByProject: vi.fn(() => Promise.resolve([MOCK_PIN])),
  findConversationById: vi.fn((_db: unknown, id: string) =>
    Promise.resolve(id === 'conv_test1' ? MOCK_CONVERSATION : null)
  ),
  findConversationsByProject: vi.fn(() => Promise.resolve([MOCK_CONVERSATION])),
  findBranchesByProject: vi.fn(() => Promise.resolve([MOCK_BRANCH])),
}));

// ── Import handler after mocks ──

import { queryHandler } from '../tools/core/query.js';

// ── Tests ──

const originalBackend = process.env.T3X_MCP_BACKEND;

describe('t3x_query handler', () => {
  afterEach(() => {
    vi.clearAllMocks();
    if (originalBackend === undefined) {
      delete process.env.T3X_MCP_BACKEND;
    } else {
      process.env.T3X_MCP_BACKEND = originalBackend;
    }
  });

  // ── Validation errors ──

  it('returns error when target is missing', async () => {
    const result = await queryHandler({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Missing or invalid "target"');
  });

  it('returns error when target is invalid', async () => {
    const result = await queryHandler({ target: 'unicorns' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Missing or invalid "target"');
  });

  it('does not advertise the retired Agent Draft query surface', async () => {
    const result = await queryHandler({ target: 'agent_drafts', project_id: 'proj_test1' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Missing or invalid "target"');
  });

  it('returns error when singular target lacks id', async () => {
    const result = await queryHandler({ target: 'project' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('"id" is required');
  });

  it('returns error when plural target (non-projects) lacks project_id', async () => {
    const result = await queryHandler({ target: 'commits' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('"project_id" is required');
  });

  // ── Singular targets ──

  it('returns a project by id', async () => {
    const result = await queryHandler({ target: 'project', id: 'proj_test1' });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.projectId).toBe('proj_test1');
    expect(data.name).toBe('Test Project');
  });

  it('returns not-found for missing project', async () => {
    const result = await queryHandler({ target: 'project', id: 'proj_missing' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Project not found');
  });

  it('returns a commit by hash', async () => {
    const result = await queryHandler({
      target: 'commit',
      id: 'sha256:abc',
      project_id: 'proj_test1',
    });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.digest).toBe('sha256:abc');
    expect(data.object.schema).toBe('t3x/commit/v2');
  });

  it('returns a leaf by id', async () => {
    const result = await queryHandler({ target: 'leaf', id: 'leaf_test1' });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.id).toBe('leaf_test1');
  });

  it('returns a pin by id', async () => {
    const result = await queryHandler({ target: 'pin', id: 'pin_test1' });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.id).toBe('pin_test1');
  });

  it('returns a source thread by id', async () => {
    const result = await queryHandler({ target: 'source_thread', id: 'conv_test1' });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.conversationId).toBe('conv_test1');
  });

  it('keeps conversation as a compatibility alias for source_thread', async () => {
    const result = await queryHandler({ target: 'conversation', id: 'conv_test1' });
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text).conversationId).toBe('conv_test1');
  });

  // ── Plural targets ──

  it('lists projects without project_id', async () => {
    const result = await queryHandler({ target: 'projects' });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(1);
    expect(data[0].projectId).toBe('proj_test1');
  });

  it('uses api client for project queries when api backend is enabled', async () => {
    process.env.T3X_MCP_BACKEND = 'api';
    mockApiClient.getProject.mockResolvedValueOnce({
      id: 'proj_api1',
      project_id: 'proj_api1',
      name: 'API Project',
    });

    const { getDB } = await import('../db.js');
    const getDBMock = getDB as ReturnType<typeof vi.fn>;
    const beforeCalls = getDBMock.mock.calls.length;

    const result = await queryHandler({ target: 'project', id: 'proj_api1' });

    expect(result.isError).toBeUndefined();
    expect(mockApiClient.getProject).toHaveBeenCalledWith('proj_api1');
    expect(getDBMock.mock.calls.length).toBe(beforeCalls);
    expect(JSON.parse(result.content[0].text)).toEqual({
      id: 'proj_api1',
      project_id: 'proj_api1',
      name: 'API Project',
    });
  });

  it('uses the authenticated Source capability for api source-thread queries', async () => {
    process.env.T3X_MCP_BACKEND = 'api';
    mockApiClient.sourceThreads.get.mockResolvedValueOnce({
      conversation_id: 'conv_api1',
      project_id: 'proj_api1',
      title: 'API source',
    });

    const result = await queryHandler({ target: 'source_thread', id: 'conv_api1' });

    expect(result.isError).toBeUndefined();
    expect(mockApiClient.sourceThreads.get).toHaveBeenCalledWith('conv_api1');
  });

  it('reads source evidence only through the project-scoped API capability', async () => {
    process.env.T3X_MCP_BACKEND = 'api';
    mockApiClient.sourceThreads.evidence.mockResolvedValueOnce({
      availability: { mode: 'available', reasons: [] },
      source: { id: 'conv_api1', project_id: 'proj_api1' },
    });

    const result = await queryHandler({
      target: 'source_evidence',
      id: 'conv_api1',
      project_id: 'proj_api1',
      limit: 10,
      offset: 2,
    });

    expect(result.isError).toBeUndefined();
    expect(mockApiClient.sourceThreads.evidence).toHaveBeenCalledWith('proj_api1', 'conv_api1', {
      limit: 10,
      offset: 2,
    });
  });

  it('requires project scope before reading source evidence', async () => {
    process.env.T3X_MCP_BACKEND = 'api';

    const result = await queryHandler({ target: 'source_evidence', id: 'conv_api1' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('"project_id" is required');
    expect(mockApiClient.sourceThreads.evidence).not.toHaveBeenCalled();
  });

  it('refuses direct-storage source evidence reads', async () => {
    const result = await queryHandler({
      target: 'source_evidence',
      id: 'conv_test1',
      project_id: 'proj_test1',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('T3X_MCP_BACKEND=api');
  });

  it('reads a project-scoped Workspace only through the authenticated API capability', async () => {
    process.env.T3X_MCP_BACKEND = 'api';
    mockApiClient.workspaces.get.mockResolvedValueOnce({
      candidate_id: 'candidate_1',
      workspace: { id: 'workspace_1', projectId: 'proj_api1', revision: 2 },
    });

    const result = await queryHandler({
      target: 'workspace',
      id: 'workspace_1',
      project_id: 'proj_api1',
    });

    expect(result.isError).toBeUndefined();
    expect(mockApiClient.workspaces.get).toHaveBeenCalledWith('proj_api1', 'workspace_1');
  });

  it('lists persisted Workspaces only through the authenticated API capability', async () => {
    process.env.T3X_MCP_BACKEND = 'api';
    mockApiClient.workspaces.list.mockResolvedValueOnce({
      workspaces: [{ id: 'workspace_1', projectId: 'proj_api1', revision: 2 }],
    });

    const result = await queryHandler({
      target: 'workspaces',
      project_id: 'proj_api1',
    });

    expect(result.isError).toBeUndefined();
    expect(mockApiClient.workspaces.list).toHaveBeenCalledWith('proj_api1');
    expect(JSON.parse(result.content[0].text)).toHaveLength(1);
  });

  it('refuses direct-storage Workspace reads', async () => {
    const result = await queryHandler({
      target: 'workspace',
      id: 'workspace_1',
      project_id: 'proj_test1',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('T3X_MCP_BACKEND=api');
  });

  it('lists commits by project', async () => {
    const result = await queryHandler({ target: 'commits', project_id: 'proj_test1' });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(Array.isArray(data)).toBe(true);
    expect(data[0].digest).toBe('sha256:abc');
  });

  it('lists leaves by project', async () => {
    const result = await queryHandler({ target: 'leaves', project_id: 'proj_test1' });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(Array.isArray(data)).toBe(true);
    expect(data[0].id).toBe('leaf_test1');
  });

  it('lists pins by project', async () => {
    const result = await queryHandler({ target: 'pins', project_id: 'proj_test1' });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(Array.isArray(data)).toBe(true);
    expect(data[0].id).toBe('pin_test1');
  });

  it('lists branches by project', async () => {
    const result = await queryHandler({ target: 'branches', project_id: 'proj_test1' });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(Array.isArray(data)).toBe(true);
    expect(data[0].name).toBe('main');
  });

  it('lists source threads by project', async () => {
    const result = await queryHandler({
      target: 'source_threads',
      project_id: 'proj_test1',
    });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(Array.isArray(data)).toBe(true);
    expect(data[0].conversationId).toBe('conv_test1');
  });

  // ── Edge cases ──

  it('returns not-found for missing commit', async () => {
    const result = await queryHandler({
      target: 'commit',
      id: 'sha256:missing',
      project_id: 'proj_test1',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Commit not found');
  });

  it('passes pagination to CommitV2 history queries', async () => {
    const { listCommitHistory } = await import('@t3x-dev/storage');
    const mock = listCommitHistory as ReturnType<typeof vi.fn>;
    mock.mockClear();

    await queryHandler({
      target: 'commits',
      project_id: 'proj_test1',
      limit: 5,
      offset: 10,
    });

    expect(mock).toHaveBeenCalledWith(mockDB, 'proj_test1', { limit: 5, offset: 10 });
  });
});
