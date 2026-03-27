/**
 * Canvas Store Slices Tests
 *
 * Focused tests for merge selectors, clearMergeError,
 * addLeafNode edge cases, and removeLeafFromNode.
 * (Core merge/leaf behavior is tested in canvasStore.test.ts)
 */

import type { Node } from '@xyflow/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  selectCanExecuteMerge,
  selectIsMerging,
  selectMergeCounts,
  selectUnresolvedCount,
} from '@/store/canvasMergeSlice';
import { useCanvasStore } from '@/store/canvasStore';
import type { CanvasNodeData } from '@/types/nodes';

// Mock API module
vi.mock('@/lib/api', () => ({
  createLeaf: vi.fn().mockResolvedValue({
    id: 'leaf_mock123',
    commit_hash: 'sha256:abc123',
    type: 'deploy_agent',
    title: 'Deploy',
    constraints: [],
    config: {},
    output: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }),
  deleteLeaf: vi.fn().mockResolvedValue(undefined),
}));

const createCommittedUnitNode = (
  id: string,
  commitHash: string,
  overrides: Partial<CanvasNodeData> = {}
): Node<CanvasNodeData> => ({
  id,
  type: 'unit',
  position: { x: 100, y: 0 },
  data: {
    kind: 'unit',
    entryId: id,
    title: 'Committed Unit',
    summary: '3 facets',
    status: 'committed',
    timestamp: new Date().toISOString(),
    tags: ['unit'],
    commitStatus: 'committed',
    commitHash,
    conversationId: `conv_${id}`,
    branchType: 'main',
    ...overrides,
  },
});

const makeMergeState = (overrides: Record<string, unknown> = {}) => ({
  sourceHash: 'sha256:a',
  targetHash: 'sha256:b',
  prepared: {
    autoKept: ['trees.topic.title'],
    conflicts: [
      {
        path: 'trees.topic.summary',
        slotConflicts: [{ slot: 'summary', source: 'Source summary', target: 'Target summary' }],
      },
    ],
    onlyInSource: ['trees.details.extra'],
    onlyInTarget: ['trees.details.note1', 'trees.details.note2'],
  },
  ...overrides,
});

const resetStore = () => {
  useCanvasStore.setState({
    nodes: [],
    edges: [],
    hasMainCommit: false,
    latestMainCommitId: undefined,
    projectId: null,
    loading: false,
    loadError: null,
    leafPanelOpen: false,
    leafPanelCommitId: undefined,
    leafCreating: false,
    mergeState: null,
    mergeLoading: false,
    mergeError: null,
    deletionConfirmation: null,
    notifyCallback: null,
  });
};

