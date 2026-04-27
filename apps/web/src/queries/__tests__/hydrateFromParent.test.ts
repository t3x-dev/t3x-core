import type { TreeNode } from '@t3x-dev/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fetchers from '../chatInitFetch';
import { fetchParentCommitData } from '../hydrateFromParent';

beforeEach(() => {
  vi.restoreAllMocks();
});

const HASH = 'sha256:parent123';

const treesWithOneNode: TreeNode[] = [
  { key: 'trip', slots: { destination: 'Hangzhou' }, children: [] },
];

function mockCommit(overrides: {
  trees?: TreeNode[];
  sources?: Array<{ type: string; id?: string }>;
  branch?: string;
}): void {
  vi.spyOn(fetchers, 'fetchCommitForInheritance').mockResolvedValue({
    hash: HASH,
    parents: [],
    committed_at: '2026-04-12T00:00:00Z',
    author: { type: 'human', id: 'u1', name: 'e' },
    project_id: 'proj_1',
    branch: overrides.branch ?? 'main',
    message: '',
    content: { trees: overrides.trees ?? [], relations: [] },
    sources: overrides.sources,
  } as never);
}

describe('fetchParentCommitData', () => {
  it('returns parentConversationId when commit sources include a conversation', async () => {
    mockCommit({
      trees: treesWithOneNode,
      sources: [{ type: 'conversation', id: 'conv_xyz' }],
    });

    const data = await fetchParentCommitData(HASH);

    expect(data.fetched).toBe(true);
    expect(data.parentConversationId).toBe('conv_xyz');
  });

  it('surfaces lastCommitHash + confirmedNodeIds when trees exist', async () => {
    mockCommit({ trees: treesWithOneNode, branch: '5' });

    const data = await fetchParentCommitData(HASH);

    expect(data.hasTrees).toBe(true);
    expect(data.lastCommitHash).toBe(HASH);
    expect(data.branch).toBe('5');
    expect(data.confirmedNodeIds).toMatchObject({ trip: true });
  });

  it('returns hasTrees=false when the parent commit has no trees', async () => {
    mockCommit({ trees: [] });
    const data = await fetchParentCommitData(HASH);
    expect(data.fetched).toBe(true);
    expect(data.hasTrees).toBe(false);
    expect(data.lastCommitHash).toBeNull();
    expect(data.confirmedNodeIds).toEqual({});
  });

  it('returns fetched=false with default blanks on fetch failure', async () => {
    vi.spyOn(fetchers, 'fetchCommitForInheritance').mockRejectedValue(new Error('boom'));

    const data = await fetchParentCommitData(HASH);

    expect(data).toEqual({
      parentConversationId: null,
      lastCommitHash: null,
      branch: null,
      confirmedNodeIds: {},
      hasTrees: false,
      fetched: false,
    });
  });

  it('returns null parentConversationId when sources have no conversation type', async () => {
    mockCommit({ trees: treesWithOneNode, sources: [{ type: 'leaf', id: 'leaf_1' }] });

    const data = await fetchParentCommitData(HASH);

    expect(data.parentConversationId).toBeNull();
    expect(data.hasTrees).toBe(true);
    expect(data.fetched).toBe(true);
  });
});
