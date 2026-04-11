/**
 * Merge Workspace Store Tests
 *
 * Tests for extended resolution functionality (Issue #221):
 * - resolveConflict with 'both' and 'edit' options
 * - setCustomText for edit mode
 * - getUnresolvedCount considering extended resolutions
 * - canCommit with extended resolutions
 * - fetchSourceContext caching
 *
 * Updated for tree-primary merge architecture.
 * Uses treeMergeResult (path-based MergeResult from core) for conflict resolution.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMergeWorkspaceStore } from '@/store/mergeWorkspaceStore';
import type { MergeResult } from '@t3x-dev/core';

// Mock the API module
vi.mock('@/lib/api', () => ({
  fetchTurnContext: vi.fn(),
}));

// Helper to create tree-primary MergeResult
const createMockTreeMergeResult = (): MergeResult => ({
  autoKept: ['identical/a'],
  conflicts: [
    { path: 'topic/budget', slotConflicts: [] },
    { path: 'topic/meeting', slotConflicts: [] },
  ],
  onlyInSource: ['src/only'],
  onlyInTarget: ['tgt/only'],
  relationsOnlyInSource: [],
  relationsOnlyInTarget: [],
  relationsInBoth: [],
});

describe('MergeWorkspaceStore - Extended Resolutions', () => {
  beforeEach(() => {
    // Reset store before each test
    useMergeWorkspaceStore.getState().reset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Helper to set up store with tree merge data
  const setupStore = () => {
    const treeMergeResult = createMockTreeMergeResult();
    useMergeWorkspaceStore.getState().setTreeMergeResult(treeMergeResult);
    useMergeWorkspaceStore.setState({
      status: 'pending',
    });
  };

  describe('resolveConflict', () => {
    it('should set standard resolution (source)', () => {
      setupStore();

      useMergeWorkspaceStore.getState().resolveConflict(0, 'source');

      const state = useMergeWorkspaceStore.getState();
      expect(state.treeResolutions.get('topic/budget')).toEqual({ type: 'source' });
      expect(state.extendedResolutions['0']).toBeUndefined();
    });

    it('should set standard resolution (target)', () => {
      setupStore();

      useMergeWorkspaceStore.getState().resolveConflict(0, 'target');

      const state = useMergeWorkspaceStore.getState();
      expect(state.treeResolutions.get('topic/budget')).toEqual({ type: 'target' });
      expect(state.extendedResolutions['0']).toBeUndefined();
    });

    it('should set extended resolution (both)', () => {
      setupStore();

      useMergeWorkspaceStore.getState().resolveConflict(0, 'both');

      const state = useMergeWorkspaceStore.getState();
      expect(state.treeResolutions.has('topic/budget')).toBe(false);
      expect(state.extendedResolutions['0']).toEqual({ type: 'both' });
    });

    it('should clear extended resolution when switching to standard', () => {
      setupStore();

      // Set extended resolution first
      useMergeWorkspaceStore.getState().resolveConflict(0, 'both');
      expect(useMergeWorkspaceStore.getState().extendedResolutions['0']).toEqual({ type: 'both' });

      // Switch to standard resolution
      useMergeWorkspaceStore.getState().resolveConflict(0, 'source');

      const state = useMergeWorkspaceStore.getState();
      expect(state.treeResolutions.get('topic/budget')).toEqual({ type: 'source' });
      expect(state.extendedResolutions['0']).toBeUndefined();
    });
  });

  describe('getUnresolvedCount', () => {
    it('should return count of unresolved conflicts', () => {
      setupStore();

      expect(useMergeWorkspaceStore.getState().getUnresolvedCount()).toBe(2); // Two unresolved conflicts
    });

    it('should count standard resolutions as resolved', () => {
      setupStore();

      useMergeWorkspaceStore.getState().resolveConflict(0, 'source');

      expect(useMergeWorkspaceStore.getState().getUnresolvedCount()).toBe(1); // One still unresolved
    });

    it('should count "both" resolution as resolved', () => {
      setupStore();

      useMergeWorkspaceStore.getState().resolveConflict(0, 'both');
      useMergeWorkspaceStore.getState().resolveConflict(1, 'target');

      expect(useMergeWorkspaceStore.getState().getUnresolvedCount()).toBe(0);
    });
  });

  describe('canCommit', () => {
    it('should return false when there are unresolved conflicts', () => {
      const treeMergeResult = createMockTreeMergeResult();
      useMergeWorkspaceStore.getState().setTreeMergeResult(treeMergeResult);
      useMergeWorkspaceStore.setState({
        status: 'pending',
        message: 'Merge commit',
      });

      expect(useMergeWorkspaceStore.getState().canCommit()).toBe(false);
    });

    it('should return true when all conflicts are resolved with extended resolutions', () => {
      const treeMergeResult = createMockTreeMergeResult();
      useMergeWorkspaceStore.getState().setTreeMergeResult(treeMergeResult);
      useMergeWorkspaceStore.setState({
        status: 'pending',
        message: 'Merge commit',
      });

      useMergeWorkspaceStore.getState().resolveConflict(0, 'both');
      useMergeWorkspaceStore.getState().resolveConflict(1, 'target');

      expect(useMergeWorkspaceStore.getState().canCommit()).toBe(true);
    });

    it('should return false when message is empty', () => {
      const treeMergeResult = createMockTreeMergeResult();
      useMergeWorkspaceStore.getState().setTreeMergeResult(treeMergeResult);
      useMergeWorkspaceStore.setState({
        status: 'pending',
        message: '',
      });

      useMergeWorkspaceStore.getState().resolveConflict(0, 'source');
      useMergeWorkspaceStore.getState().resolveConflict(1, 'target');

      expect(useMergeWorkspaceStore.getState().canCommit()).toBe(false);
    });
  });

  describe('getEffectiveResolution', () => {
    it('should return standard resolution when set', () => {
      setupStore();

      useMergeWorkspaceStore.getState().resolveConflict(0, 'source');

      expect(useMergeWorkspaceStore.getState().getEffectiveResolution(0)).toBe('source');
    });

    it('should return extended resolution type when set', () => {
      setupStore();

      useMergeWorkspaceStore.getState().resolveConflict(0, 'both');

      expect(useMergeWorkspaceStore.getState().getEffectiveResolution(0)).toBe('both');
    });

    it('should return null when no resolution', () => {
      setupStore();

      expect(useMergeWorkspaceStore.getState().getEffectiveResolution(0)).toBe(null);
    });
  });

  describe('reset', () => {
    it('should clear extended resolutions', () => {
      setupStore();

      useMergeWorkspaceStore.getState().resolveConflict(0, 'both');
      useMergeWorkspaceStore.getState().resolveConflict(1, 'both');

      expect(Object.keys(useMergeWorkspaceStore.getState().extendedResolutions).length).toBe(2);

      useMergeWorkspaceStore.getState().reset();

      expect(useMergeWorkspaceStore.getState().extendedResolutions).toEqual({});
    });

    it('should clear context cache', () => {
      // Manually set context cache for testing using setState
      // Using a minimal mock that satisfies the TurnContextData interface
      const mockContextData = {
        target_turn: {
          turn_hash: 'sha256:test',
          parent_turn_hash: null,
          project_id: 'proj_test',
          conversation_id: 'conv_test',
          role: 'user' as const,
          content: 'Test content',
          created_at: new Date().toISOString(),
          is_target: true,
        },
        context: [],
        conversation_id: 'conv_test',
        conversation_title: 'Test Conversation',
      };

      useMergeWorkspaceStore.setState({
        contextCache: {
          'sha256:test': { data: mockContextData, loadedAt: new Date() },
        },
      });

      useMergeWorkspaceStore.getState().reset();

      expect(useMergeWorkspaceStore.getState().contextCache).toEqual({});
    });
  });
});
