import { describe, expect, it } from 'vitest';
import { prepareFrameMerge } from '../../semantic/merge';
import type { SemanticContent } from '../../semantic/types';

const f = (id: string, type: string, slots: Record<string, unknown>) => ({ id, type, slots });

describe('prepareFrameMerge', () => {
  it('auto-keeps frames identical in source and target', () => {
    const base: SemanticContent = { frames: [f('f_001', 'x', { a: 1 })], relations: [] };
    const source: SemanticContent = { frames: [f('f_001', 'x', { a: 1 })], relations: [] };
    const target: SemanticContent = { frames: [f('f_001', 'x', { a: 1 })], relations: [] };
    const result = prepareFrameMerge(base, source, target);
    expect(result.autoKept).toHaveLength(1);
    expect(result.conflicts).toHaveLength(0);
  });

  it('auto-keeps when only source modified', () => {
    const base: SemanticContent = { frames: [f('f_001', 'x', { a: 1 })], relations: [] };
    const source: SemanticContent = { frames: [f('f_001', 'x', { a: 99 })], relations: [] };
    const target: SemanticContent = { frames: [f('f_001', 'x', { a: 1 })], relations: [] };
    const result = prepareFrameMerge(base, source, target);
    expect(result.autoKept).toHaveLength(1);
    expect(result.autoKept[0].slots.a).toBe(99);
  });

  it('auto-keeps when only target modified', () => {
    const base: SemanticContent = { frames: [f('f_001', 'x', { a: 1 })], relations: [] };
    const source: SemanticContent = { frames: [f('f_001', 'x', { a: 1 })], relations: [] };
    const target: SemanticContent = { frames: [f('f_001', 'x', { a: 99 })], relations: [] };
    const result = prepareFrameMerge(base, source, target);
    expect(result.autoKept).toHaveLength(1);
    expect(result.autoKept[0].slots.a).toBe(99);
  });

  it('detects conflict when both modified same slot differently', () => {
    const base: SemanticContent = { frames: [f('f_001', 'x', { a: 1 })], relations: [] };
    const source: SemanticContent = { frames: [f('f_001', 'x', { a: 10 })], relations: [] };
    const target: SemanticContent = { frames: [f('f_001', 'x', { a: 20 })], relations: [] };
    const result = prepareFrameMerge(base, source, target);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].slotConflicts[0]).toMatchObject({
      key: 'a',
      baseValue: 1,
      sourceValue: 10,
      targetValue: 20,
    });
  });

  it('handles frame only in source', () => {
    const base: SemanticContent = { frames: [], relations: [] };
    const source: SemanticContent = { frames: [f('f_001', 'x', { a: 1 })], relations: [] };
    const target: SemanticContent = { frames: [], relations: [] };
    const result = prepareFrameMerge(base, source, target);
    expect(result.onlyInSource).toHaveLength(1);
  });

  it('handles frame only in target', () => {
    const base: SemanticContent = { frames: [], relations: [] };
    const source: SemanticContent = { frames: [], relations: [] };
    const target: SemanticContent = { frames: [f('f_001', 'x', { a: 1 })], relations: [] };
    const result = prepareFrameMerge(base, source, target);
    expect(result.onlyInTarget).toHaveLength(1);
  });

  it('categorizes relations', () => {
    const frames = [f('f_001', 'x', { a: 1 }), f('f_002', 'y', { b: 2 })];
    const base: SemanticContent = { frames, relations: [] };
    const source: SemanticContent = {
      frames,
      relations: [{ from: 'f_001', to: 'f_002', type: 'causes' }],
    };
    const target: SemanticContent = {
      frames,
      relations: [{ from: 'f_001', to: 'f_002', type: 'elaborates' }],
    };
    const result = prepareFrameMerge(base, source, target);
    expect(result.relationsOnlyInSource).toHaveLength(1);
    expect(result.relationsOnlyInTarget).toHaveLength(1);
  });

  it('auto-merges non-conflicting slot changes with one-side type change', () => {
    const base: SemanticContent = { frames: [f('f_001', 'plan', { a: 1, b: 2 })], relations: [] };
    const source: SemanticContent = {
      frames: [f('f_001', 'plan', { a: 10, b: 2 })],
      relations: [],
    };
    const target: SemanticContent = {
      frames: [f('f_001', 'refined_plan', { a: 1, b: 20 })],
      relations: [],
    };
    const result = prepareFrameMerge(base, source, target);
    expect(result.autoKept).toHaveLength(1);
    expect(result.autoKept[0].type).toBe('refined_plan');
    expect(result.autoKept[0].slots.a).toBe(10);
    expect(result.autoKept[0].slots.b).toBe(20);
  });

  it('conflicts when both sides change type differently', () => {
    const base: SemanticContent = { frames: [f('f_001', 'plan', { a: 1 })], relations: [] };
    const source: SemanticContent = { frames: [f('f_001', 'budget', { a: 1 })], relations: [] };
    const target: SemanticContent = { frames: [f('f_001', 'travel', { a: 1 })], relations: [] };
    const result = prepareFrameMerge(base, source, target);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].sourceFrame.type).toBe('budget');
    expect(result.conflicts[0].targetFrame.type).toBe('travel');
  });

  it('no conflict when both make same change', () => {
    const base: SemanticContent = { frames: [f('f_001', 'x', { a: 1 })], relations: [] };
    const source: SemanticContent = { frames: [f('f_001', 'x', { a: 99 })], relations: [] };
    const target: SemanticContent = { frames: [f('f_001', 'x', { a: 99 })], relations: [] };
    const result = prepareFrameMerge(base, source, target);
    expect(result.autoKept).toHaveLength(1);
    expect(result.conflicts).toHaveLength(0);
  });
});