describe('Merge Selectors', () => {
  beforeEach(resetStore);
  afterEach(() => vi.clearAllMocks());

  // =========================================================================
  // selectIsMerging
  // =========================================================================
  describe('selectIsMerging', () => {
    it('returns false when mergeState is null', () => {
      expect(selectIsMerging(useCanvasStore.getState())).toBe(false);
    });

    it('returns true when mergeState exists', () => {
      useCanvasStore.setState({ mergeState: makeMergeState() as any });
      expect(selectIsMerging(useCanvasStore.getState())).toBe(true);
    });
  });

  // =========================================================================
  // selectCanExecuteMerge
  // =========================================================================
  describe('selectCanExecuteMerge', () => {
    it('returns false when mergeState is null', () => {
      expect(selectCanExecuteMerge(useCanvasStore.getState())).toBe(false);
    });

    it('returns false when conflicts exist', () => {
      useCanvasStore.setState({ mergeState: makeMergeState() as any });
      // conflicts array has one entry
      expect(selectCanExecuteMerge(useCanvasStore.getState())).toBe(false);
    });

    it('returns true when all conflicts resolved', () => {
      const state = makeMergeState({ prepared: { ...makeMergeState().prepared, conflicts: [] } });
      useCanvasStore.setState({ mergeState: state as any });
      expect(selectCanExecuteMerge(useCanvasStore.getState())).toBe(true);
    });

    it('returns true when no conflicts exist', () => {
      const state = makeMergeState({ prepared: { ...makeMergeState().prepared, conflicts: [] } });
      useCanvasStore.setState({ mergeState: state as any });
      expect(selectCanExecuteMerge(useCanvasStore.getState())).toBe(true);
    });
  });

  // =========================================================================
  // selectUnresolvedCount
  // =========================================================================
  describe('selectUnresolvedCount', () => {
    it('returns 0 when no mergeState', () => {
      expect(selectUnresolvedCount(useCanvasStore.getState())).toBe(0);
    });

    it('counts unresolved conflicts', () => {
      useCanvasStore.setState({ mergeState: makeMergeState() as any });
      // 1 conflict in default state
      expect(selectUnresolvedCount(useCanvasStore.getState())).toBe(1);
    });

    it('returns 0 when no conflicts', () => {
      const state = makeMergeState({ prepared: { ...makeMergeState().prepared, conflicts: [] } });
      useCanvasStore.setState({ mergeState: state as any });
      expect(selectUnresolvedCount(useCanvasStore.getState())).toBe(0);
    });
  });

  // =========================================================================
  // selectMergeCounts
  // =========================================================================
  describe('selectMergeCounts', () => {
    it('returns null when no mergeState', () => {
      expect(selectMergeCounts(useCanvasStore.getState())).toBeNull();
    });

    it('returns correct counts', () => {
      useCanvasStore.setState({ mergeState: makeMergeState() as any });
      const counts = selectMergeCounts(useCanvasStore.getState());
      expect(counts).toEqual({
        identical: 1,
        similar: 1,
        onlyInSource: 1,
        onlyInTarget: 2,
        resolved: 0, // resolution tracking is in mergeWorkspaceStore
      });
    });
  });
});

describe('clearMergeError', () => {
  beforeEach(resetStore);

  it('clears merge error', () => {
    useCanvasStore.setState({ mergeError: 'Something went wrong' });
    useCanvasStore.getState().clearMergeError();
    expect(useCanvasStore.getState().mergeError).toBeNull();
  });

  it('is a no-op when no error', () => {
    useCanvasStore.getState().clearMergeError();
    expect(useCanvasStore.getState().mergeError).toBeNull();
  });
});

