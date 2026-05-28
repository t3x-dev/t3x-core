// @vitest-environment jsdom
/**
 * Canary tests for useCommitActions (commitStore migration).
 *
 * Validates that commit + init async I/O lives in the hook and that
 * commitStore exposes only passive setters (setIsCommitting,
 * setCommitError, setCommitSuccess, setInitialCommit).
 */
import type { TreeNode } from '@t3x-dev/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupRoots, renderHook, waitForHook } from './renderHook';

vi.mock('@/queries/commits', () => ({
  fetchCommits: vi.fn(),
}));

vi.mock('@/commands/commits', () => ({
  createCommit: vi.fn(),
}));

vi.mock('@/domain/enrichSourceRefs', () => ({
  enrichTreesWithSourceRefs: vi.fn((trees: TreeNode[]) => trees),
}));

import { createCommit } from '@/commands/commits';
import { useCommitActions } from '@/hooks/commits/useCommitActions';
import { fetchCommits } from '@/queries/commits';
import { useCommitStore } from '@/store/commitStore';
import { usePinsStore } from '@/store/pinsStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

function tree(key: string): TreeNode {
  return { id: key, key, slots: { value: 'x' }, children: [] } as unknown as TreeNode;
}

function resetStores() {
  useCommitStore.setState({
    confirmedNodeIds: {},
    confirmedSlotKeys: {},
    manualEditedNodeIds: new Set(),
    lastCommitHash: null,
    beforeCommitHash: null,
    committedNodeIds: {},
    committedNodeSnapshot: {},
    commitBranch: 'main',
    projectId: null,
    conversationTitle: null,
    isCommitting: false,
    commitError: null,
  });
  useWorkspaceStore.setState({
    tree: { trees: [], relations: [] },
    sourceIndex: new Map(),
    conversationId: null,
    lastExtractionPinIds: [],
  });
  usePinsStore.setState({ pins: [] });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStores();
});

afterEach(() => {
  cleanupRoots();
});

describe('useCommitActions.commit', () => {
  it('creates a commit and stores hash + committedNodeIds via setCommitSuccess', async () => {
    useCommitStore.setState({ projectId: 'proj_1' });
    useWorkspaceStore.setState({
      tree: { trees: [tree('budget')], relations: [] },
      conversationId: 'conv_1',
    });
    vi.mocked(createCommit).mockResolvedValueOnce({
      commit: { hash: 'sha256:new' },
    } as never);

    const { result } = renderHook(() => useCommitActions());
    const out = await result.current.commit('msg');
    await waitForHook();

    expect(out.hash).toBe('sha256:new');
    expect(createCommit).toHaveBeenCalledWith(
      'proj_1',
      expect.objectContaining({ trees: expect.any(Array), relations: [] }),
      expect.objectContaining({
        parents: [],
        branch: 'main',
        message: 'msg',
        sources: expect.arrayContaining([
          expect.objectContaining({ type: 'conversation', id: 'conv_1' }),
        ]),
        source_conversation_id: 'conv_1',
        provenance: { method: 'llm_extraction' },
      })
    );
    const state = useCommitStore.getState();
    expect(state.lastCommitHash).toBe('sha256:new');
    expect(state.committedNodeIds.budget).toBe(true);
    expect(state.isCommitting).toBe(false);
  });

  it('throws + records error when API rejects', async () => {
    useCommitStore.setState({ projectId: 'proj_1' });
    useWorkspaceStore.setState({
      tree: { trees: [tree('budget')], relations: [] },
    });
    vi.mocked(createCommit).mockRejectedValueOnce(new Error('500'));

    const { result } = renderHook(() => useCommitActions());
    await expect(result.current.commit('msg')).rejects.toThrow('500');
    await waitForHook();

    const state = useCommitStore.getState();
    expect(state.commitError).toBe('500');
    expect(state.isCommitting).toBe(false);
  });

  it('throws when no projectId', async () => {
    const { result } = renderHook(() => useCommitActions());
    await expect(result.current.commit('msg')).rejects.toThrow('No project ID');
  });
});

