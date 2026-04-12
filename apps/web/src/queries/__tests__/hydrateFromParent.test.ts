import type { TreeNode } from '@t3x-dev/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fetchers from '../chatInitFetch';
import { hydrateFromParent } from '../hydrateFromParent';
import { useCommitStore } from '@/store/commitStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

function resetStores() {
  useCommitStore.setState({ lastCommitHash: null, confirmedNodeIds: {} });
  useWorkspaceStore.getState().reset();
}

beforeEach(() => {
  vi.restoreAllMocks();
  resetStores();
});

const HASH = 'sha256:parent123';

const treesWithOneNode: TreeNode[] = [
  { key: 'trip', slots: { destination: 'Hangzhou' }, children: [] },
];

function mockCommit(overrides: {
  trees?: TreeNode[];
  sources?: Array<{ type: string; id?: string }>;
}): void {
  vi.spyOn(fetchers, 'fetchCommitForInheritance').mockResolvedValue({
    hash: HASH,
    parents: [],
    committed_at: '2026-04-12T00:00:00Z',
    author: { type: 'human', id: 'u1', name: 'e' },
    project_id: 'proj_1',
    branch: 'main',
    message: '',
    content: { trees: overrides.trees ?? [], relations: [] },
    sources: overrides.sources,
  } as never);
}

describe('hydrateFromParent', () => {
  it('returns parentConversationId when the commit sources include a conversation', async () => {
    mockCommit({
      trees: treesWithOneNode,
      sources: [{ type: 'conversation', id: 'conv_xyz' }],
    });

    const result = await hydrateFromParent(HASH);

    expect(result.inherited).toBe(true);
    expect(result.parentConversationId).toBe('conv_xyz');
  });

  it('pins lastCommitHash and marks inherited trees as confirmed when trees exist', async () => {
    mockCommit({ trees: treesWithOneNode });

    await hydrateFromParent(HASH);

    expect(useCommitStore.getState().lastCommitHash).toBe(HASH);
    expect(useCommitStore.getState().confirmedNodeIds).toMatchObject({ trip: true });
  });

  it('expands the YOps panel only when trees are present', async () => {
    // trees empty — panel should stay collapsed
    mockCommit({ trees: [] });
    await hydrateFromParent(HASH);
    expect(useWorkspaceStore.getState().panelExpanded).toBe(false);

    // trees present — panel expands
    resetStores();
    mockCommit({ trees: treesWithOneNode });
    await hydrateFromParent(HASH);
    expect(useWorkspaceStore.getState().panelExpanded).toBe(true);
  });

  it('does not clobber an already-expanded panel', async () => {
    useWorkspaceStore.getState().setPanelExpanded(true);
    mockCommit({ trees: treesWithOneNode });
    await hydrateFromParent(HASH);
    expect(useWorkspaceStore.getState().panelExpanded).toBe(true);
  });

  it('returns inherited=false and leaves stores untouched when the fetch fails', async () => {
    vi.spyOn(fetchers, 'fetchCommitForInheritance').mockRejectedValue(new Error('boom'));

    const result = await hydrateFromParent(HASH);

    expect(result).toEqual({ parentConversationId: null, inherited: false });
    expect(useCommitStore.getState().lastCommitHash).toBeNull();
    expect(useCommitStore.getState().confirmedNodeIds).toEqual({});
  });

  it('returns inherited=true with null parentConversationId when sources have no conversation', async () => {
    mockCommit({ trees: treesWithOneNode, sources: [{ type: 'leaf', id: 'leaf_1' }] });

    const result = await hydrateFromParent(HASH);

    expect(result).toEqual({ parentConversationId: null, inherited: true });
  });
});
