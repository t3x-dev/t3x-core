// @vitest-environment jsdom
/**
 * Canary tests for useCanvasNodeActions (v2 Phase 1.3, canvasNodeSlice migration).
 *
 * Validates that async I/O lives in the hook while the slice exposes only
 * passive setters (setProjectData/mergeProjectData/setLeavesByCommit/addToNodes).
 */
import type { Node } from '@xyflow/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupRoots, renderHook, waitForHook } from './renderHook';

vi.mock('@/infrastructure/commits', () => ({
  fetchCommits: vi.fn(),
}));
vi.mock('@/infrastructure/workspaces', () => ({
  listProjectWorkspaces: vi.fn(),
}));
vi.mock('@/domain/commitAnchors', () => ({
  parseApiCommitAnchors: vi.fn(() => null),
}));
vi.mock('@/queries/conversations', () => ({
  fetchAllConversations: vi.fn(),
}));
vi.mock('@/commands/conversations', () => ({
  createConversation: vi.fn(),
}));
vi.mock('@/queries/leaves', () => ({
  fetchLeavesByProject: vi.fn(),
}));
vi.mock('@/queries/turns', () => ({
  fetchTurn: vi.fn(),
}));

import { createConversation } from '@/commands/conversations';
import { useCanvasNodeActions } from '@/hooks/canvas/useCanvasNodeActions';
import { fetchCommits } from '@/infrastructure/commits';
import { listProjectWorkspaces } from '@/infrastructure/workspaces';
import { fetchAllConversations } from '@/queries/conversations';
import { fetchLeavesByProject } from '@/queries/leaves';
import { useCanvasStore } from '@/store/canvasStore';
import type { CanvasNodeData } from '@/types/nodes';

function stagingNode(id: string): Node<CanvasNodeData> {
  return {
    id,
    type: 'unit',
    position: { x: 0, y: 0 },
    data: {
      kind: 'unit',
      entryId: id,
      title: 'Pending',
      summary: '0 turns',
      status: 'staging',
      timestamp: '2026-04-12T00:00:00Z',
      tags: ['unit'],
      commitStatus: 'staging',
      conversationId: id,
    },
  };
}

function resetStore() {
  useCanvasStore.setState({
    nodes: [],
    edges: [],
    projectId: null,
    loading: false,
    loadError: null,
    hasMainCommit: false,
    latestMainCommitId: undefined,
    hasDbPositions: false,
    pendingConversations: [],
    notifyCallback: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
  vi.mocked(fetchAllConversations).mockResolvedValue([] as never);
  vi.mocked(fetchCommits).mockResolvedValue([] as never);
  vi.mocked(fetchLeavesByProject).mockResolvedValue([] as never);
  vi.mocked(listProjectWorkspaces).mockResolvedValue([] as never);
});

afterEach(() => {
  cleanupRoots();
});

describe('useCanvasNodeActions.load', () => {
  it('writes fetched data through setProjectData (non-merge mode)', async () => {
    const { result } = renderHook(() => useCanvasNodeActions());
    await result.current.load('proj_1');
    await waitForHook();

    const state = useCanvasStore.getState();
    expect(state.projectId).toBe('proj_1');
    expect(state.loading).toBe(false);
    expect(state.loadError).toBeNull();
    expect(fetchAllConversations).toHaveBeenCalledWith('proj_1');
    expect(listProjectWorkspaces).toHaveBeenCalledWith('proj_1');
  });

  it('records error state when the fetch rejects', async () => {
    vi.mocked(fetchAllConversations).mockRejectedValueOnce(new Error('network boom'));
    const { result } = renderHook(() => useCanvasNodeActions());
    await result.current.load('proj_1');
    await waitForHook();

    const state = useCanvasStore.getState();
    expect(state.loading).toBe(false);
    expect(state.loadError?.message).toBe('network boom');
  });
});

describe('useCanvasNodeActions.add', () => {
  it('creates a conversation without adding mutable work to the version graph', async () => {
    useCanvasStore.setState({ projectId: 'proj_1' });
    vi.mocked(createConversation).mockResolvedValueOnce({
      conversation_id: 'conv_new',
      title: 'Untitled Unit',
      created_at: '2026-04-12T00:00:00Z',
    } as never);

    const { result } = renderHook(() => useCanvasNodeActions());
    const conversation = await result.current.add('unit');
    await waitForHook();

    expect(conversation?.conversation_id).toBe('conv_new');
    expect(useCanvasStore.getState().nodes).toHaveLength(0);
  });

  it('notifies rather than creating when kind=leaf', async () => {
    const notify = vi.fn();
    useCanvasStore.setState({ projectId: 'proj_1', notifyCallback: notify });

    const { result } = renderHook(() => useCanvasNodeActions());
    await result.current.add('leaf');
    await waitForHook();

    expect(notify).toHaveBeenCalledWith(expect.stringContaining('Leaf'), 'warning');
    expect(useCanvasStore.getState().nodes).toHaveLength(0);
    expect(createConversation).not.toHaveBeenCalled();
  });

  it('allows another conversation while other work is pending', async () => {
    useCanvasStore.setState({
      projectId: 'proj_1',
      nodes: [stagingNode('conv_pending')],
    });
    vi.mocked(createConversation).mockResolvedValueOnce({
      conversation_id: 'conv_second',
      title: 'Untitled Unit',
      created_at: '2026-04-12T00:00:00Z',
    } as never);

    const { result } = renderHook(() => useCanvasNodeActions());
    await result.current.add('unit');
    await waitForHook();

    expect(createConversation).toHaveBeenCalled();
    expect(useCanvasStore.getState().nodes.map((node) => node.id)).toEqual(['conv_pending']);
  });
});
