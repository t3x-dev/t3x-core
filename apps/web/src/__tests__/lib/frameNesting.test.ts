import type { SemanticContent } from '@t3x-dev/core';
import { describe, expect, it } from 'vitest';
import { nestFrames } from '@/lib/frameNesting';

describe('nestFrames', () => {
  it('returns frames as-is when no relations', () => {
    const content: SemanticContent = {
      trees: [{ key: 'topic', slots: { name: 'test' }, children: [] }],
      relations: [],
    };
    expect(nestFrames(content)).toHaveLength(1);
  });

  it('returns trees from content', () => {
    const content: SemanticContent = {
      trees: [
        { key: 'root', slots: { name: 'A' }, children: [] },
        { key: 'sub', slots: { detail: 'B' }, children: [] },
      ],
      relations: [{ from: 'sub', to: 'root', type: 'depends' }],
    };
    const result = nestFrames(content);
    // nestFrames just returns content.trees
    expect(result).toHaveLength(2);
  });

  it('handles multiple children', () => {
    const content: SemanticContent = {
      trees: [
        { key: 'root', slots: {}, children: [] },
        { key: 'child', slots: { a: '1' }, children: [] },
        { key: 'child2', slots: { b: '2' }, children: [] },
      ],
      relations: [
        { from: 'child', to: 'root', type: 'depends' },
        { from: 'child2', to: 'root', type: 'follows' },
      ],
    };
    const result = nestFrames(content);
    expect(result.length).toBeGreaterThan(0);
  });

  it('avoids infinite cycle', () => {
    const content: SemanticContent = {
      trees: [
        { key: 'a', slots: {}, children: [] },
        { key: 'b', slots: {}, children: [] },
      ],
      relations: [
        { from: 'a', to: 'b', type: 'depends' },
        { from: 'b', to: 'a', type: 'follows' },
      ],
    };
    expect(() => nestFrames(content)).not.toThrow();
  });
});
