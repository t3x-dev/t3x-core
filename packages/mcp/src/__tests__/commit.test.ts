import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ──

const mockDB = {
  transaction: <T>(fn: (tx: typeof mockDB) => Promise<T>) => fn(mockDB),
};
const mockApiClient = {
  commitFromDraft: vi.fn(),
};

vi.mock('../db.js', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
}));

vi.mock('@t3x-dev/api-client', () => ({
  createClient: vi.fn(() => mockApiClient),
}));

const MOCK_DRAFT_EDITING = {
  id: 'draft_abc',
  project_id: 'proj_test1',
  title: 'Test draft',
  goal: undefined,
  parent_commit_hash: 'sha256:parent1',
  status: 'editing',
  committed_as: undefined,
  nodes: [
    { key: 'trip', slots: { budget: 5000, destination: 'Tokyo' }, children: [] },
    { key: 'pref', slots: { style: 'luxury' }, children: [] },
  ],
  revision: 3,
};

const MOCK_DRAFT_COMMITTED = {
  ...MOCK_DRAFT_EDITING,
  id: 'draft_done',
  status: 'committed',
  committed_as: 'sha256:already',
};

const MOCK_DRAFT_EMPTY = {
  ...MOCK_DRAFT_EDITING,
  id: 'draft_empty',
  nodes: [],
};

const MOCK_DRAFT_NO_PARENT = {
  ...MOCK_DRAFT_EDITING,
  id: 'draft_root',
  parent_commit_hash: undefined,
};

const MOCK_DRAFT_OTHER_PROJECT = {
  ...MOCK_DRAFT_EDITING,
  id: 'draft_other',
  project_id: 'proj_other',
};

const transitionMock = vi.hoisted(() => ({
  commitRepositoryYOpsState: vi.fn(),
  createRepositoryYOpsStateFromSemanticContent: vi.fn((content: unknown) => ({ content })),
  getRepositoryConversationEvidence: vi.fn(() => Promise.resolve([])),
}));

vi.mock('@t3x-dev/api/repository-state-transition', () => transitionMock);

const storageMock = vi.hoisted(() => ({
  commitDraft: vi.fn(() => Promise.resolve(true)),
  ensureMainBranch: vi.fn(() => Promise.resolve()),
  getTransitionRefHead: vi.fn(() =>
    Promise.resolve({ format: 'transition_v2', head: 'sha256:parent1' })
  ),
}));

vi.mock('@t3x-dev/storage', () => ({
  findDraftById: vi.fn((_db: unknown, id: string) => {
    const drafts: Record<string, unknown> = {
      draft_abc: MOCK_DRAFT_EDITING,
      draft_done: MOCK_DRAFT_COMMITTED,
      draft_empty: MOCK_DRAFT_EMPTY,
      draft_root: MOCK_DRAFT_NO_PARENT,
      draft_other: MOCK_DRAFT_OTHER_PROJECT,
    };
    return Promise.resolve(drafts[id] ?? null);
  }),
  commitDraft: storageMock.commitDraft,
  ensureMainBranch: storageMock.ensureMainBranch,
  getTransitionRefHead: storageMock.getTransitionRefHead,
  TransitionHeadConflictError: class TransitionHeadConflictError extends Error {},
  TransitionRefNotFoundError: class TransitionRefNotFoundError extends Error {},
}));

// ── Import handler after mocks ──

import { commitHandler } from '../tools/core/commit.js';

// ── Tests ──

const originalBackend = process.env.T3X_MCP_BACKEND;

