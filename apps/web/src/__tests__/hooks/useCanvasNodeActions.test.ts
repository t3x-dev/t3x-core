// @vitest-environment jsdom
/**
 * Canary tests for useCanvasNodeActions (v2 Phase 1.3, canvasNodeSlice migration).
 *
 * Validates that async I/O lives in the hook while the slice exposes only
 * passive setters (setProjectData/mergeProjectData/setLeavesByCommit/addToNodes).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupRoots, renderHook, waitForHook } from './renderHook';

vi.mock('@/queries/commits', () => ({
  fetchCommits: vi.fn(),
  parseApiCommitAnchors: vi.fn(() => null),
}));
vi.mock('@/queries/conversations', () => ({
  fetchConversations: vi.fn(),
  createConversationIn: vi.fn(),
}));
vi.mock('@/queries/leaves', () => ({
  fetchLeavesByProject: vi.fn(),
}));
vi.mock('@/queries/turns', () => ({
  fetchTurn: vi.fn(),
}));
vi.mock('@/queries/workbenchDrafts', () => ({
  fetchWorkbenchDrafts: vi.fn(),
  createWorkbenchDraftFor: vi.fn(),
}));

import { useCanvasNodeActions } from '@/hooks/useCanvasNodeActions';
import { fetchCommits } from '@/queries/commits';
import { createConversationIn, fetchConversations } from '@/queries/conversations';
import { fetchLeavesByProject } from '@/queries/leaves';
import { createWorkbenchDraftFor, fetchWorkbenchDrafts } from '@/queries/workbenchDrafts';
import { useCanvasStore } from '@/store/canvasStore';

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
    vi.mocked(createConversationIn).mockResolvedValueOnce({
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
    expect(createConversationIn).not.toHaveBeenCalled();
  });
});

describe('useCanvasNodeActions.addDraft', () => {
  it('creates a workbench draft and appends a draft node', async () => {
    useCanvasStore.setState({ projectId: 'proj_1' });
    vi.mocked(createWorkbenchDraftFor).mockResolvedValueOnce({
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
