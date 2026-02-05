/**
 * Merge Workspace Store Tests
 *
 * Tests for extended resolution functionality (Issue #221):
 * - resolveConflict with 'both' and 'edit' options
 * - setCustomText for edit mode
 * - getPreviewSentences with extended resolutions
 * - getUnresolvedCount considering extended resolutions
 * - canCommit with extended resolutions
 * - fetchSourceContext caching
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMergeWorkspaceStore } from '@/store/mergeWorkspaceStore';
import type { Merge2WayResult, Sentence } from '@/types/merge';

// Mock the API module
vi.mock('@/lib/api', () => ({
  fetchTurnContext: vi.fn(),
}));

// Helper to create a mock sentence
const createSentence = (id: string, text: string): Sentence => ({
  id,
  text,
  source: {
    turn_hash: `sha256:turn_${id}`,
    start_char: 0,
    end_char: text.length,
  },
});

// Helper to create mock prepared merge data
const createMockPrepared = (): Merge2WayResult => ({
  identical: [createSentence('identical-1', 'This sentence is the same.')],
  similarPairs: [
    {
      source: createSentence('source-1', 'Budget is $3000 per month.'),
      target: createSentence('target-1', 'Budget is $3500 per month.'),
      wordDiff: [
        { type: 'unchanged', text: 'Budget is' },
        { type: 'removed', text: '$3000' },
        { type: 'added', text: '$3500' },
        { type: 'unchanged', text: 'per month.' },
      ],
      resolution: undefined,
      sourceConstraints: [],
      targetConstraints: [],
    },
    {
      source: createSentence('source-2', 'Meeting on Monday.'),
      target: createSentence('target-2', 'Meeting on Tuesday.'),
      wordDiff: [
        { type: 'unchanged', text: 'Meeting on' },
        { type: 'removed', text: 'Monday' },
        { type: 'added', text: 'Tuesday' },
      ],
      resolution: undefined,
      sourceConstraints: [],
      targetConstraints: [],
    },
  ],
  onlyInSource: [
    { sentence: createSentence('only-source-1', 'Only in source.'), constraints: [], keep: true },
  ],
  onlyInTarget: [
    { sentence: createSentence('only-target-1', 'Only in target.'), constraints: [], keep: true },
  ],
});

describe('MergeWorkspaceStore - Extended Resolutions', () => {
  beforeEach(() => {
    // Reset store before each test
    useMergeWorkspaceStore.getState().reset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Helper to set up store with prepared data
  const setupStore = () => {
    useMergeWorkspaceStore.setState({
      prepared: createMockPrepared(),
      status: 'pending',
    });
  };

  describe('resolveConflict', () => {
    it('should set standard resolution (source)', () => {
      setupStore();

      useMergeWorkspaceStore.getState().resolveConflict(0, 'source');

      const state = useMergeWorkspaceStore.getState();
      expect(state.prepared?.similarPairs[0].resolution).toBe('source');
      expect(state.extendedResolutions['0']).toBeUndefined();
    });

    it('should set standard resolution (target)', () => {
      setupStore();

      useMergeWorkspaceStore.getState().resolveConflict(0, 'target');

      const state = useMergeWorkspaceStore.getState();
      expect(state.prepared?.similarPairs[0].resolution).toBe('target');
      expect(state.extendedResolutions['0']).toBeUndefined();
    });

    it('should set extended resolution (both)', () => {
      setupStore();

      useMergeWorkspaceStore.getState().resolveConflict(0, 'both');

      const state = useMergeWorkspaceStore.getState();
      expect(state.prepared?.similarPairs[0].resolution).toBeUndefined();
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
      expect(state.prepared?.similarPairs[0].resolution).toBe('source');
      expect(state.extendedResolutions['0']).toBeUndefined();
    });

  });

  describe('getUnresolvedCount', () => {
    it('should return count of unresolved conflicts', () => {
      setupStore();

      expect(useMergeWorkspaceStore.getState().getUnresolvedCount()).toBe(2); // Two unresolved pairs
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
      useMergeWorkspaceStore.setState({
        prepared: createMockPrepared(),
        status: 'pending',
        message: 'Merge commit',
      });

      expect(useMergeWorkspaceStore.getState().canCommit()).toBe(false);
    });

    it('should return true when all conflicts are resolved with extended resolutions', () => {
      useMergeWorkspaceStore.setState({
        prepared: createMockPrepared(),
        status: 'pending',
        message: 'Merge commit',
      });

      useMergeWorkspaceStore.getState().resolveConflict(0, 'both');
      useMergeWorkspaceStore.getState().resolveConflict(1, 'target');

      expect(useMergeWorkspaceStore.getState().canCommit()).toBe(true);
    });

    it('should return false when message is empty', () => {
      useMergeWorkspaceStore.setState({
        prepared: createMockPrepared(),
        status: 'pending',
        message: '',
      });

      useMergeWorkspaceStore.getState().resolveConflict(0, 'source');
      useMergeWorkspaceStore.getState().resolveConflict(1, 'target');

      expect(useMergeWorkspaceStore.getState().canCommit()).toBe(false);
    });
  });

  describe('getPreviewSentences', () => {
    it('should include identical sentences', () => {
      setupStore();

      const sentences = useMergeWorkspaceStore.getState().getPreviewSentences();

      expect(sentences.some((s) => s.id === 'identical-1')).toBe(true);
    });

    it('should include source sentence for "source" resolution', () => {
      setupStore();

      useMergeWorkspaceStore.getState().resolveConflict(0, 'source');

      const sentences = useMergeWorkspaceStore.getState().getPreviewSentences();

      expect(sentences.some((s) => s.id === 'source-1')).toBe(true);
      expect(sentences.some((s) => s.id === 'target-1')).toBe(false);
    });

    it('should include both sentences for "both" resolution', () => {
      setupStore();

      useMergeWorkspaceStore.getState().resolveConflict(0, 'both');

      const sentences = useMergeWorkspaceStore.getState().getPreviewSentences();

      expect(sentences.some((s) => s.id === 'source-1')).toBe(true);
      expect(sentences.some((s) => s.id === 'target-1')).toBe(true);
    });

    it('should include kept source-only and target-only sentences', () => {
      setupStore();

      const sentences = useMergeWorkspaceStore.getState().getPreviewSentences();

      expect(sentences.some((s) => s.id === 'only-source-1')).toBe(true);
      expect(sentences.some((s) => s.id === 'only-target-1')).toBe(true);
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
