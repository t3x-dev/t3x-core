import { describe, expect, it, vi } from 'vitest';

// ── Mocks ──

const mockDB = {};

vi.mock('../db.js', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
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

const MOCK_DRAFT = {
  id: 'draft_test1',
  project_id: 'proj_test1',
  title: 'Workbench Draft',
  status: 'editing',
  revision: 3,
};

const MOCK_AGENT_DRAFT = {
  draftId: 'agent_draft_test1',
  projectId: 'proj_test1',
  text: 'agent draft text',
  status: 'ephemeral',
};

const MOCK_COMMIT = {
  hash: 'sha256:abc',
  schema: 't3x/commit/v4',
  parents: [],
  content: { trees: [], relations: [] },
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
  findDraftById: vi.fn((_db: unknown, id: string) =>
    Promise.resolve(id === 'draft_test1' ? MOCK_DRAFT : null)
  ),
  listDraftsByProject: vi.fn(() => Promise.resolve([MOCK_DRAFT])),
  findAgentDraftById: vi.fn((_db: unknown, id: string) =>
    Promise.resolve(id === 'agent_draft_test1' ? MOCK_AGENT_DRAFT : null)
  ),
  findAgentDraftsByProject: vi.fn(() => Promise.resolve([MOCK_AGENT_DRAFT])),
  getCommit: vi.fn((_db: unknown, hash: string) =>
    Promise.resolve(hash === 'sha256:abc' ? MOCK_COMMIT : null)
  ),
  listCommits: vi.fn(() => Promise.resolve([MOCK_COMMIT])),
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

describe('t3x_query handler', () => {
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

  it('returns a draft by id', async () => {
    const result = await queryHandler({ target: 'draft', id: 'draft_test1' });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.id).toBe('draft_test1');
    expect(data.title).toBe('Workbench Draft');
  });

  it('returns an agent draft by id', async () => {
    const result = await queryHandler({ target: 'agent_draft', id: 'agent_draft_test1' });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.draftId).toBe('agent_draft_test1');
  });

  it('returns a commit by hash', async () => {
    const result = await queryHandler({ target: 'commit', id: 'sha256:abc' });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.hash).toBe('sha256:abc');
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

  it('returns a conversation by id', async () => {
    const result = await queryHandler({ target: 'conversation', id: 'conv_test1' });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.conversationId).toBe('conv_test1');
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

  it('lists drafts by project', async () => {
    const result = await queryHandler({ target: 'drafts', project_id: 'proj_test1' });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(Array.isArray(data)).toBe(true);
    expect(data[0].id).toBe('draft_test1');
  });

  it('passes limit and offset to workbench draft list queries', async () => {
    const { listDraftsByProject } = await import('@t3x-dev/storage');
    const mock = listDraftsByProject as ReturnType<typeof vi.fn>;
    mock.mockClear();

    await queryHandler({
      target: 'drafts',
      project_id: 'proj_test1',
      limit: 5,
      offset: 10,
    });

    expect(mock).toHaveBeenCalledWith(mockDB, 'proj_test1', {
      limit: 5,
      offset: 10,
    });
  });

  it('lists commits by project', async () => {
    const result = await queryHandler({ target: 'commits', project_id: 'proj_test1' });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(Array.isArray(data)).toBe(true);
    expect(data[0].hash).toBe('sha256:abc');
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

  it('lists conversations by project', async () => {
    const result = await queryHandler({
      target: 'conversations',
      project_id: 'proj_test1',
    });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(Array.isArray(data)).toBe(true);
    expect(data[0].conversationId).toBe('conv_test1');
  });

  // ── Edge cases ──

  it('returns not-found for missing commit', async () => {
    const result = await queryHandler({ target: 'commit', id: 'sha256:missing' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Commit not found');
  });

  it('passes limit and offset to agent draft list queries when explicitly requested', async () => {
    const { findAgentDraftsByProject } = await import('@t3x-dev/storage');
    const mock = findAgentDraftsByProject as ReturnType<typeof vi.fn>;
    mock.mockClear();

    await queryHandler({
      target: 'agent_drafts',
      project_id: 'proj_test1',
      limit: 5,
      offset: 10,
    });

    expect(mock).toHaveBeenCalledWith(mockDB, {
      projectId: 'proj_test1',
      limit: 5,
      offset: 10,
    });
  });

  it('passes branch filter to commits query', async () => {
    const { listCommits } = await import('@t3x-dev/storage');
    const mock = listCommits as ReturnType<typeof vi.fn>;
    mock.mockClear();

    await queryHandler({
      target: 'commits',
      project_id: 'proj_test1',
      branch: 'feature-x',
    });

    expect(mock).toHaveBeenCalledWith(mockDB, expect.objectContaining({ branch: 'feature-x' }));
  });
});
