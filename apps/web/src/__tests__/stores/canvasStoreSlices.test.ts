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
import type { MergeState } from '@/types/merge';
import type { CanvasNodeData } from '@/types/nodes';

// queries/leaves is now read-only (writes live in @/commands/leaves,
// consumed by hooks/useLeafOperations — hook tests are out of scope here).
vi.mock('@/queries/leaves', () => ({
  fetchLeavesByProject: vi.fn().mockResolvedValue([]),
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
      useCanvasStore.setState({ mergeState: makeMergeState() as unknown as MergeState });
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
      useCanvasStore.setState({ mergeState: makeMergeState() as unknown as MergeState });
      // conflicts array has one entry
      expect(selectCanExecuteMerge(useCanvasStore.getState())).toBe(false);
    });

    it('returns true when all conflicts resolved', () => {
      const state = makeMergeState({ prepared: { ...makeMergeState().prepared, conflicts: [] } });
      useCanvasStore.setState({ mergeState: state as unknown as MergeState });
      expect(selectCanExecuteMerge(useCanvasStore.getState())).toBe(true);
    });

    it('returns true when no conflicts exist', () => {
      const state = makeMergeState({ prepared: { ...makeMergeState().prepared, conflicts: [] } });
      useCanvasStore.setState({ mergeState: state as unknown as MergeState });
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
      useCanvasStore.setState({ mergeState: makeMergeState() as unknown as MergeState });
      // 1 conflict in default state
      expect(selectUnresolvedCount(useCanvasStore.getState())).toBe(1);
    });

    it('returns 0 when no conflicts', () => {
      const state = makeMergeState({ prepared: { ...makeMergeState().prepared, conflicts: [] } });
      useCanvasStore.setState({ mergeState: state as unknown as MergeState });
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
      useCanvasStore.setState({ mergeState: makeMergeState() as unknown as MergeState });
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

describe('leaf panel setters (passive slice)', () => {
  beforeEach(resetStore);

  it('embedLeafInCommit appends to node.data.leaves', () => {
    const node = createCommittedUnitNode('unit-1', 'sha256:abc');
    useCanvasStore.setState({ nodes: [node] });
    useCanvasStore.getState().embedLeafInCommit('unit-1', {
      id: 'leaf_1',
      type: 'tweet',
      title: 'Twitter',
      createdAt: '2026-04-13',
    });
    const updated = useCanvasStore.getState().nodes[0];
    expect(updated.data.leaves).toHaveLength(1);
    expect(updated.data.leaves![0].id).toBe('leaf_1');
  });

  it('removeLeafFromCommit filters out the matching id', () => {
    const node = createCommittedUnitNode('unit-1', 'sha256:abc', {
      leaves: [
        { id: 'leaf_1', type: 'tweet', title: 'Twitter', status: 'idle', createdAt: '' },
        { id: 'leaf_2', type: 'email', title: 'Email', status: 'idle', createdAt: '' },
      ],
    });
    useCanvasStore.setState({ nodes: [node] });
    useCanvasStore.getState().removeLeafFromCommit('unit-1', 'leaf_1');
    const updated = useCanvasStore.getState().nodes[0];
    expect(updated.data.leaves).toHaveLength(1);
    expect(updated.data.leaves![0].id).toBe('leaf_2');
  });
});
