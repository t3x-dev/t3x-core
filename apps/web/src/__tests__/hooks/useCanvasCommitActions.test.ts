// @vitest-environment jsdom
/**
 * Canary tests for useCanvasCommitActions (v2 Phase 1.3 PR 7d).
 *
 * Validates that async commit flows (addFromConversation, addConversationFromCommit,
 * startMerge) now live in the hook and that the slice exposes only
 * appendNodeAndEdge as a passive setter.
 */
import type { Node } from '@xyflow/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupRoots, renderHook, waitForHook } from './renderHook';

vi.mock('@/commands/conversations', () => ({
  createConversation: vi.fn(),
}));
vi.mock('@/queries/turns', () => ({
  fetchTurns: vi.fn(),
}));
vi.mock('@/commands/merge', () => ({
  createMergeDraft: vi.fn(),
}));

import { createConversation } from '@/commands/conversations';
import { createMergeDraft } from '@/commands/merge';
import { useCanvasCommitActions } from '@/hooks/useCanvasCommitActions';
import { fetchTurns } from '@/queries/turns';
import { useCanvasStore } from '@/store/canvasStore';
import type { CanvasNodeData } from '@/types/nodes';

function committedMainUnit(id: string, commitHash: string): Node<CanvasNodeData> {
  return {
    id,
    type: 'unit',
    position: { x: 0, y: 0 },
    data: {
      kind: 'unit',
      entryId: id,
      title: 'Main',
      summary: '',
      status: 'committed',
      timestamp: 'now',
      tags: [],
      commitStatus: 'committed',
      commitHash,
      branchType: 'main',
    },
  };
}

function committedBranchUnit(id: string, commitHash: string): Node<CanvasNodeData> {
  return {
    id,
    type: 'unit',
    position: { x: 0, y: 0 },
    data: {
      kind: 'unit',
      entryId: id,
      title: 'Branch',
      summary: '',
      status: 'committed',
      timestamp: 'now',
      tags: [],
      commitStatus: 'committed',
      commitHash,
      branchType: 'branch',
      branchName: 'branch-1',
    },
  };
}

function resetStore() {
  useCanvasStore.setState({
    nodes: [],
    edges: [],
    projectId: null,
    hasMainCommit: false,
    latestMainCommitId: undefined,
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

describe('useCanvasCommitActions.addConversationFromCommit', () => {
  it('creates a conversation and appends node+edge via appendNodeAndEdge', async () => {
    useCanvasStore.setState({
      projectId: 'proj_1',
      nodes: [committedMainUnit('unit-1', 'sha256:abc')],
    });
    vi.mocked(createConversation).mockResolvedValueOnce({
      conversation_id: 'conv_new',
      title: 'Untitled Unit',
      created_at: '2026-04-13T00:00:00Z',
    } as never);

    const { result } = renderHook(() => useCanvasCommitActions());
    await result.current.addConversationFromCommit('unit-1');
    await waitForHook();

    expect(createConversation).toHaveBeenCalledWith(
      'proj_1',
      'Untitled Unit',
      'sha256:abc',
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) })
    );
    const state = useCanvasStore.getState();
    expect(state.nodes).toHaveLength(2);
    expect(state.nodes[1].id).toBe('conv_new');
    expect(state.edges).toHaveLength(1);
    expect(state.edges[0]).toMatchObject({ source: 'unit-1', target: 'conv_new' });
  });

  it('throws when no project is selected', async () => {
    useCanvasStore.setState({
      projectId: null,
      nodes: [committedMainUnit('unit-1', 'sha256:abc')],
    });
    const { result } = renderHook(() => useCanvasCommitActions());
    await expect(result.current.addConversationFromCommit('unit-1')).rejects.toThrow(
      'no project selected'
    );
  });
});

describe('useCanvasCommitActions.startMerge', () => {
  it('returns a draftId on success and never mutates canvas state', async () => {
    const branch = committedBranchUnit('branch-1', 'sha256:branch');
    const main = committedMainUnit('main-1', 'sha256:main');
    useCanvasStore.setState({
      projectId: 'proj_1',
      nodes: [branch, main],
      latestMainCommitId: 'main-1',
      hasMainCommit: true,
    });
    vi.mocked(createMergeDraft).mockResolvedValueOnce({ draftId: 'merge_draft_1' } as never);

    const before = useCanvasStore.getState().nodes.length;
    const { result } = renderHook(() => useCanvasCommitActions());
    const draftId = await result.current.startMerge('branch-1');
    await waitForHook();

    expect(draftId).toBe('merge_draft_1');
    expect(createMergeDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: 'proj_1',
        source_hash: 'sha256:branch',
        target_hash: 'sha256:main',
        source_branch: 'branch-1',
        target_branch: 'main',
      })
    );
    expect(useCanvasStore.getState().nodes).toHaveLength(before);
  });

  it('notifies and returns null when commit is not a branch', async () => {
    const notify = vi.fn();
    useCanvasStore.setState({
      projectId: 'proj_1',
      nodes: [committedMainUnit('main-1', 'sha256:main')],
      latestMainCommitId: 'main-1',
      hasMainCommit: true,
      notifyCallback: notify,
    });

    const { result } = renderHook(() => useCanvasCommitActions());
    const draftId = await result.current.startMerge('main-1');
    await waitForHook();

    expect(draftId).toBeNull();
    expect(notify).toHaveBeenCalledWith('Cannot merge: not a branch commit', 'error');
    expect(createMergeDraft).not.toHaveBeenCalled();
  });
});

describe('useCanvasCommitActions.addFromConversation', () => {
  it('fetches turns and appends staging unit with pendingSource', async () => {
    const source = committedMainUnit('unit-1', 'sha256:abc');
    source.data.conversationId = 'conv_1';
    useCanvasStore.setState({
      projectId: 'proj_1',
      nodes: [source],
      hasMainCommit: false,
    });
    vi.mocked(fetchTurns).mockResolvedValueOnce({
      turns: [{ role: 'user', content: 'hello world', turn_hash: 't1', created_at: '' }],
    } as never);

    const { result } = renderHook(() => useCanvasCommitActions());
    await result.current.addFromConversation('unit-1');
    await waitForHook();

    expect(fetchTurns).toHaveBeenCalledWith('proj_1', 'conv_1');
    const state = useCanvasStore.getState();
    expect(state.nodes).toHaveLength(2);
    expect(state.nodes[1].data.commitStatus).toBe('staging');
    expect(state.nodes[1].data.baselineSummary).toBe('hello world');
    expect(state.edges).toHaveLength(1);
  });
});
