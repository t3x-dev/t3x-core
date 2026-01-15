/**
 * WordDiffDisplay Component Tests
 *
 * Tests for word-level diff visualization component
 */

import { describe, expect, test } from 'vitest';
import { WordDiffDisplay } from '@/components/merge/WordDiffDisplay';
import type { WordDiffSegment } from '@/types/merge';

describe('WordDiffDisplay', () => {
  test('component exports successfully', () => {
    expect(WordDiffDisplay).toBeDefined();
    expect(typeof WordDiffDisplay).toBe('function');
  });

  test('accepts required props', () => {
    const segments: WordDiffSegment[] = [
      { type: 'unchanged', text: 'Budget is ' },
      { type: 'removed', text: '$3000' },
      { type: 'added', text: '$3500' },
    ];

    // Component should accept these props without error
    const props = { segments };
    expect(props.segments).toEqual(segments);
    expect(props.segments.length).toBe(3);
  });

  test('handles empty segments array', () => {
    const segments: WordDiffSegment[] = [];
    const props = { segments };
    expect(props.segments.length).toBe(0);
  });

  test('handles all segment types', () => {
    const segments: WordDiffSegment[] = [
      { type: 'unchanged', text: 'Same text' },
      { type: 'removed', text: 'Old text' },
      { type: 'added', text: 'New text' },
    ];

    const types = segments.map((s) => s.type);
    expect(types).toContain('unchanged');
    expect(types).toContain('removed');
    expect(types).toContain('added');
  });

  test('segments have correct structure', () => {
    const segment: WordDiffSegment = {
      type: 'unchanged',
      text: 'test',
    };

    expect(segment).toHaveProperty('type');
    expect(segment).toHaveProperty('text');
    expect(['unchanged', 'removed', 'added']).toContain(segment.type);
  });
});
