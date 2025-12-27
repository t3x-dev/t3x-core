/**
 * Diff Engine Tests
 *
 * Tests for two-way and three-way semantic diff.
 * Ported from Python tests/test_diff_engine.py
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createDiffEngine, DiffEngine, DiffType } from '../../diff';
import { StubEmbeddingProvider } from '../setup';

describe('DiffEngine', () => {
  let diffEngine: DiffEngine;
  let embeddingProvider: StubEmbeddingProvider;

  beforeEach(() => {
    embeddingProvider = new StubEmbeddingProvider();
    diffEngine = createDiffEngine(embeddingProvider, { threshold: 0.7 });
  });

  describe('Two-Way Diff', () => {
    it('recognizes identical segments as SAME', async () => {
      const baseSegments = [{ segmentId: 'base-s1', text: 'User wants login feature.' }];
      const targetSegments = [{ segmentId: 'target-s1', text: 'User wants login feature.' }];

      const result = await diffEngine.diffTwoWay(
        'commit-1',
        baseSegments,
        'draft-1',
        targetSegments
      );

      expect(result.stats.totalSegments).toBeGreaterThan(0);
      expect(result.stats.sameCount).toBe(1);
    });

    it('recognizes similar segments', async () => {
      const baseSegments = [
        { segmentId: 'base-s1', text: 'User wants to implement a login feature.' },
      ];
      const targetSegments = [
        { segmentId: 'target-s1', text: 'User wants to implement login feature.' },
      ];

      const result = await diffEngine.diffTwoWay(
        'commit-1',
        baseSegments,
        'draft-1',
        targetSegments
      );

      // Should be recognized as same or modified (depending on similarity)
      expect(result.stats.sameCount + result.stats.modifiedCount).toBeGreaterThan(0);
    });

    it('detects added segments', async () => {
      const baseSegments = [{ segmentId: 'base-s1', text: 'User wants login feature.' }];
      const targetSegments = [
        { segmentId: 'target-s1', text: 'User wants login feature.' },
        { segmentId: 'target-s2', text: 'Add remember me option.' },
      ];

      const result = await diffEngine.diffTwoWay(
        'commit-2',
        baseSegments,
        'draft-2',
        targetSegments
      );

      expect(result.stats.addedCount).toBe(1);

      const addedDiffs = result.segmentDiffs.filter((d) => d.diffType === DiffType.ADDED);
      expect(addedDiffs).toHaveLength(1);
      expect(addedDiffs[0].segmentId).toBe('target-s2');
      expect(addedDiffs[0].text).toContain('remember me');
    });

    it('detects removed segments', async () => {
      const baseSegments = [
        { segmentId: 'base-s1', text: 'User wants login feature.' },
        { segmentId: 'base-s2', text: 'System needs PDF export functionality.' },
      ];
      const targetSegments = [{ segmentId: 'target-s1', text: 'User wants login feature.' }];

      const result = await diffEngine.diffTwoWay(
        'commit-3',
        baseSegments,
        'draft-3',
        targetSegments
      );

      expect(result.stats.removedCount).toBe(1);

      const removedDiffs = result.segmentDiffs.filter((d) => d.diffType === DiffType.REMOVED);
      expect(removedDiffs).toHaveLength(1);
      expect(removedDiffs[0].segmentId).toBe('base-s2');
    });

    it('handles empty inputs', async () => {
      const result = await diffEngine.diffTwoWay('base', [], 'target', []);

      expect(result.stats.totalSegments).toBe(0);
      expect(result.segmentDiffs).toHaveLength(0);
    });

    it('treats all as added when base is empty', async () => {
      const targetSegments = [
        { segmentId: 's1', text: 'New segment.' },
        { segmentId: 's2', text: 'Another segment.' },
      ];

      const result = await diffEngine.diffTwoWay('base', [], 'target', targetSegments);

      expect(result.stats.addedCount).toBe(2);
    });

    it('treats all as removed when target is empty', async () => {
      const baseSegments = [
        { segmentId: 's1', text: 'Old segment.' },
        { segmentId: 's2', text: 'Another old segment.' },
      ];

      const result = await diffEngine.diffTwoWay('base', baseSegments, 'target', []);

      expect(result.stats.removedCount).toBe(2);
    });
  });

  describe('Three-Way Diff', () => {
    it('merges non-conflicting additions', async () => {
      const baseSegments = [{ segmentId: 'base-s1', text: 'User wants login feature.' }];
      const sourceSegments = [
        { segmentId: 'source-s1', text: 'User wants login feature.' },
        { segmentId: 'source-s2', text: 'Add remember me option.' },
      ];
      const targetSegments = [
        { segmentId: 'target-s1', text: 'User wants login feature.' },
        { segmentId: 'target-s3', text: 'Add captcha verification.' },
      ];

      const result = await diffEngine.diffThreeWay(
        'base',
        baseSegments,
        'source',
        sourceSegments,
        'target',
        targetSegments
      );

      expect(result.stats.conflictCount).toBe(0);
      expect(result.stats.addedCount).toBe(2);
      expect(result.stats.sameCount).toBe(1);

      const addedDiffs = result.segmentDiffs.filter((d) => d.diffType === DiffType.ADDED);
      const addedIds = new Set(addedDiffs.map((d) => d.segmentId));
      expect(addedIds).toContain('source-s2');
      expect(addedIds).toContain('target-s3');
    });

    it('detects conflicts when both sides modify differently', async () => {
      const baseSegments = [{ segmentId: 'base-s1', text: 'Support email and password login.' }];
      const sourceSegments = [
        { segmentId: 'source-s1', text: 'Support email, phone, and password login.' },
      ];
      const targetSegments = [{ segmentId: 'target-s1', text: 'Support email and WeChat login.' }];

      const result = await diffEngine.diffThreeWay(
        'base',
        baseSegments,
        'source',
        sourceSegments,
        'target',
        targetSegments
      );

      expect(result.stats.conflictCount).toBe(1);

      const conflicts = result.segmentDiffs.filter((d) => d.diffType === DiffType.CONFLICT);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].segmentId).toBe('base-s1');
      expect(conflicts[0].matchedSegmentId).toContain('|');
    });

    it('handles both sides deleting same segment', async () => {
      // Use very different text lengths so the stub provider can distinguish them
      // (StubEmbeddingProvider uses text length for similarity)
      const baseSegments = [
        { segmentId: 'base-s1', text: 'User wants login feature.' },
        {
          segmentId: 'base-s2',
          text: 'The system absolutely requires comprehensive PDF document export functionality with multiple format options.',
        },
      ];
      const sourceSegments = [{ segmentId: 'source-s1', text: 'User wants login feature.' }];
      const targetSegments = [{ segmentId: 'target-s1', text: 'User wants login feature.' }];

      const result = await diffEngine.diffThreeWay(
        'base',
        baseSegments,
        'source',
        sourceSegments,
        'target',
        targetSegments
      );

      expect(result.stats.removedCount).toBe(1);
      expect(result.stats.conflictCount).toBe(0);

      const removedDiffs = result.segmentDiffs.filter((d) => d.diffType === DiffType.REMOVED);
      expect(removedDiffs).toHaveLength(1);
      expect(removedDiffs[0].segmentId).toBe('base-s2');
    });

    it('returns source and target IDs in result', async () => {
      const result = await diffEngine.diffThreeWay(
        'base-commit',
        [],
        'source-commit',
        [],
        'target-commit',
        []
      );

      expect(result.baseId).toBe('base-commit');
      expect(result.sourceId).toBe('source-commit');
      expect(result.targetId).toBe('target-commit');
    });
  });

  describe('Statistics', () => {
    it('calculates correct statistics', async () => {
      const baseSegments = [
        { segmentId: 'base-s1', text: 'First sentence.' },
        { segmentId: 'base-s2', text: 'Second sentence.' },
      ];
      const targetSegments = [
        { segmentId: 'target-s1', text: 'First sentence.' },
        { segmentId: 'target-s3', text: 'Third sentence.' },
      ];

      const result = await diffEngine.diffTwoWay(
        'commit-5',
        baseSegments,
        'draft-5',
        targetSegments
      );

      const { stats } = result;
      const total =
        stats.sameCount +
        stats.addedCount +
        stats.removedCount +
        stats.modifiedCount +
        stats.conflictCount;

      expect(stats.totalSegments).toBe(total);
    });

    it('includes threshold in result', async () => {
      const result = await diffEngine.diffTwoWay('a', [], 'b', []);

      expect(result.threshold).toBe(0.7);
    });
  });

  describe('Factory Function', () => {
    it('creates DiffEngine with custom threshold', () => {
      const engine = createDiffEngine(embeddingProvider, { threshold: 0.85 });

      expect(engine).toBeInstanceOf(DiffEngine);
    });

    it('creates DiffEngine with default threshold', async () => {
      const engine = createDiffEngine(embeddingProvider);
      const result = await engine.diffTwoWay('a', [], 'b', []);

      expect(result.threshold).toBe(0.7); // Default
    });
  });
});