describe('t3x_commit handler', () => {
  beforeEach(() => {
    storageMock.commitDraft.mockClear();
    storageMock.ensureMainBranch.mockClear();
    storageMock.getTransitionRefHead.mockReset();
    storageMock.getTransitionRefHead.mockResolvedValue({
      format: 'transition_v2',
      head: 'sha256:parent1',
    });
    transitionMock.createRepositoryYOpsStateFromSemanticContent.mockClear();
    transitionMock.commitRepositoryYOpsState.mockReset();
    transitionMock.commitRepositoryYOpsState.mockImplementation(
      (input: { expectedHead: string | null }) =>
        Promise.resolve({
          commitDigest: 'sha256:newcommit',
          commit: {
            schema: 't3x/commit/v2',
            parents:
              input.expectedHead === null
                ? []
                : [
                    {
                      kind: 'commit',
                      schema: 't3x/commit/v2',
                      digest: input.expectedHead,
                    },
                  ],
          },
          transition: {},
        })
    );
  });

  afterEach(() => {
    if (originalBackend === undefined) {
      delete process.env.T3X_MCP_BACKEND;
    } else {
      process.env.T3X_MCP_BACKEND = originalBackend;
    }
  });

  // ── Validation errors ──

  it('returns error when project_id is missing', async () => {
    const result = await commitHandler({ draft_id: 'draft_abc', message: 'msg' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('"project_id" is required');
  });

  it('returns error when draft_id is missing', async () => {
    const result = await commitHandler({ project_id: 'proj_test1', message: 'msg' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('"draft_id" is required');
  });

  it('returns error when message is missing', async () => {
    const result = await commitHandler({ project_id: 'proj_test1', draft_id: 'draft_abc' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('"message" is required');
  });

  it('uses api client commitFromDraft when api backend is enabled', async () => {
    process.env.T3X_MCP_BACKEND = 'api';
    mockApiClient.commitFromDraft.mockResolvedValueOnce({
      commit_hash: 'sha256:api-commit',
      tree_count: 1,
      branch: 'main',
    });

    const { getDB } = await import('../db.js');
    const getDBMock = getDB as ReturnType<typeof vi.fn>;
    const beforeCalls = getDBMock.mock.calls.length;

    const result = await commitHandler({
      project_id: 'proj_test1',
      draft_id: 'draft_abc',
      message: 'API commit',
    });

    expect(result.isError).toBeUndefined();
    expect(mockApiClient.commitFromDraft).toHaveBeenCalledWith({
      project_id: 'proj_test1',
      draft_id: 'draft_abc',
      message: 'API commit',
      branch: 'main',
    });
    expect(getDBMock.mock.calls.length).toBe(beforeCalls);
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      commit_hash: 'sha256:api-commit',
      tree_count: 1,
      branch: 'main',
    });
  });

  // ── Draft lookup errors ──

  it('returns error when draft is not found', async () => {
    const result = await commitHandler({
      project_id: 'proj_test1',
      draft_id: 'draft_missing',
      message: 'msg',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Draft not found');
  });

  it('returns error when draft belongs to different project', async () => {
    const result = await commitHandler({
      project_id: 'proj_test1',
      draft_id: 'draft_other',
      message: 'msg',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('does not belong to project');
  });

  // ── Draft state errors ──

  it('returns error when draft is already committed', async () => {
    const result = await commitHandler({
      project_id: 'proj_test1',
      draft_id: 'draft_done',
      message: 'msg',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('must be "editing"');
    expect(result.content[0].text).toContain('already committed');
  });

  it('returns error when draft has no trees', async () => {
    const result = await commitHandler({
      project_id: 'proj_test1',
      draft_id: 'draft_empty',
      message: 'msg',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('no trees to commit');
  });

  // ── Success ──

  it('creates commit and returns hash on success', async () => {
    const result = await commitHandler({
      project_id: 'proj_test1',
      draft_id: 'draft_abc',
      message: 'Initial extraction',
    });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.commit_hash).toBe('sha256:newcommit');
    expect(data.branch).toBe('main');
    expect(data.parents).toEqual(['sha256:parent1']);
    expect(data.schema).toBe('t3x/commit/v2');
    expect(data.tree_count).toBe(2);
    expect(data.next_steps).toBeDefined();
    expect(Array.isArray(data.next_steps)).toBe(true);
  });

  it('creates a root commit when draft has no parent commit hash', async () => {
    storageMock.getTransitionRefHead.mockResolvedValueOnce({ format: 'empty', head: null });
    const result = await commitHandler({
      project_id: 'proj_test1',
      draft_id: 'draft_root',
      message: 'Initial extraction',
    });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.parents).toEqual([]);
  });

  it('rejects a stale draft parent instead of silently rebasing it', async () => {
    storageMock.getTransitionRefHead.mockResolvedValueOnce({
      format: 'transition_v2',
      head: 'sha256:newer-head',
    });

    const result = await commitHandler({
      project_id: 'proj_test1',
      draft_id: 'draft_abc',
      message: 'Stale snapshot',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('does not match the target ref head');
    expect(transitionMock.commitRepositoryYOpsState).not.toHaveBeenCalled();
    expect(storageMock.commitDraft).not.toHaveBeenCalled();
  });

  it('passes exact state transition arguments to the shared application service', async () => {
    await commitHandler({
      project_id: 'proj_test1',
      draft_id: 'draft_abc',
      message: 'My commit',
      branch: 'feature-x',
    });

    expect(transitionMock.commitRepositoryYOpsState).toHaveBeenCalledWith(
      expect.objectContaining({
        db: mockDB,
        projectId: 'proj_test1',
        refName: 'feature-x',
        expectedHead: 'sha256:parent1',
        actor: { kind: 'human', id: 'human:mcp-local' },
        intent: 'My commit',
      })
    );
  });

  it('marks draft as committed after creating commit', async () => {
    await commitHandler({
      project_id: 'proj_test1',
      draft_id: 'draft_abc',
      message: 'msg',
    });

    expect(storageMock.commitDraft).toHaveBeenCalledWith(mockDB, 'draft_abc', 'sha256:newcommit');
  });

  it('defaults branch to "main" when not provided', async () => {
    await commitHandler({
      project_id: 'proj_test1',
      draft_id: 'draft_abc',
      message: 'msg',
    });

    expect(transitionMock.commitRepositoryYOpsState).toHaveBeenCalledWith(
      expect.objectContaining({ refName: 'main' })
    );
  });
});