describe('useCommitActions.init', () => {
  it('seeds lastCommitHash + committed maps from HEAD via setInitialCommit', async () => {
    useCommitStore.getState().setProjectId('proj_1');
    vi.mocked(fetchCommits).mockResolvedValueOnce([
      {
        hash: 'sha256:head',
        content: { trees: [tree('a')] },
      },
    ] as never);

    const { result } = renderHook(() => useCommitActions());
    await result.current.init('proj_1');
    await waitForHook();

    const state = useCommitStore.getState();
    expect(state.lastCommitHash).toBe('sha256:head');
    expect(state.beforeCommitHash).toBe('sha256:head');
    expect(state.committedNodeIds.a).toBe(true);
    expect(fetchCommits).toHaveBeenCalledWith('proj_1', 'main', 1);
  });

  it('initializes from the requested branch head', async () => {
    useCommitStore.getState().setProjectId('proj_1');
    vi.mocked(fetchCommits).mockResolvedValueOnce([
      {
        hash: 'sha256:feature_head',
        content: { trees: [tree('branch_node')] },
      },
    ] as never);

    const { result } = renderHook(() => useCommitActions());
    const head = await result.current.init('proj_1', 'feature/work');
    await waitForHook();

    const state = useCommitStore.getState();
    expect(head).toBe('sha256:feature_head');
    expect(fetchCommits).toHaveBeenCalledWith('proj_1', 'feature/work', 1);
    expect(state.commitBranch).toBe('feature/work');
    expect(state.lastCommitHash).toBe('sha256:feature_head');
    expect(state.beforeCommitHash).toBe('sha256:feature_head');
  });

  it('is a silent no-op when there are no commits', async () => {
    useCommitStore.getState().setProjectId('proj_1');
    useCommitStore.setState({
      lastCommitHash: 'sha256:old',
      beforeCommitHash: 'sha256:old',
      committedNodeIds: { old: true },
      committedNodeSnapshot: { old: tree('old') },
    });
    vi.mocked(fetchCommits).mockResolvedValueOnce([] as never);

    const { result } = renderHook(() => useCommitActions());
    const head = await result.current.init('proj_1', 'empty');
    await waitForHook();

    const state = useCommitStore.getState();
    expect(head).toBeNull();
    expect(state.lastCommitHash).toBeNull();
    expect(state.beforeCommitHash).toBeNull();
    expect(state.commitBranch).toBe('empty');
    expect(state.committedNodeIds).toEqual({});
  });

  it('ignores an init response if the active project changed while it was loading', async () => {
    let resolveFetch: (value: unknown) => void = () => {};
    vi.mocked(fetchCommits).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }) as never
    );

    useCommitStore.getState().setProjectId('proj_old');
    const { result } = renderHook(() => useCommitActions());
    const initPromise = result.current.init('proj_old');

    useCommitStore.getState().setProjectId('proj_new');
    resolveFetch([
      {
        hash: 'sha256:old_head',
        content: { trees: [tree('old')] },
      },
    ]);
    await initPromise;
    await waitForHook();

    const state = useCommitStore.getState();
    expect(state.projectId).toBe('proj_new');
    expect(state.lastCommitHash).toBeNull();
    expect(state.committedNodeIds).toEqual({});
  });
});

describe('commitStore.setProjectId', () => {
  it('clears commit baselines and snapshots when switching projects', () => {
    useCommitStore.getState().setProjectId('proj_old');
    useCommitStore.setState({
      confirmedNodeIds: { old: true },
      confirmedSlotKeys: { old: { value: true } },
      manualEditedNodeIds: new Set(['old']),
      lastCommitHash: 'sha256:old_head',
      beforeCommitHash: 'sha256:old_parent',
      committedNodeIds: { old: true },
      committedNodeSnapshot: { old: tree('old') },
      conversationTitle: 'Old conversation',
      isCommitting: true,
      commitError: 'failed',
    });

    useCommitStore.getState().setProjectId('proj_new');

    const state = useCommitStore.getState();
    expect(state.projectId).toBe('proj_new');
    expect(state.lastCommitHash).toBeNull();
    expect(state.beforeCommitHash).toBeNull();
    expect(state.committedNodeIds).toEqual({});
    expect(state.committedNodeSnapshot).toEqual({});
    expect(state.confirmedNodeIds).toEqual({});
    expect(state.confirmedSlotKeys).toEqual({});
    expect(state.manualEditedNodeIds.size).toBe(0);
    expect(state.conversationTitle).toBeNull();
    expect(state.isCommitting).toBe(false);
    expect(state.commitError).toBeNull();
  });

  it('keeps commit baselines when setting the same project again', () => {
    useCommitStore.getState().setProjectId('proj_1');
    useCommitStore.setState({
      lastCommitHash: 'sha256:head',
      beforeCommitHash: 'sha256:parent',
      committedNodeIds: { a: true },
      committedNodeSnapshot: { a: tree('a') },
    });

    useCommitStore.getState().setProjectId('proj_1');

    const state = useCommitStore.getState();
    expect(state.lastCommitHash).toBe('sha256:head');
    expect(state.beforeCommitHash).toBe('sha256:parent');
    expect(state.committedNodeIds.a).toBe(true);
  });
});
