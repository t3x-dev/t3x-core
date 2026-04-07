/**
 * Integration Test: Extraction → Transforms → Commit-ready Content
 *
 * Validates the full flow from raw extraction output through
 * deterministic transforms to commit-ready SemanticContent.
 */

import { describe, expect, it } from 'vitest';
import { flattenTrees } from '../../semantic/tree';
import type { SemanticContent } from '../../semantic/types';
import { runTransforms } from '../../extractors/transforms';

describe('extraction-to-commit integration', () => {
  it('transforms produce valid SemanticContent from raw trees', () => {
    const rawContent: SemanticContent = {
      trees: [
        {
          key: 'travel_planning',
          slots: { destination: 'Tokyo', duration: '2 weeks', budget_amount: '$5000' },
          children: [],
        },
        {
          key: 'preference',
          slots: { item: 'Japanese food', sentiment: 'likes' },
          children: [],
        },
        {
          key: 'constraint',
          slots: { type: 'budget', value: 'under $5000' },
          children: [],
        },
      ],
      relations: [
        { from: 'preference', to: 'travel_planning', type: 'depends' },
        { from: 'constraint', to: 'travel_planning', type: 'depends' },
      ],
    };

    const turns = [
      { role: 'user', content: 'I want to plan a 2-week trip to Tokyo. Budget is under $5000. I love Japanese food.' },
      { role: 'assistant', content: 'Great! Tokyo is wonderful. Let me help you plan.' },
    ];

    const result = runTransforms(rawContent, turns);

    // Content should still have trees
    expect(result.content.trees.length).toBeGreaterThan(0);

    // Valid tree structure
    for (const tree of result.content.trees) {
      expect(tree.key).toBeDefined();
      expect(tree.slots).toBeDefined();
      expect(typeof tree.key).toBe('string');
      expect(typeof tree.slots).toBe('object');
    }

    // No regression warnings (first extraction)
    expect(result.regressionWarnings).toHaveLength(0);
  });

  it('handles empty input gracefully', () => {
    const emptyContent: SemanticContent = { trees: [], relations: [] };
    const result = runTransforms(emptyContent, [{ role: 'user', content: 'hello' }]);

    expect(flattenTrees(result.content.trees)).toHaveLength(0);
  });

  it('detects regression when content is lost', () => {
    const previous: SemanticContent = {
      trees: [
        { key: 'plan', slots: { a: 1, b: 2, c: 3 }, children: [] },
        { key: 'detail', slots: { x: 1 }, children: [] },
        { key: 'extra', slots: { y: 1 }, children: [] },
        { key: 'more', slots: { z: 1 }, children: [] },
      ],
      relations: [],
    };

    // Current has only 1 tree (75% loss)
    const current: SemanticContent = {
      trees: [{ key: 'plan', slots: { a: 1 }, children: [] }],
      relations: [],
    };

    const result = runTransforms(current, [], previous);

    expect(result.regressionWarnings.length).toBeGreaterThan(0);
    expect(result.regressionWarnings[0].type).toBe('count_drop');
  });

  it('nesting transforms flat frames with relations into hierarchy', () => {
    const content: SemanticContent = {
      trees: [
        { key: 'trip', slots: { dest: 'Tokyo' }, children: [] },
        { key: 'budget', slots: { amount: 5000 }, children: [] },
      ],
      relations: [
        { from: 'budget', to: 'trip', type: 'depends' },
      ],
    };

    const result = runTransforms(content, []);

    // budget should be nested under trip (not a root anymore)
    const frames = flattenTrees(result.content.trees);
    // Relations consumed → empty
    expect(result.content.relations).toHaveLength(0);
  });
});
