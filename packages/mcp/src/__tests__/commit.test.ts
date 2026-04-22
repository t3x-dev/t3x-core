import { describe, expect, it, vi } from 'vitest';

// ── Mocks ──

const mockDB = {};

vi.mock('../db.js', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
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

const MOCK_COMMIT = {
  hash: 'sha256:newcommit',
  schema: 't3x/commit/v4',
  parents: ['sha256:parent1'],
  author: { type: 'human', name: 'mcp' },
  committed_at: '2026-04-13T00:00:00.000Z',
  content: { trees: [], relations: [] },
  project_id: 'proj_test1',
  message: 'Test commit',
  branch: 'main',
  provenance: { method: 'human_curation' },
  yops_log_ids: [],
  sources: null,
};

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
  createCommit: vi.fn(() => Promise.resolve(MOCK_COMMIT)),
  commitDraft: vi.fn(() => Promise.resolve(true)),
}));

// ── Import handler after mocks ──

import { commitHandler } from '../tools/core/commit.js';

// ── Tests ──

describe('t3x_commit handler', () => {
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
    expect(data.committed_at).toBe('2026-04-13T00:00:00.000Z');
    expect(data.tree_count).toBe(2);
    expect(data.next_steps).toBeDefined();
    expect(Array.isArray(data.next_steps)).toBe(true);
  });

  it('creates a root commit when draft has no parent commit hash', async () => {
    const result = await commitHandler({
      project_id: 'proj_test1',
      draft_id: 'draft_root',
      message: 'Initial extraction',
    });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.parents).toEqual([]);
  });

  it('passes correct arguments to createCommit', async () => {
    const { createCommit } = await import('@t3x-dev/storage');
    const mock = createCommit as ReturnType<typeof vi.fn>;
    mock.mockClear();

    await commitHandler({
      project_id: 'proj_test1',
      draft_id: 'draft_abc',
      message: 'My commit',
      branch: 'feature-x',
    });

    expect(mock).toHaveBeenCalledWith(
      mockDB,
      expect.objectContaining({
        parents: ['sha256:parent1'],
        author: { type: 'human', name: 'mcp' },
        project_id: 'proj_test1',
        message: 'My commit',
        branch: 'feature-x',
      })
    );
  });

  it('marks draft as committed after creating commit', async () => {
    const { commitDraft } = await import('@t3x-dev/storage');
    const mock = commitDraft as ReturnType<typeof vi.fn>;
    mock.mockClear();

    await commitHandler({
      project_id: 'proj_test1',
      draft_id: 'draft_abc',
      message: 'msg',
    });

    expect(mock).toHaveBeenCalledWith(mockDB, 'draft_abc', 'sha256:newcommit');
  });

  it('defaults branch to "main" when not provided', async () => {
    const { createCommit } = await import('@t3x-dev/storage');
    const mock = createCommit as ReturnType<typeof vi.fn>;
    mock.mockClear();

    await commitHandler({
      project_id: 'proj_test1',
      draft_id: 'draft_abc',
      message: 'msg',
    });

    expect(mock).toHaveBeenCalledWith(mockDB, expect.objectContaining({ branch: 'main' }));
  });
});
