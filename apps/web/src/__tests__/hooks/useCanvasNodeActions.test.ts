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

vi.mock('@/queries/commits', () => ({
  fetchCommits: vi.fn(),
}));
vi.mock('@/domain/commitAnchors', () => ({
  parseApiCommitAnchors: vi.fn(() => null),
}));
vi.mock('@/queries/conversations', () => ({
  fetchConversations: vi.fn(),
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
vi.mock('@/queries/workbenchDrafts', () => ({
  fetchWorkbenchDrafts: vi.fn(),
}));

vi.mock('@/commands/drafts', () => ({
  createWorkbenchDraft: vi.fn(),
}));

import { createConversation } from '@/commands/conversations';
import { createWorkbenchDraft } from '@/commands/drafts';
import { useCanvasNodeActions } from '@/hooks/canvas/useCanvasNodeActions';
import { fetchCommits } from '@/queries/commits';
import { fetchConversations } from '@/queries/conversations';
import { fetchLeavesByProject } from '@/queries/leaves';
import { fetchWorkbenchDrafts } from '@/queries/workbenchDrafts';
import { useCanvasStore } from '@/store/canvasStore';
import { PENDING_UNIT_LIMIT_MESSAGE } from '@/store/canvasStoreUtils';
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
    notifyCallback: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
  vi.mocked(fetchConversations).mockResolvedValue({ conversations: [] } as never);
  vi.mocked(fetchCommits).mockResolvedValue([] as never);
  vi.mocked(fetchLeavesByProject).mockResolvedValue([] as never);
  vi.mocked(fetchWorkbenchDrafts).mockResolvedValue([] as never);
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
    expect(fetchConversations).toHaveBeenCalledWith('proj_1', 100, 0);
  });

  it('records error state when the fetch rejects', async () => {
    vi.mocked(fetchConversations).mockRejectedValueOnce(new Error('network boom'));
    const { result } = renderHook(() => useCanvasNodeActions());
    await result.current.load('proj_1');
    await waitForHook();

    const state = useCanvasStore.getState();
    expect(state.loading).toBe(false);
    expect(state.loadError?.message).toBe('network boom');
  });
});

describe('useCanvasNodeActions.add', () => {
  it('creates a unit conversation and appends a staging node via addToNodes', async () => {
    useCanvasStore.setState({ projectId: 'proj_1' });
    vi.mocked(createConversation).mockResolvedValueOnce({
      conversation_id: 'conv_new',
      title: 'Untitled Unit',
      created_at: '2026-04-12T00:00:00Z',
    } as never);

    const { result } = renderHook(() => useCanvasNodeActions());
    await result.current.add('unit');
    await waitForHook();

    const state = useCanvasStore.getState();
    expect(state.nodes).toHaveLength(1);
    expect(state.nodes[0].id).toBe('conv_new');
    expect(state.nodes[0].data.commitStatus).toBe('staging');
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

  it('does not create a second pending unit', async () => {
    const notify = vi.fn();
    useCanvasStore.setState({
      projectId: 'proj_1',
      nodes: [stagingNode('conv_pending')],
      notifyCallback: notify,
    });

    const { result } = renderHook(() => useCanvasNodeActions());
    await result.current.add('unit');
    await waitForHook();

    expect(notify).toHaveBeenCalledWith(PENDING_UNIT_LIMIT_MESSAGE, 'warning');
    expect(createConversation).not.toHaveBeenCalled();
    expect(useCanvasStore.getState().nodes.map((node) => node.id)).toEqual(['conv_pending']);
  });
});

describe('useCanvasNodeActions.addDraft', () => {
  it('creates a workbench draft and appends a draft node', async () => {
    useCanvasStore.setState({ projectId: 'proj_1' });
    vi.mocked(createWorkbenchDraft).mockResolvedValueOnce({
      id: 'draft_abc',
      title: 'Untitled Draft',
      created_at: '2026-04-12T00:00:00Z',
    } as never);

    const { result } = renderHook(() => useCanvasNodeActions());
    await result.current.addDraft();
    await waitForHook();

    const state = useCanvasStore.getState();
    expect(state.nodes).toHaveLength(1);
    expect(state.nodes[0].id).toBe('draft_abc');
    expect(state.nodes[0].data.commitStatus).toBe('draft');
  });
});