describe('addLeafNode edge cases', () => {
  beforeEach(resetStore);
  afterEach(() => vi.clearAllMocks());

  it('returns null when no commit selected (no leafPanelCommitId)', async () => {
    const notifySpy = vi.fn();
    useCanvasStore.setState({
      leafPanelOpen: true,
      leafPanelCommitId: undefined,
      notifyCallback: notifySpy,
    });

    const result = await useCanvasStore.getState().addLeafNode('tweet');
    expect(result).toBeNull();
    expect(notifySpy).toHaveBeenCalledWith('No commit selected', 'error');
  });

  it('returns null when unit node not found', async () => {
    const notifySpy = vi.fn();
    useCanvasStore.setState({
      nodes: [],
      leafPanelOpen: true,
      leafPanelCommitId: 'nonexistent',
      notifyCallback: notifySpy,
    });

    const result = await useCanvasStore.getState().addLeafNode('tweet');
    expect(result).toBeNull();
    expect(notifySpy).toHaveBeenCalledWith('Unit not found', 'error');
  });

  it('returns null when commit has no commitHash', async () => {
    const notifySpy = vi.fn();
    const stagingNode: Node<CanvasNodeData> = {
      id: 'unit-1',
      type: 'unit',
      position: { x: 0, y: 0 },
      data: {
        kind: 'unit',
        entryId: 'unit-1',
        title: 'Staging',
        summary: '',
        status: 'staging',
        timestamp: 'now',
        tags: ['unit'],
        commitStatus: 'staging',
        // no commitHash
      },
    };
    useCanvasStore.setState({
      nodes: [stagingNode],
      leafPanelOpen: true,
      leafPanelCommitId: 'unit-1',
      notifyCallback: notifySpy,
    });

    const result = await useCanvasStore.getState().addLeafNode('tweet');
    expect(result).toBeNull();
    expect(notifySpy).toHaveBeenCalledWith(expect.stringContaining('not saved yet'), 'error');
  });

  it('returns null when projectId is null', async () => {
    const notifySpy = vi.fn();
    const committedNode = createCommittedUnitNode('unit-1', 'sha256:abc');
    useCanvasStore.setState({
      nodes: [committedNode],
      leafPanelOpen: true,
      leafPanelCommitId: 'unit-1',
      projectId: null,
      notifyCallback: notifySpy,
    });

    const result = await useCanvasStore.getState().addLeafNode('tweet');
    expect(result).toBeNull();
    expect(notifySpy).toHaveBeenCalledWith('Project not found', 'error');
  });

  it('keeps panel open on API error', async () => {
    const { createLeaf } = await import('@/lib/api');
    (createLeaf as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('API down'));

    const notifySpy = vi.fn();
    const committedNode = createCommittedUnitNode('unit-1', 'sha256:abc');
    useCanvasStore.setState({
      nodes: [committedNode],
      leafPanelOpen: true,
      leafPanelCommitId: 'unit-1',
      projectId: 'proj_1',
      notifyCallback: notifySpy,
    });

    const result = await useCanvasStore.getState().addLeafNode('tweet');
    expect(result).toBeNull();
    expect(notifySpy).toHaveBeenCalledWith('API down', 'error');
    // Panel should remain open
    expect(useCanvasStore.getState().leafPanelOpen).toBe(true);
    expect(useCanvasStore.getState().leafCreating).toBe(false);
  });
});

describe('removeLeafFromNode', () => {
  beforeEach(resetStore);
  afterEach(() => vi.clearAllMocks());

  it('removes leaf from node data', async () => {
    const node = createCommittedUnitNode('unit-1', 'sha256:abc', {
      leaves: [
        { id: 'leaf_1', type: 'tweet', title: 'Twitter', status: 'idle', createdAt: '' },
        { id: 'leaf_2', type: 'email', title: 'Email', status: 'idle', createdAt: '' },
      ],
    });
    useCanvasStore.setState({ nodes: [node] });

    await useCanvasStore.getState().removeLeafFromNode('unit-1', 'leaf_1');

    const updatedNode = useCanvasStore.getState().nodes[0];
    expect(updatedNode.data.leaves).toHaveLength(1);
    expect(updatedNode.data.leaves![0].id).toBe('leaf_2');
  });

  it('notifies on success', async () => {
    const notifySpy = vi.fn();
    const node = createCommittedUnitNode('unit-1', 'sha256:abc', {
      leaves: [{ id: 'leaf_1', type: 'tweet', title: 'Twitter', status: 'idle', createdAt: '' }],
    });
    useCanvasStore.setState({ nodes: [node], notifyCallback: notifySpy });

    await useCanvasStore.getState().removeLeafFromNode('unit-1', 'leaf_1');
    expect(notifySpy).toHaveBeenCalledWith('Leaf deleted', 'success');
  });

  it('notifies on error', async () => {
    const { deleteLeaf } = await import('@/lib/api');
    (deleteLeaf as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Delete failed'));

    const notifySpy = vi.fn();
    const node = createCommittedUnitNode('unit-1', 'sha256:abc', {
      leaves: [{ id: 'leaf_1', type: 'tweet', title: 'Twitter', status: 'idle', createdAt: '' }],
    });
    useCanvasStore.setState({ nodes: [node], notifyCallback: notifySpy });

    await useCanvasStore.getState().removeLeafFromNode('unit-1', 'leaf_1');
    expect(notifySpy).toHaveBeenCalledWith('Delete failed', 'error');
    // Leaf should NOT be removed on failure
    expect(useCanvasStore.getState().nodes[0].data.leaves).toHaveLength(1);
  });
});
