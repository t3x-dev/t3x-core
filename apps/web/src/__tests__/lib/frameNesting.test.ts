import { describe, expect, it } from 'vitest';
import { nestFrames } from '@/lib/frameNesting';
import type { SemanticContent } from '@t3x-dev/core';

describe('nestFrames', () => {
  it('returns frames as-is when no relations', () => {
    const content: SemanticContent = {
      frames: [{ id: 'f_001', type: 'topic', slots: { name: 'test' } }],
      relations: [],
    };
    expect(nestFrames(content)).toHaveLength(1);
  });

  it('nests child into parent via elaborates', () => {
    const content: SemanticContent = {
      frames: [
        { id: 'f_001', type: 'root', slots: { name: 'A' } },
        { id: 'f_002', type: 'sub', slots: { detail: 'B' } },
      ],
      relations: [{ from: 'f_002', to: 'f_001', type: 'elaborates' }],
    };
    const result = nestFrames(content);
    expect(result).toHaveLength(1);
    expect(result[0].slots.sub).toBeDefined();
  });

  it('handles duplicate child types with suffix', () => {
    const content: SemanticContent = {
      frames: [
        { id: 'f_001', type: 'root', slots: {} },
        { id: 'f_002', type: 'child', slots: { a: '1' } },
        { id: 'f_003', type: 'child', slots: { b: '2' } },
      ],
      relations: [
        { from: 'f_002', to: 'f_001', type: 'elaborates' },
        { from: 'f_003', to: 'f_001', type: 'elaborates' },
      ],
    };
    const result = nestFrames(content);
    expect(result[0].slots.child).toBeDefined();
    expect(result[0].slots.child_2).toBeDefined();
  });

  it('avoids infinite cycle', () => {
    const content: SemanticContent = {
      frames: [
        { id: 'f_001', type: 'a', slots: {} },
        { id: 'f_002', type: 'b', slots: {} },
      ],
      relations: [
        { from: 'f_001', to: 'f_002', type: 'elaborates' },
        { from: 'f_002', to: 'f_001', type: 'elaborates' },
      ],
    };
    expect(() => nestFrames(content)).not.toThrow();
  });
});
