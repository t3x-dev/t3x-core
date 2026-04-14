// @vitest-environment jsdom
/**
 * Canary test for the passive-store migration pattern (v2 Phase 1.3).
 *
 * useCanvasLeafActions was shipped without tests in PR #766. This file
 * validates the renderHook + mocked-queries + passive-store approach
 * end-to-end, so subsequent canvas-slice migrations (nodes, commit,
 * merge) can replicate the setup with confidence.
 */
import type { Node } from '@xyflow/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupRoots, renderHook, waitForHook } from './renderHook';

// Mock the commands layer so the hook exercises pure state transitions.
vi.mock('@/commands/leaves', () => ({
  createLeaf: vi.fn(),
  deleteLeaf: vi.fn(),
}));

import { createLeaf, deleteLeaf } from '@/commands/leaves';
import { useCanvasLeafActions } from '@/hooks/canvas/useCanvasLeafActions';
import { useCanvasStore } from '@/store/canvasStore';
import type { CanvasNodeData } from '@/types/nodes';

function committedUnit(id: string, commitHash: string): Node<CanvasNodeData> {
  return {
    id,
    type: 'unit',
    position: { x: 0, y: 0 },
    data: {
      kind: 'unit',
      entryId: id,
      title: 'Unit',
      summary: '',
      status: 'committed',
      timestamp: 'now',
      tags: [],
      commitStatus: 'committed',
      commitHash,
      conversationId: `conv_${id}`,
    },
  };
}

function resetStore() {
  useCanvasStore.setState({
    nodes: [],
    edges: [],
    leafPanelOpen: false,
    leafPanelCommitId: undefined,
    leafCreating: false,
    projectId: null,
    notifyCallback: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
});

afterEach(() => {
  cleanupRoots();
});

describe('useCanvasLeafActions.add', () => {
  it('creates a leaf, embeds it in the parent commit node, and closes the panel', async () => {
    useCanvasStore.setState({
      nodes: [committedUnit('unit-1', 'sha256:abc')],
      leafPanelOpen: true,
      leafPanelCommitId: 'unit-1',
      projectId: 'proj_1',
    });

    vi.mocked(createLeaf).mockResolvedValue({
      id: 'leaf_mock',
      commit_hash: 'sha256:abc',
      type: 'tweet',
      title: 'Twitter',
      constraints: [],
      config: {},
      output: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    } as never);

    const { result } = renderHook(() => useCanvasLeafActions());
    const leafId = await result.current.add('tweet');
    await waitForHook();

    expect(leafId).toBe('leaf_mock');
    expect(createLeaf).toHaveBeenCalledWith(
      expect.objectContaining({ commit_hash: 'sha256:abc', type: 'tweet', project_id: 'proj_1' })
    );

    const state = useCanvasStore.getState();
    expect(state.leafPanelOpen).toBe(false);
    expect(state.leafCreating).toBe(false);
    expect(state.nodes[0].data.leaves).toHaveLength(1);
    expect(state.nodes[0].data.leaves?.[0]).toMatchObject({ id: 'leaf_mock', type: 'tweet' });
  });

  it('returns null and notifies when no commit is selected', async () => {
    const notify = vi.fn();
    useCanvasStore.setState({
      leafPanelOpen: true,
      leafPanelCommitId: undefined,
      projectId: 'proj_1',
      notifyCallback: notify,
    });

    const { result } = renderHook(() => useCanvasLeafActions());
    const leafId = await result.current.add('tweet');
    await waitForHook();

    expect(leafId).toBeNull();
    expect(createLeaf).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith('No commit selected', 'error');
  });

  it('returns null and keeps the panel open when the API rejects', async () => {
    const notify = vi.fn();
    useCanvasStore.setState({
      nodes: [committedUnit('unit-1', 'sha256:abc')],
      leafPanelOpen: true,
      leafPanelCommitId: 'unit-1',
      projectId: 'proj_1',
      notifyCallback: notify,
    });
    vi.mocked(createLeaf).mockRejectedValue(new Error('API down'));

    const { result } = renderHook(() => useCanvasLeafActions());
    const leafId = await result.current.add('tweet');
    await waitForHook();

    expect(leafId).toBeNull();
    expect(notify).toHaveBeenCalledWith('API down', 'error');
    const state = useCanvasStore.getState();
    expect(state.leafPanelOpen).toBe(true);
    expect(state.leafCreating).toBe(false);
    expect(state.nodes[0].data.leaves ?? []).toHaveLength(0);
  });
});

describe('useCanvasLeafActions.remove', () => {
  it('deletes the leaf from state on API success', async () => {
    const notify = vi.fn();
    const node = committedUnit('unit-1', 'sha256:abc');
    node.data.leaves = [
      { id: 'leaf_1', type: 'tweet', title: 'T', status: 'idle', createdAt: '' },
      { id: 'leaf_2', type: 'email', title: 'E', status: 'idle', createdAt: '' },
    ];
    useCanvasStore.setState({ nodes: [node], notifyCallback: notify });
    vi.mocked(deleteLeaf).mockResolvedValue(undefined as never);

    const { result } = renderHook(() => useCanvasLeafActions());
    await result.current.remove('unit-1', 'leaf_1');
    await waitForHook();

    expect(deleteLeaf).toHaveBeenCalledWith('leaf_1');
    const state = useCanvasStore.getState();
    expect(state.nodes[0].data.leaves).toHaveLength(1);
    expect(state.nodes[0].data.leaves?.[0].id).toBe('leaf_2');
    expect(notify).toHaveBeenCalledWith('Leaf deleted', 'success');
  });

  it('keeps state intact and notifies on API failure', async () => {
    const notify = vi.fn();
    const node = committedUnit('unit-1', 'sha256:abc');
    node.data.leaves = [{ id: 'leaf_1', type: 'tweet', title: 'T', status: 'idle', createdAt: '' }];
    useCanvasStore.setState({ nodes: [node], notifyCallback: notify });
    vi.mocked(deleteLeaf).mockRejectedValue(new Error('Delete failed'));

    const { result } = renderHook(() => useCanvasLeafActions());
    await result.current.remove('unit-1', 'leaf_1');
    await waitForHook();

    expect(notify).toHaveBeenCalledWith('Delete failed', 'error');
    expect(useCanvasStore.getState().nodes[0].data.leaves).toHaveLength(1);
  });
});
