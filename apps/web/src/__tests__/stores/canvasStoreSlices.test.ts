/**
 * Canvas Store Slices Tests
 *
 * Focused tests for merge selectors, clearMergeError,
 * addLeafNode edge cases, and removeLeafFromNode.
 * (Core merge/leaf behavior is tested in canvasStore.test.ts)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  selectCanExecuteMerge,
  selectIsMerging,
  selectMergeCounts,
  selectUnresolvedCount,
} from '@/store/canvasMergeSlice';
import { useCanvasStore } from '@/store/canvasStore';
import type { MergeState } from '@/types/merge';

// queries/leaves is now read-only (writes live in @/commands/leaves);
// the slice no longer touches I/O — useCanvasLeafActions tests cover it.
vi.mock('@/queries/leaves', () => ({
  fetchLeavesByProject: vi.fn().mockResolvedValue([]),
}));

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
