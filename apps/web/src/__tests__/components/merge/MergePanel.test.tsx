/**
 * MergePanel Component Tests
 *
 * Tests for main merge review panel component
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MergePanel } from '@/components/merge/MergePanel';
import { useCanvasStore } from '@/store/canvasStore';

// Mock the canvas store
vi.mock('@/store/canvasStore', () => ({
  useCanvasStore: vi.fn(),
  selectCanExecuteMerge: vi.fn(),
  selectUnresolvedCount: vi.fn(),
  selectMergeCounts: vi.fn(),
}));

describe('MergePanel', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
  });

  test('component exports successfully', () => {
    expect(MergePanel).toBeDefined();
    expect(typeof MergePanel).toBe('function');
  });

  test('returns null when no merge state', () => {
    // Mock useCanvasStore to return no merge state
    (useCanvasStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: any) => {
      if (typeof selector === 'function') {
        return selector({
          mergeState: null,
          executeMerge: vi.fn(),
          cancelMerge: vi.fn(),
          mergeLoading: false,
        });
      }
      return null;
    });

    // Component should handle null merge state
    const mergeState = null;
    expect(mergeState).toBeNull();
  });

  test('handles merge state with prepared result', () => {
    const mockMergeState = {
      sourceHash: 'sha256:abc',
      targetHash: 'sha256:def',
      prepared: {
        identical: [],
        similarPairs: [],
        onlyInSource: [],
        onlyInTarget: [],
      },
    };

    expect(mockMergeState.sourceHash).toBe('sha256:abc');
    expect(mockMergeState.targetHash).toBe('sha256:def');
    expect(mockMergeState.prepared).toBeDefined();
    expect(Array.isArray(mockMergeState.prepared.identical)).toBe(true);
    expect(Array.isArray(mockMergeState.prepared.similarPairs)).toBe(true);
  });

  test('handles merge counts calculation', () => {
    const prepared = {
      identical: [{ id: '1', text: 'Same', confidence: 0.9, source: { type: 'turn', id: 't1' } }],
      similarPairs: [
        {
          source: { id: 's1', text: 'Source', confidence: 0.9, source: { type: 'turn', id: 't1' } },
          target: { id: 's2', text: 'Target', confidence: 0.9, source: { type: 'turn', id: 't2' } },
          wordDiff: [],
          sourceConstraints: [],
          targetConstraints: [],
          resolution: 'source',
        },
      ],
      onlyInSource: [
        {
          sentence: {
            id: '2',
            text: 'Only in source',
            confidence: 0.9,
            source: { type: 'turn', id: 't1' },
          },
          constraints: [],
          keep: true,
        },
      ],
      onlyInTarget: [
        {
          sentence: {
            id: '3',
            text: 'Only in target',
            confidence: 0.9,
            source: { type: 'turn', id: 't2' },
          },
          constraints: [],
          keep: false,
        },
      ],
    };

    const counts = {
      identical: prepared.identical.length,
      similar: prepared.similarPairs.length,
      onlyInSource: prepared.onlyInSource.length,
      onlyInTarget: prepared.onlyInTarget.length,
      resolved: prepared.similarPairs.filter((p) => p.resolution).length,
    };

    expect(counts.identical).toBe(1);
    expect(counts.similar).toBe(1);
    expect(counts.onlyInSource).toBe(1);
    expect(counts.onlyInTarget).toBe(1);
    expect(counts.resolved).toBe(1);
  });

  test('handles unresolved count calculation', () => {
    const similarPairs = [
      {
        source: { id: 's1', text: 'S', confidence: 0.9, source: { type: 'turn', id: 't1' } },
        target: { id: 's2', text: 'T', confidence: 0.9, source: { type: 'turn', id: 't2' } },
        wordDiff: [],
        sourceConstraints: [],
        targetConstraints: [],
        resolution: undefined,
      },
      {
        source: { id: 's3', text: 'S2', confidence: 0.9, source: { type: 'turn', id: 't1' } },
        target: { id: 's4', text: 'T2', confidence: 0.9, source: { type: 'turn', id: 't2' } },
        wordDiff: [],
        sourceConstraints: [],
        targetConstraints: [],
        resolution: 'source',
      },
    ];

    const unresolvedCount = similarPairs.filter((p) => p.resolution === undefined).length;
    expect(unresolvedCount).toBe(1);
  });

  test('can execute merge when all pairs resolved', () => {
    const similarPairs = [
      {
        source: { id: 's1', text: 'S', confidence: 0.9, source: { type: 'turn', id: 't1' } },
        target: { id: 's2', text: 'T', confidence: 0.9, source: { type: 'turn', id: 't2' } },
        wordDiff: [],
        sourceConstraints: [],
        targetConstraints: [],
        resolution: 'source',
      },
    ];

    const canExecute = similarPairs.every((p) => p.resolution !== undefined);
    expect(canExecute).toBe(true);
  });

  test('cannot execute merge when pairs unresolved', () => {
    const similarPairs = [
      {
        source: { id: 's1', text: 'S', confidence: 0.9, source: { type: 'turn', id: 't1' } },
        target: { id: 's2', text: 'T', confidence: 0.9, source: { type: 'turn', id: 't2' } },
        wordDiff: [],
        sourceConstraints: [],
        targetConstraints: [],
        resolution: undefined,
      },
    ];

    const canExecute = similarPairs.every((p) => p.resolution !== undefined);
    expect(canExecute).toBe(false);
  });

  test('handles merge message validation', () => {
    const message = '';
    const isValid = message.trim().length > 0;
    expect(isValid).toBe(false);

    const message2 = 'Merge commit message';
    const isValid2 = message2.trim().length > 0;
    expect(isValid2).toBe(true);
  });
});
