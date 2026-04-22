import { describe, expect, it, vi } from 'vitest';

// -- Mocks --

const mockDB = {};

vi.mock('../db.js', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
}));

// -- Mock data --

const MOCK_COMMIT_A = {
  hash: 'sha256:aaa',
  schema: 't3x/commit/v4',
  parents: [],
  content: {
    trees: [{ key: 'trip', type: 'node', slots: { budget: 5000 }, children: [] }],
    relations: [],
  },
};

const MOCK_COMMIT_B = {
  hash: 'sha256:bbb',
  schema: 't3x/commit/v4',
  parents: [],
  content: {
    trees: [{ key: 'trip', type: 'node', slots: { budget: 8000 }, children: [] }],
    relations: [],
  },
};

const MOCK_MERGE_DRAFT = {
  draftId: 'md_test1',
  projectId: 'proj_test1',
  sourceHash: 'sha256:aaa',
  targetHash: 'sha256:bbb',
  sourceBranch: null,
  targetBranch: 'main',
  preparedJson: JSON.stringify({
    autoKept: [],
    conflicts: [
      {
        path: 'trip',
        slotConflicts: [{ key: 'budget', sourceValue: 5000, targetValue: 8000 }],
      },
    ],
    onlyInSource: [],
    onlyInTarget: [],
    relationsOnlyInSource: [],
    relationsOnlyInTarget: [],
    relationsInBoth: [],
  }),
  status: 'pending',
  message: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const MOCK_MERGE_DRAFT_RESOLVED = {
  ...MOCK_MERGE_DRAFT,
  draftId: 'md_resolved',
  preparedJson: JSON.stringify({
    autoKept: [],
    conflicts: [
      {
        path: 'trip',
        slotConflicts: [{ key: 'budget', sourceValue: 5000, targetValue: 8000 }],
      },
    ],
    onlyInSource: [],
    onlyInTarget: [],
    relationsOnlyInSource: [],
    relationsOnlyInTarget: [],
    relationsInBoth: [],
    resolutions: {
      trip: { resolution: 'source', reasoning: 'Original budget is correct' },
    },
  }),
};

const MOCK_MERGE_DRAFT_CANCELLED = {
  ...MOCK_MERGE_DRAFT,
  draftId: 'md_cancelled',
  status: 'cancelled',
};

const MOCK_PROJECT = {
  projectId: 'proj_new',
  name: 'New Project',
  createdAt: new Date('2026-01-01'),
  metadataJson: null,
  deletedAt: null,
  ownerId: null,
};

const MOCK_BRANCH = {
  branchId: 'branch_feat',
  projectId: 'proj_test1',
  name: 'feature-x',
  parentBranch: 'main',
  headCommitHash: null,
  description: null,
  isCurrent: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const MOCK_PIN = {
  id: 'pin_new',
  project_id: 'proj_test1',
  type: 'conversation' as const,
  ref_id: 'conv_abc',
  pinned_at: '2026-01-01T00:00:00.000Z',
};

const MOCK_MERGED_COMMIT = {
  hash: 'sha256:merged',
  schema: 't3x/commit/v4',
  parents: ['sha256:aaa', 'sha256:bbb'],
  author: { type: 'human', name: 'mcp' },
  committed_at: '2026-04-13T00:00:00.000Z',
  content: { trees: [], relations: [] },
  project_id: 'proj_test1',
  message: 'Merge',
  branch: 'main',
};

// -- Storage mock --

vi.mock('@t3x-dev/storage', () => ({
  getCommit: vi.fn((_db: unknown, hash: string) => {
    const commits: Record<string, unknown> = {
      'sha256:aaa': MOCK_COMMIT_A,
      'sha256:bbb': MOCK_COMMIT_B,
    };
    return Promise.resolve(commits[hash] ?? null);
  }),
  createMergeDraft: vi.fn(() => Promise.resolve(MOCK_MERGE_DRAFT)),
  getMergeDraft: vi.fn((_db: unknown, id: string) => {
    const drafts: Record<string, unknown> = {
      md_test1: MOCK_MERGE_DRAFT,
      md_resolved: MOCK_MERGE_DRAFT_RESOLVED,
      md_cancelled: MOCK_MERGE_DRAFT_CANCELLED,
    };
    return Promise.resolve(drafts[id] ?? null);
  }),
  updateMergeDraft: vi.fn(() => Promise.resolve(MOCK_MERGE_DRAFT)),
  cancelMergeDraft: vi.fn(() => Promise.resolve(MOCK_MERGE_DRAFT)),
  createCommit: vi.fn(() => Promise.resolve(MOCK_MERGED_COMMIT)),
  insertProject: vi.fn(() => Promise.resolve(MOCK_PROJECT)),
  insertBranch: vi.fn(() => Promise.resolve(MOCK_BRANCH)),
  createPin: vi.fn(() => Promise.resolve(MOCK_PIN)),
  deletePin: vi.fn((_db: unknown, id: string) => Promise.resolve(id === 'pin_new')),
}));

// -- Core mock --

vi.mock('@t3x-dev/core', () => ({
  diffCommits: vi.fn(() => ({
    identical: [],
    modified: [
      {
        path: 'trip',
        slotDiffs: [{ key: 'budget', type: 'changed', oldValue: 5000, newValue: 8000 }],
      },
    ],
    onlyInSource: [],
    onlyInTarget: [],
    relationsAdded: [],
    relationsRemoved: [],
  })),
  prepareMerge: vi.fn(() => ({
    autoKept: [],
    conflicts: [
      { path: 'trip', slotConflicts: [{ key: 'budget', sourceValue: 5000, targetValue: 8000 }] },
    ],
    onlyInSource: [],
    onlyInTarget: [],
    relationsOnlyInSource: [],
    relationsOnlyInTarget: [],
    relationsInBoth: [],
  })),
  executeMerge: vi.fn(() => ({ trees: [], relations: [] })),
}));

// -- Import handlers after mocks --

import { adminHandler } from '../tools/advanced/admin.js';
import { diffHandler } from '../tools/advanced/diff.js';
import { mergeHandler } from '../tools/advanced/merge.js';

// ================================================================
// t3x_diff
// ================================================================

describe('t3x_diff handler', () => {
  it('rejects legacy source/target calls and requires base', async () => {
    const result = await diffHandler({
      source: 'sha256:aaa',
      target: 'sha256:bbb',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('"base" is required');
  });

  it('returns error when base is missing', async () => {
    const result = await diffHandler({ target: 'sha256:bbb' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('"base" is required');
  });

  it('returns error when target is missing', async () => {
    const result = await diffHandler({ base: 'sha256:aaa' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('"target" is required');
  });

  it('returns error when base commit not found', async () => {
    const result = await diffHandler({ base: 'sha256:missing', target: 'sha256:bbb' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Base commit not found');
  });

  it('returns error when target commit not found', async () => {
    const result = await diffHandler({ base: 'sha256:aaa', target: 'sha256:missing' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Target commit not found');
  });

  it('returns structured diff on success', async () => {
    const result = await diffHandler({ base: 'sha256:aaa', target: 'sha256:bbb' });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.base).toBe('sha256:aaa');
    expect(data.target).toBe('sha256:bbb');
    expect(data.summary.modified).toBe(1);
    expect(data.diff.modified).toHaveLength(1);
    expect(data.diff.modified[0].path).toBe('trip');
  });
});

// ================================================================
// t3x_merge
// ================================================================

describe('t3x_merge handler', () => {
  // -- Validation --

  it('returns error when action is missing', async () => {
    const result = await mergeHandler({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Missing or invalid "action"');
  });

  it('returns error when action is invalid', async () => {
    const result = await mergeHandler({ action: 'explode' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Missing or invalid "action"');
  });

  // -- prepare --

  it('prepare: returns error when project_id missing', async () => {
    const result = await mergeHandler({
      action: 'prepare',
      source_hash: 'sha256:aaa',
      target_hash: 'sha256:bbb',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('"project_id" is required');
  });

  it('prepare: returns draft with conflict summary', async () => {
    const result = await mergeHandler({
      action: 'prepare',
      project_id: 'proj_test1',
      source_hash: 'sha256:aaa',
      target_hash: 'sha256:bbb',
    });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.draft_id).toBe('md_test1');
    expect(data.summary.conflicts).toBe(1);
  });

  // -- show_conflict --

  it('show_conflict: returns error when draft_id missing', async () => {
    const result = await mergeHandler({ action: 'show_conflict', index: 0 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('"draft_id" is required');
  });

  it('show_conflict: returns conflict details', async () => {
    const result = await mergeHandler({ action: 'show_conflict', draft_id: 'md_test1', index: 0 });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.conflict.path).toBe('trip');
    expect(data.total_conflicts).toBe(1);
  });

  it('show_conflict: returns error for out-of-range index', async () => {
    const result = await mergeHandler({ action: 'show_conflict', draft_id: 'md_test1', index: 5 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('out of range');
  });

  // -- resolve --

  it('resolve: returns error when reasoning is missing', async () => {
    const result = await mergeHandler({
      action: 'resolve',
      draft_id: 'md_test1',
      index: 0,
      resolution: 'source',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('"reasoning" is required');
  });

  it('resolve: records resolution with reasoning', async () => {
    const result = await mergeHandler({
      action: 'resolve',
      draft_id: 'md_test1',
      index: 0,
      resolution: 'source',
      reasoning: 'The source budget is more accurate.',
    });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.resolved_path).toBe('trip');
    expect(data.resolution).toBe('source');
    expect(data.reasoning).toBe('The source budget is more accurate.');
  });

  it('resolve: rejects cancelled drafts', async () => {
    const result = await mergeHandler({
      action: 'resolve',
      draft_id: 'md_cancelled',
      index: 0,
      resolution: 'source',
      reasoning: 'reason',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('cancelled');
  });

  // -- execute --

  it('execute: returns error when not all conflicts resolved', async () => {
    const result = await mergeHandler({
      action: 'execute',
      draft_id: 'md_test1',
      message: 'Merge',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('0/1 conflicts resolved');
  });

  it('execute: creates merge commit when all resolved', async () => {
    const result = await mergeHandler({
      action: 'execute',
      draft_id: 'md_resolved',
      message: 'Merge feature',
    });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.commit_hash).toBe('sha256:merged');
    expect(data.parents).toEqual(['sha256:aaa', 'sha256:bbb']);
  });

  it('supports the documented prepare -> show_conflict -> resolve -> execute flow', async () => {
    const { getMergeDraft, updateMergeDraft } = await import('@t3x-dev/storage');

    vi.mocked(getMergeDraft)
      .mockResolvedValueOnce(MOCK_MERGE_DRAFT)
      .mockResolvedValueOnce(MOCK_MERGE_DRAFT)
      .mockResolvedValueOnce(MOCK_MERGE_DRAFT_RESOLVED);
    vi.mocked(updateMergeDraft).mockResolvedValueOnce(MOCK_MERGE_DRAFT_RESOLVED);

    const prepared = await mergeHandler({
      action: 'prepare',
      project_id: 'proj_test1',
      source_hash: 'sha256:aaa',
      target_hash: 'sha256:bbb',
    });
    expect(prepared.isError).toBeUndefined();
    expect(JSON.parse(prepared.content[0].text).draft_id).toBe('md_test1');

    const shown = await mergeHandler({ action: 'show_conflict', draft_id: 'md_test1', index: 0 });
    expect(shown.isError).toBeUndefined();
    expect(JSON.parse(shown.content[0].text).conflict.path).toBe('trip');

    const resolved = await mergeHandler({
      action: 'resolve',
      draft_id: 'md_test1',
      index: 0,
      resolution: 'source',
      reasoning: 'Original budget is correct',
    });
    expect(resolved.isError).toBeUndefined();
    expect(JSON.parse(resolved.content[0].text).resolution).toBe('source');

    const executed = await mergeHandler({
      action: 'execute',
      draft_id: 'md_test1',
      message: 'Merge feature',
    });
    expect(executed.isError).toBeUndefined();
    expect(JSON.parse(executed.content[0].text).commit_hash).toBe('sha256:merged');
  });

  // -- abort --

  it('abort: cancels a pending draft', async () => {
    const result = await mergeHandler({ action: 'abort', draft_id: 'md_test1' });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.status).toBe('cancelled');
  });

  it('abort: rejects already cancelled drafts', async () => {
    const result = await mergeHandler({ action: 'abort', draft_id: 'md_cancelled' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('cancelled');
  });
});

// ================================================================
// t3x_admin
// ================================================================

describe('t3x_admin handler', () => {
  // -- Validation --

  it('returns error when action is missing', async () => {
    const result = await adminHandler({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Missing or invalid "action"');
  });

  // -- create_project --

  it('create_project: returns error when name missing', async () => {
    const result = await adminHandler({ action: 'create_project' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('"name" is required');
  });

  it('create_project: creates project and returns id', async () => {
    const result = await adminHandler({ action: 'create_project', name: 'New Project' });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.project_id).toBe('proj_new');
    expect(data.name).toBe('New Project');
  });

  // -- create_branch --

  it('create_branch: returns error when project_id missing', async () => {
    const result = await adminHandler({ action: 'create_branch', name: 'feat' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('"project_id" is required');
  });

  it('create_branch: creates branch and returns id', async () => {
    const result = await adminHandler({
      action: 'create_branch',
      project_id: 'proj_test1',
      name: 'feature-x',
      parent_branch: 'main',
    });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.branch_id).toBe('branch_feat');
    expect(data.name).toBe('feature-x');
    expect(data.parent_branch).toBe('main');
  });

  // -- create_pin --

  it('create_pin: returns error when type missing', async () => {
    const result = await adminHandler({
      action: 'create_pin',
      project_id: 'proj_test1',
      ref_id: 'conv_abc',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('"type" is required');
  });

  it('create_pin: returns error for invalid type', async () => {
    const result = await adminHandler({
      action: 'create_pin',
      project_id: 'proj_test1',
      type: 'invalid',
      ref_id: 'conv_abc',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Invalid pin type');
  });

  it('create_pin: creates pin and returns result', async () => {
    const result = await adminHandler({
      action: 'create_pin',
      project_id: 'proj_test1',
      type: 'conversation',
      ref_id: 'conv_abc',
    });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.pin_id).toBe('pin_new');
    expect(data.type).toBe('conversation');
    expect(data.ref_id).toBe('conv_abc');
  });

  // -- delete_pin --

  it('delete_pin: returns error when pin_id missing', async () => {
    const result = await adminHandler({ action: 'delete_pin' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('"pin_id" is required');
  });

  it('delete_pin: deletes pin successfully', async () => {
    const result = await adminHandler({ action: 'delete_pin', pin_id: 'pin_new' });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.deleted).toBe(true);
  });

  it('delete_pin: returns error when pin not found', async () => {
    const result = await adminHandler({ action: 'delete_pin', pin_id: 'pin_missing' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not found or already deleted');
  });
});
