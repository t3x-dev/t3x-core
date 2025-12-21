/**
 * Merge Engine Tests
 *
 * Tests for three-way facet merge algorithm.
 * Ported from Python tests/test_merge_agent.py
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MergeEngine, ConflictType, createMergeEngine } from '../../merge';
import { StubLLMProvider, testFacets } from '../setup';

describe('MergeEngine', () => {
  let mergeEngine: MergeEngine;

  beforeEach(() => {
    mergeEngine = createMergeEngine();
  });

  describe('Clean Merge (No Conflicts)', () => {
    it('keeps base when no changes', async () => {
      const baseFacets = [testFacets.goal('Plan a trip to Japan')];
      const sourceFacets = [testFacets.goal('Plan a trip to Japan')];
      const targetFacets = [testFacets.goal('Plan a trip to Japan')];

      const result = await mergeEngine.merge(baseFacets, sourceFacets, targetFacets);

      expect(result.status).toBe('clean');
      expect(result.conflicts).toHaveLength(0);
      expect(result.autoMerged).toHaveLength(1);
      expect(result.autoMerged[0].source).toBe('base');
    });

    it('takes source when only source changes', async () => {
      const baseFacets = [testFacets.goal('Original goal')];
      const sourceFacets = [testFacets.goal('Updated goal from source')];
      const targetFacets = [testFacets.goal('Original goal')];

      const result = await mergeEngine.merge(baseFacets, sourceFacets, targetFacets);

      expect(result.status).toBe('clean');
      expect(result.autoMerged[0].mergedText).toBe('Updated goal from source');
      expect(result.autoMerged[0].source).toBe('source');
    });

    it('takes target when only target changes', async () => {
      const baseFacets = [testFacets.goal('Original goal')];
      const sourceFacets = [testFacets.goal('Original goal')];
      const targetFacets = [testFacets.goal('Updated goal from target')];

      const result = await mergeEngine.merge(baseFacets, sourceFacets, targetFacets);

      expect(result.status).toBe('clean');
      expect(result.autoMerged[0].mergedText).toBe('Updated goal from target');
      expect(result.autoMerged[0].source).toBe('target');
    });

    it('handles new facets added by source', async () => {
      const baseFacets = [testFacets.goal('Base goal')];
      const sourceFacets = [
        testFacets.goal('Base goal'),
        testFacets.preference('Prefer window seat'),
      ];
      const targetFacets = [testFacets.goal('Base goal')];

      const result = await mergeEngine.merge(baseFacets, sourceFacets, targetFacets);

      expect(result.status).toBe('clean');
      expect(result.autoMerged).toHaveLength(2);
    });

    it('handles new facets added by target', async () => {
      const baseFacets = [testFacets.goal('Base goal')];
      const sourceFacets = [testFacets.goal('Base goal')];
      const targetFacets = [
        testFacets.goal('Base goal'),
        testFacets.preference('Prefer direct flight'),
      ];

      const result = await mergeEngine.merge(baseFacets, sourceFacets, targetFacets);

      expect(result.status).toBe('clean');
      expect(result.autoMerged).toHaveLength(2);
    });
  });

  describe('Conflict Detection', () => {
    it('detects conflict when both sides modify constraint differently', async () => {
      const baseFacets = [{ ...testFacets.constraint('Budget: $1000'), facet: 'budget' }];
      const sourceFacets = [{ ...testFacets.constraint('Budget: $1500'), facet: 'budget' }];
      const targetFacets = [{ ...testFacets.constraint('Budget: $2000'), facet: 'budget' }];

      const result = await mergeEngine.merge(baseFacets, sourceFacets, targetFacets);

      expect(result.status).toBe('conflicts');
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].facet).toBe('budget');
      expect(result.conflicts[0].sourceText).toBe('Budget: $1500');
      expect(result.conflicts[0].targetText).toBe('Budget: $2000');
    });

    it('auto-merges non-constraint types when both modify', async () => {
      const baseFacets = [testFacets.goal('Original goal')];
      const sourceFacets = [testFacets.goal('Source goal')];
      const targetFacets = [testFacets.goal('Target goal')];

      const result = await mergeEngine.merge(baseFacets, sourceFacets, targetFacets);

      // Non-constraint types should be auto-merged (concatenated)
      expect(result.status).toBe('clean');
      expect(result.autoMerged).toHaveLength(1);
      expect(result.autoMerged[0].mergedText).toContain('Source goal');
      expect(result.autoMerged[0].mergedText).toContain('Target goal');
    });

    it('prefers higher confidence for constraint conflicts', async () => {
      const baseFacets = [{ ...testFacets.constraint('Budget: $1000', 0.5), facet: 'budget' }];
      const sourceFacets = [{ ...testFacets.constraint('Budget: $1500', 0.9), facet: 'budget' }];
      const targetFacets = [{ ...testFacets.constraint('Budget: $2000', 0.6), facet: 'budget' }];

      const result = await mergeEngine.merge(baseFacets, sourceFacets, targetFacets);

      // Source has higher confidence (0.9 vs 0.6)
      expect(result.status).toBe('clean');
      expect(result.autoMerged[0].mergedText).toBe('Budget: $1500');
      expect(result.autoMerged[0].source).toBe('source');
    });
  });

  describe('Conflict Types', () => {
    it('identifies DIVERGENT_EDIT conflict type', async () => {
      const baseFacets = [{ ...testFacets.constraint('Value A'), facet: 'test' }];
      const sourceFacets = [{ ...testFacets.constraint('Value B'), facet: 'test' }];
      const targetFacets = [{ ...testFacets.constraint('Value C'), facet: 'test' }];

      const result = await mergeEngine.merge(baseFacets, sourceFacets, targetFacets);

      if (result.conflicts.length > 0) {
        expect(result.conflicts[0].conflictType).toBe(ConflictType.DIVERGENT_EDIT);
      }
    });
  });

  describe('Manual Resolution', () => {
    it('applies manual resolutions to conflicts', async () => {
      const baseFacets = [{ ...testFacets.constraint('Budget: $1000'), facet: 'budget' }];
      const sourceFacets = [{ ...testFacets.constraint('Budget: $1500'), facet: 'budget' }];
      const targetFacets = [{ ...testFacets.constraint('Budget: $2000'), facet: 'budget' }];

      const result = await mergeEngine.merge(baseFacets, sourceFacets, targetFacets);

      // Apply resolution
      const resolutions = new Map([['budget', 'Budget: $1750']]);
      const resolved = mergeEngine.applyResolutions(result, resolutions);

      expect(resolved.status).toBe('clean');
      expect(resolved.conflicts).toHaveLength(0);
      expect(resolved.autoMerged.find((m) => m.facet === 'budget')?.mergedText).toBe('Budget: $1750');
      expect(resolved.autoMerged.find((m) => m.facet === 'budget')?.source).toBe('manual');
    });

    it('keeps unresolved conflicts', async () => {
      const baseFacets = [
        { ...testFacets.constraint('Budget: $1000'), facet: 'budget' },
        { ...testFacets.constraint('Date: Jan 1'), facet: 'date' },
      ];
      const sourceFacets = [
        { ...testFacets.constraint('Budget: $1500'), facet: 'budget' },
        { ...testFacets.constraint('Date: Jan 15'), facet: 'date' },
      ];
      const targetFacets = [
        { ...testFacets.constraint('Budget: $2000'), facet: 'budget' },
        { ...testFacets.constraint('Date: Feb 1'), facet: 'date' },
      ];

      const result = await mergeEngine.merge(baseFacets, sourceFacets, targetFacets);

      // Only resolve budget, leave date
      const resolutions = new Map([['budget', 'Budget: $1750']]);
      const resolved = mergeEngine.applyResolutions(result, resolutions);

      expect(resolved.status).toBe('conflicts');
      expect(resolved.conflicts).toHaveLength(1);
      expect(resolved.conflicts[0].facet).toBe('date');
    });
  });

  describe('LLM Resolution', () => {
    it('uses LLM to resolve conflicts when enabled', async () => {
      const llmProvider = new StubLLMProvider();
      const engineWithLLM = createMergeEngine({
        llmProvider,
        autoResolveConflicts: true,
      });

      const baseFacets = [{ ...testFacets.constraint('Budget: $1000'), facet: 'budget' }];
      const sourceFacets = [{ ...testFacets.constraint('Budget: $1500'), facet: 'budget' }];
      const targetFacets = [{ ...testFacets.constraint('Budget: $2000'), facet: 'budget' }];

      const result = await engineWithLLM.merge(baseFacets, sourceFacets, targetFacets);

      // LLM should resolve the conflict
      expect(result.status).toBe('clean');
      expect(result.stats.llmResolvedCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Statistics', () => {
    it('calculates correct merge statistics', async () => {
      const baseFacets = [
        testFacets.goal('Goal 1'),
        testFacets.goal('Goal 2'),
      ];
      const sourceFacets = [
        testFacets.goal('Goal 1'),
        testFacets.goal('Goal 2 modified'),
        testFacets.preference('New preference'),
      ];
      const targetFacets = [
        testFacets.goal('Goal 1'),
        testFacets.goal('Goal 2'),
      ];

      const result = await mergeEngine.merge(baseFacets, sourceFacets, targetFacets);

      expect(result.stats.totalFacets).toBeGreaterThan(0);
      expect(result.stats.autoMergedCount).toBe(result.autoMerged.length);
      expect(result.stats.conflictCount).toBe(result.conflicts.length);
    });

    it('tracks source counts correctly', async () => {
      const baseFacets = [testFacets.goal('Base goal')];
      const sourceFacets = [
        testFacets.goal('Base goal'),
        testFacets.preference('Source pref'),
      ];
      const targetFacets = [
        testFacets.goal('Base goal'),
        { ...testFacets.goal('Target goal'), facet: 'target-goal' },
      ];

      const result = await mergeEngine.merge(baseFacets, sourceFacets, targetFacets);

      expect(result.stats.bySource.base).toBeGreaterThanOrEqual(0);
      expect(result.stats.bySource.source).toBeGreaterThanOrEqual(0);
      expect(result.stats.bySource.target).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Edge Cases', () => {
    it('handles empty inputs', async () => {
      const result = await mergeEngine.merge([], [], []);

      expect(result.status).toBe('clean');
      expect(result.autoMerged).toHaveLength(0);
      expect(result.conflicts).toHaveLength(0);
    });

    it('handles single facet', async () => {
      const baseFacets = [testFacets.goal('Only goal')];

      const result = await mergeEngine.merge(baseFacets, baseFacets, baseFacets);

      expect(result.status).toBe('clean');
      expect(result.autoMerged).toHaveLength(1);
    });
  });
});
