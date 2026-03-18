import { describe, expect, it } from 'vitest';
import { executeFrameMerge, prepareFrameMerge } from '../../semantic/merge';
import type { FrameMergeDecision, SemanticContent } from '../../semantic/types';

const f = (id: string, type: string, slots: Record<string, unknown>) => ({ id, type, slots });

function prepare(base: SemanticContent, source: SemanticContent, target: SemanticContent) {
  return prepareFrameMerge(base, source, target);
}

describe('executeFrameMerge', () => {
  it('includes auto-kept frames without any decisions', () => {
    const base: SemanticContent = { frames: [f('f_1', 'x', { a: 1 })], relations: [] };
    const prepared = prepare(base, base, base);

    const result = executeFrameMerge(prepared, {
      conflictResolutions: {},
      keepFromSource: [],
      keepFromTarget: [],
      keepRelationsFromSource: false,
      keepRelationsFromTarget: false,
    });

    expect(result.frames).toHaveLength(1);
    expect(result.frames[0].id).toBe('f_1');
  });

  it('resolves conflict with source choice', () => {
    const base: SemanticContent = { frames: [f('f_1', 'x', { a: 1 })], relations: [] };
    const source: SemanticContent = { frames: [f('f_1', 'x', { a: 10 })], relations: [] };
    const target: SemanticContent = { frames: [f('f_1', 'x', { a: 20 })], relations: [] };
    const prepared = prepare(base, source, target);

    const result = executeFrameMerge(prepared, {
      conflictResolutions: { f_1: 'source' },
      keepFromSource: [],
      keepFromTarget: [],
      keepRelationsFromSource: false,
      keepRelationsFromTarget: false,
    });

    expect(result.frames).toHaveLength(1);
    expect(result.frames[0].slots.a).toBe(10);
  });

  it('resolves conflict with target choice', () => {
    const base: SemanticContent = { frames: [f('f_1', 'x', { a: 1 })], relations: [] };
    const source: SemanticContent = { frames: [f('f_1', 'x', { a: 10 })], relations: [] };
    const target: SemanticContent = { frames: [f('f_1', 'x', { a: 20 })], relations: [] };
    const prepared = prepare(base, source, target);

    const result = executeFrameMerge(prepared, {
      conflictResolutions: { f_1: 'target' },
      keepFromSource: [],
      keepFromTarget: [],
      keepRelationsFromSource: false,
      keepRelationsFromTarget: false,
    });

    expect(result.frames).toHaveLength(1);
    expect(result.frames[0].slots.a).toBe(20);
  });

  it('resolves conflict with both — keeps both frames', () => {
    const base: SemanticContent = { frames: [f('f_1', 'x', { a: 1 })], relations: [] };
    const source: SemanticContent = { frames: [f('f_1', 'x', { a: 10 })], relations: [] };
    const target: SemanticContent = { frames: [f('f_1', 'x', { a: 20 })], relations: [] };
    const prepared = prepare(base, source, target);

    const result = executeFrameMerge(prepared, {
      conflictResolutions: { f_1: 'both' },
      keepFromSource: [],
      keepFromTarget: [],
      keepRelationsFromSource: false,
      keepRelationsFromTarget: false,
    });

    expect(result.frames).toHaveLength(2);
  });

  it('resolves conflict with custom edit', () => {
    const base: SemanticContent = { frames: [f('f_1', 'x', { a: 1 })], relations: [] };
    const source: SemanticContent = { frames: [f('f_1', 'x', { a: 10 })], relations: [] };
    const target: SemanticContent = { frames: [f('f_1', 'x', { a: 20 })], relations: [] };
    const prepared = prepare(base, source, target);

    const editedFrame = { id: 'f_1', type: 'x', slots: { a: 15, note: 'merged' } };
    const result = executeFrameMerge(prepared, {
      conflictResolutions: { f_1: { edit: editedFrame } },
      keepFromSource: [],
      keepFromTarget: [],
      keepRelationsFromSource: false,
      keepRelationsFromTarget: false,
    });

    expect(result.frames).toHaveLength(1);
    expect(result.frames[0].slots.a).toBe(15);
    expect(result.frames[0].slots.note).toBe('merged');
  });

  it('defaults to source when no resolution provided for conflict', () => {
    const base: SemanticContent = { frames: [f('f_1', 'x', { a: 1 })], relations: [] };
    const source: SemanticContent = { frames: [f('f_1', 'x', { a: 10 })], relations: [] };
    const target: SemanticContent = { frames: [f('f_1', 'x', { a: 20 })], relations: [] };
    const prepared = prepare(base, source, target);

    const result = executeFrameMerge(prepared, {
      conflictResolutions: {}, // no decision for f_1
      keepFromSource: [],
      keepFromTarget: [],
      keepRelationsFromSource: false,
      keepRelationsFromTarget: false,
    });

    expect(result.frames).toHaveLength(1);
    expect(result.frames[0].slots.a).toBe(10); // defaults to source
  });

  it('keeps selected source-only frames', () => {
    const base: SemanticContent = { frames: [], relations: [] };
    const source: SemanticContent = {
      frames: [f('f_1', 'x', { a: 1 }), f('f_2', 'y', { b: 2 })],
      relations: [],
    };
    const target: SemanticContent = { frames: [], relations: [] };
    const prepared = prepare(base, source, target);

    const result = executeFrameMerge(prepared, {
      conflictResolutions: {},
      keepFromSource: ['f_1'], // keep f_1, discard f_2
      keepFromTarget: [],
      keepRelationsFromSource: false,
      keepRelationsFromTarget: false,
    });

    expect(result.frames).toHaveLength(1);
    expect(result.frames[0].id).toBe('f_1');
  });

  it('keeps selected target-only frames', () => {
    const base: SemanticContent = { frames: [], relations: [] };
    const source: SemanticContent = { frames: [], relations: [] };
    const target: SemanticContent = {
      frames: [f('f_1', 'x', { a: 1 }), f('f_2', 'y', { b: 2 })],
      relations: [],
    };
    const prepared = prepare(base, source, target);

    const result = executeFrameMerge(prepared, {
      conflictResolutions: {},
      keepFromSource: [],
      keepFromTarget: ['f_2'], // keep f_2, discard f_1
      keepRelationsFromSource: false,
      keepRelationsFromTarget: false,
    });

    expect(result.frames).toHaveLength(1);
    expect(result.frames[0].id).toBe('f_2');
  });

  it('merges relations correctly', () => {
    const frames = [f('f_1', 'x', { a: 1 }), f('f_2', 'y', { b: 2 })];
    const base: SemanticContent = { frames, relations: [] };
    const source: SemanticContent = {
      frames,
      relations: [{ from: 'f_1', to: 'f_2', type: 'causes' as const }],
    };
    const target: SemanticContent = {
      frames,
      relations: [{ from: 'f_1', to: 'f_2', type: 'elaborates' as const }],
    };
    const prepared = prepare(base, source, target);

    // Keep both sides' relations
    const result = executeFrameMerge(prepared, {
      conflictResolutions: {},
      keepFromSource: [],
      keepFromTarget: [],
      keepRelationsFromSource: true,
      keepRelationsFromTarget: true,
    });

    expect(result.relations).toHaveLength(2);
  });

  it('excludes relations when not kept', () => {
    const frames = [f('f_1', 'x', { a: 1 }), f('f_2', 'y', { b: 2 })];
    const base: SemanticContent = { frames, relations: [] };
    const source: SemanticContent = {
      frames,
      relations: [{ from: 'f_1', to: 'f_2', type: 'causes' as const }],
    };
    const target: SemanticContent = {
      frames,
      relations: [{ from: 'f_1', to: 'f_2', type: 'elaborates' as const }],
    };
    const prepared = prepare(base, source, target);

    const result = executeFrameMerge(prepared, {
      conflictResolutions: {},
      keepFromSource: [],
      keepFromTarget: [],
      keepRelationsFromSource: false,
      keepRelationsFromTarget: false,
    });

    // Only shared relations (relationsInBoth), which is empty here
    expect(result.relations).toHaveLength(0);
  });

  it('handles complex merge: auto-kept + conflicts + unique frames + relations', () => {
    const base: SemanticContent = {
      frames: [f('f_1', 'a', { x: 1 }), f('f_2', 'b', { y: 2 })],
      relations: [{ from: 'f_1', to: 'f_2', type: 'elaborates' as const }],
    };
    const source: SemanticContent = {
      frames: [f('f_1', 'a', { x: 1 }), f('f_2', 'b', { y: 20 }), f('f_3', 'c', { z: 3 })],
      relations: [
        { from: 'f_1', to: 'f_2', type: 'elaborates' as const },
        { from: 'f_3', to: 'f_1', type: 'causes' as const },
      ],
    };
    const target: SemanticContent = {
      frames: [f('f_1', 'a', { x: 1 }), f('f_2', 'b', { y: 30 }), f('f_4', 'd', { w: 4 })],
      relations: [
        { from: 'f_1', to: 'f_2', type: 'elaborates' as const },
        { from: 'f_4', to: 'f_1', type: 'follows' as const },
      ],
    };
    const prepared = prepare(base, source, target);

    const result = executeFrameMerge(prepared, {
      conflictResolutions: { f_2: 'target' },
      keepFromSource: ['f_3'],
      keepFromTarget: ['f_4'],
      keepRelationsFromSource: true,
      keepRelationsFromTarget: true,
    });

    // f_1 (auto-kept) + f_2 (target) + f_3 (source-only kept) + f_4 (target-only kept)
    expect(result.frames).toHaveLength(4);
    const ids = result.frames.map((f) => f.id).sort();
    expect(ids).toEqual(['f_1', 'f_2', 'f_3', 'f_4']);
    expect(result.frames.find((f) => f.id === 'f_2')?.slots.y).toBe(30); // target chosen
    // Relations: shared (elaborates) + source-only (causes) + target-only (follows)
    expect(result.relations).toHaveLength(3);
  });
});
