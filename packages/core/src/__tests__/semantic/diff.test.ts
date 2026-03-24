import { describe, expect, it } from 'vitest';
import { frameDiff } from '../../semantic/diff';
import type { SemanticContent } from '../../semantic/types';

const f = (id: string, type: string, slots: Record<string, unknown>) => ({ id, type, slots });

describe('frameDiff', () => {
  it('detects identical frames', () => {
    const a: SemanticContent = { frames: [f('f_001', 'x', { a: 1 })], relations: [] };
    const b: SemanticContent = { frames: [f('f_001', 'x', { a: 1 })], relations: [] };
    const result = frameDiff(a, b);
    expect(result.identical).toHaveLength(1);
    expect(result.modified).toHaveLength(0);
  });

  it('detects modified slot', () => {
    const a: SemanticContent = { frames: [f('f_001', 'x', { a: 1 })], relations: [] };
    const b: SemanticContent = { frames: [f('f_001', 'x', { a: 99 })], relations: [] };
    const result = frameDiff(a, b);
    expect(result.modified).toHaveLength(1);
    expect(result.modified[0].slotDiffs[0]).toMatchObject({
      key: 'a',
      type: 'changed',
      oldValue: 1,
      newValue: 99,
    });
  });

  it('detects added slot', () => {
    const a: SemanticContent = { frames: [f('f_001', 'x', { a: 1 })], relations: [] };
    const b: SemanticContent = { frames: [f('f_001', 'x', { a: 1, b: 2 })], relations: [] };
    const result = frameDiff(a, b);
    expect(result.modified).toHaveLength(1);
    expect(result.modified[0].slotDiffs).toContainEqual(
      expect.objectContaining({ key: 'b', type: 'added', newValue: 2 })
    );
  });

  it('detects removed slot', () => {
    const a: SemanticContent = { frames: [f('f_001', 'x', { a: 1, b: 2 })], relations: [] };
    const b: SemanticContent = { frames: [f('f_001', 'x', { a: 1 })], relations: [] };
    const result = frameDiff(a, b);
    expect(result.modified).toHaveLength(1);
    expect(result.modified[0].slotDiffs).toContainEqual(
      expect.objectContaining({ key: 'b', type: 'removed', oldValue: 2 })
    );
  });

  it('detects added frame', () => {
    const a: SemanticContent = { frames: [f('f_001', 'x', { a: 1 })], relations: [] };
    const b: SemanticContent = {
      frames: [f('f_001', 'x', { a: 1 }), f('f_002', 'y', { b: 2 })],
      relations: [],
    };
    const result = frameDiff(a, b);
    expect(result.onlyInTarget).toHaveLength(1);
    expect(result.onlyInTarget[0].id).toBe('f_002');
  });

  it('detects removed frame', () => {
    const a: SemanticContent = {
      frames: [f('f_001', 'x', { a: 1 }), f('f_002', 'y', { b: 2 })],
      relations: [],
    };
    const b: SemanticContent = { frames: [f('f_001', 'x', { a: 1 })], relations: [] };
    const result = frameDiff(a, b);
    expect(result.onlyInSource).toHaveLength(1);
    expect(result.onlyInSource[0].id).toBe('f_002');
  });

  it('detects added relations', () => {
    const a: SemanticContent = {
      frames: [f('f_001', 'x', { a: 1 }), f('f_002', 'y', { b: 2 })],
      relations: [],
    };
    const b: SemanticContent = {
      frames: [f('f_001', 'x', { a: 1 }), f('f_002', 'y', { b: 2 })],
      relations: [{ from: 'f_001', to: 'f_002', type: 'causes' }],
    };
    const result = frameDiff(a, b);
    expect(result.relationsAdded).toHaveLength(1);
  });

  it('detects removed relations', () => {
    const a: SemanticContent = {
      frames: [f('f_001', 'x', { a: 1 }), f('f_002', 'y', { b: 2 })],
      relations: [{ from: 'f_001', to: 'f_002', type: 'causes' }],
    };
    const b: SemanticContent = {
      frames: [f('f_001', 'x', { a: 1 }), f('f_002', 'y', { b: 2 })],
      relations: [],
    };
    const result = frameDiff(a, b);
    expect(result.relationsRemoved).toHaveLength(1);
  });

  it('detects frame type change as modification', () => {
    const a: SemanticContent = {
      frames: [f('f_001', 'travel_plan', { dest: 'Paris' })],
      relations: [],
    };
    const b: SemanticContent = {
      frames: [f('f_001', 'budget_plan', { dest: 'Paris' })],
      relations: [],
    };
    const result = frameDiff(a, b);
    expect(result.identical).toHaveLength(0);
    expect(result.modified).toHaveLength(1);
    expect(result.modified[0].sourceFrame.type).toBe('travel_plan');
    expect(result.modified[0].targetFrame.type).toBe('budget_plan');
    // Slots unchanged, only type differs → slotDiffs empty
    expect(result.modified[0].slotDiffs).toHaveLength(0);
  });

  it('injects word diff for long string slots', () => {
    const a: SemanticContent = {
      frames: [f('f_001', 'x', { text: 'The quick brown fox jumps over the lazy dog' })],
      relations: [],
    };
    const b: SemanticContent = {
      frames: [f('f_001', 'x', { text: 'The slow brown fox jumps over the happy dog' })],
      relations: [],
    };
    const mockWordDiff = (_x: string, _y: string) => [{ type: 'unchanged' as const, text: 'stub' }];
    const result = frameDiff(a, b, mockWordDiff);
    expect(result.modified[0].slotDiffs[0].wordDiff).toBeDefined();
  });

  it('does not inject word diff for short strings', () => {
    const a: SemanticContent = { frames: [f('f_001', 'x', { city: 'Paris' })], relations: [] };
    const b: SemanticContent = { frames: [f('f_001', 'x', { city: 'Tokyo' })], relations: [] };
    const mockWordDiff = (_x: string, _y: string) => [{ type: 'unchanged' as const, text: 'stub' }];
    const result = frameDiff(a, b, mockWordDiff);
    expect(result.modified[0].slotDiffs[0].wordDiff).toBeUndefined();
  });
});
