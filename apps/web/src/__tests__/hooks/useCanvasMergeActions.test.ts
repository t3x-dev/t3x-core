// @vitest-environment jsdom
/**
 * Canary tests for useCanvasMergeActions (v2 Phase 1.3 PR 7e).
 *
 * Validates that prepare + execute I/O now live in the hook and that
 * canvasMergeSlice exposes only passive setters (setMergePrepared,
 * appendMergeCommit, setMergeLoading, setMergeError).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupRoots, renderHook, waitForHook } from './renderHook';

vi.mock('@/commands/merge', () => ({
  prepareMerge: vi.fn(),
  executeMerge: vi.fn(),
}));

import { executeMerge, prepareMerge } from '@/commands/merge';
import { useCanvasMergeActions } from '@/hooks/canvas/useCanvasMergeActions';
import { useCanvasStore } from '@/store/canvasStore';

function resetStore() {
  useCanvasStore.setState({
    nodes: [],
    edges: [],
    mergeState: null,
    mergeLoading: false,
    mergeError: null,
    notifyCallback: null,
  });
}

const EMPTY_PREPARED = {
  autoKept: [],
  conflicts: [],
  onlyInSource: [],
  onlyInTarget: [],
  relationsOnlyInSource: [],
  relationsOnlyInTarget: [],
  relationsInBoth: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
});

afterEach(() => {
  cleanupRoots();
});

describe('useCanvasMergeActions.prepare', () => {
  it('sets mergeState via setMergePrepared on success', async () => {
    vi.mocked(prepareMerge).mockResolvedValueOnce(EMPTY_PREPARED as never);

    const { result } = renderHook(() => useCanvasMergeActions());
    await result.current.prepare('sha256:a', 'sha256:b');
    await waitForHook();

    const state = useCanvasStore.getState();
    expect(state.mergeState?.sourceHash).toBe('sha256:a');
    expect(state.mergeState?.targetHash).toBe('sha256:b');
    expect(state.mergeLoading).toBe(false);
    expect(state.mergeError).toBeNull();
  });

  it('records an error and rethrows when the API rejects', async () => {
    const notify = vi.fn();
    useCanvasStore.setState({ notifyCallback: notify });
    vi.mocked(prepareMerge).mockRejectedValueOnce(new Error('boom'));

    const { result } = renderHook(() => useCanvasMergeActions());
    await expect(result.current.prepare('sha256:a', 'sha256:b')).rejects.toThrow('boom');
    await waitForHook();

    const state = useCanvasStore.getState();
    expect(state.mergeError).toBe('boom');
    expect(state.mergeLoading).toBe(false);
    expect(notify).toHaveBeenCalledWith('Failed to prepare merge: boom', 'error');
  });
});

describe('useCanvasMergeActions.execute', () => {
  it('throws when no merge is in progress', async () => {
    const { result } = renderHook(() => useCanvasMergeActions());
    await expect(result.current.execute('message')).rejects.toThrow('No merge in progress');
  });

  it('appends merge commit node + parent edges on success', async () => {
    useCanvasStore.setState({
      mergeState: {
        sourceHash: 'sha256:src',
        targetHash: 'sha256:tgt',
        prepared: EMPTY_PREPARED,
      },
    });
    vi.mocked(executeMerge).mockResolvedValueOnce({
      hash: 'sha256:merge',
      parents: ['sha256:src', 'sha256:tgt'],
      author: { type: 'human', name: 'User' },
      committed_at: '2026-04-13T00:00:00Z',
      content: { trees: [], relations: [] },
      message: 'Merge',
      branch: 'main',
    } as never);

    const { result } = renderHook(() => useCanvasMergeActions());
    const commit = await result.current.execute('Merge');
    await waitForHook();

    expect(commit.hash).toBe('sha256:merge');
    const state = useCanvasStore.getState();
    expect(state.mergeState).toBeNull();
    expect(state.nodes.find((n) => n.id === 'sha256:merge')).toBeDefined();
    expect(state.edges).toHaveLength(2);
  });
});
