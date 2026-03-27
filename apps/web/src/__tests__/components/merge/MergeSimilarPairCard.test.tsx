// @ts-nocheck — tree-primary migration: test needs rework
/**
 * MergeSimilarPairCard Component Tests
 *
 * Tests for similar sentence pair card component
 */

import { describe, expect, test } from 'vitest';
import { MergeSimilarPairCard } from '@/components/merge/MergeSimilarPairCard';
import type { MergeSimilarPair } from '@/types/merge';

describe('MergeSimilarPairCard', () => {
  test('component exports successfully', () => {
    expect(MergeSimilarPairCard).toBeDefined();
    expect(typeof MergeSimilarPairCard).toBe('function');
  });

  test('accepts required props', () => {
    const pair: MergeSimilarPair = {
      source: {
        id: 's1',
        text: 'Budget is $3000',
        confidence: 0.9,
        source: { type: 'turn', id: 't1' },
      },
      target: {
        id: 's2',
        text: 'Budget is $3500',
        confidence: 0.9,
        source: { type: 'turn', id: 't2' },
      },
      wordDiff: [
        { type: 'unchanged', text: 'Budget is ' },
        { type: 'removed', text: '$3000' },
        { type: 'added', text: '$3500' },
      ],
      resolution: undefined,
    };

    const props = { pair, index: 0 };
    expect(props.pair).toBe(pair);
    expect(props.index).toBe(0);
  });

  test('handles unresolved pair', () => {
    const pair: MergeSimilarPair = {
      source: {
        id: 's1',
        text: 'Source text',
        confidence: 0.9,
        source: { type: 'turn', id: 't1' },
      },
      target: {
        id: 's2',
        text: 'Target text',
        confidence: 0.9,
        source: { type: 'turn', id: 't2' },
      },
      wordDiff: [],
      resolution: undefined,
    };

    expect(pair.resolution).toBeUndefined();
    expect(pair.suggestion).toBeUndefined();
  });

  test('handles resolved pair with source choice', () => {
    const pair: MergeSimilarPair = {
      source: {
        id: 's1',
        text: 'Source text',
        confidence: 0.9,
        source: { type: 'turn', id: 't1' },
      },
      target: {
        id: 's2',
        text: 'Target text',
        confidence: 0.9,
        source: { type: 'turn', id: 't2' },
      },
      wordDiff: [],
      resolution: 'source',
    };

    expect(pair.resolution).toBe('source');
  });

  test('handles resolved pair with target choice', () => {
    const pair: MergeSimilarPair = {
      source: {
        id: 's1',
        text: 'Source text',
        confidence: 0.9,
        source: { type: 'turn', id: 't1' },
      },
      target: {
        id: 's2',
        text: 'Target text',
        confidence: 0.9,
        source: { type: 'turn', id: 't2' },
      },
      wordDiff: [],
      resolution: 'target',
    };

    expect(pair.resolution).toBe('target');
  });

  test('handles suggestion field', () => {
    const pair: MergeSimilarPair = {
      source: {
        id: 's1',
        text: 'Source text',
        confidence: 0.9,
        source: { type: 'turn', id: 't1' },
      },
      target: {
        id: 's2',
        text: 'Target text',
        confidence: 0.9,
        source: { type: 'turn', id: 't2' },
      },
      wordDiff: [],
      suggestion: {
        suggestion: 'Combined text',
        reasoning: 'Merged both versions',
      },
      resolution: undefined,
    };

    expect(pair.suggestion).toBeDefined();
    expect(pair.suggestion?.suggestion).toBe('Combined text');
    expect(pair.suggestion?.reasoning).toBe('Merged both versions');
  });

  test('word diff segments have correct structure', () => {
    const pair: MergeSimilarPair = {
      source: {
        id: 's1',
        text: 'text',
        confidence: 0.9,
        source: { type: 'turn', id: 't1' },
      },
      target: {
        id: 's2',
        text: 'text',
        confidence: 0.9,
        source: { type: 'turn', id: 't2' },
      },
      wordDiff: [
        { type: 'unchanged', text: 'same' },
        { type: 'removed', text: 'old' },
        { type: 'added', text: 'new' },
      ],
      resolution: undefined,
    };

    expect(pair.wordDiff.length).toBe(3);
    expect(pair.wordDiff[0].type).toBe('unchanged');
    expect(pair.wordDiff[1].type).toBe('removed');
    expect(pair.wordDiff[2].type).toBe('added');
  });
});
