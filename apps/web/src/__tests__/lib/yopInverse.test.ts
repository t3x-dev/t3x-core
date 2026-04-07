import { describe, it, expect } from 'vitest';
import type { SemanticContent, TreeNode } from '@t3x-dev/core';
import { applyYOps } from '@t3x-dev/core';
import type { YOp } from '@t3x-dev/core';
import { computeInverse } from '@/lib/yopInverse';

function makeDraft(...trees: TreeNode[]): SemanticContent {
  return { trees, relations: [] };
}

function makeNode(key: string, slots: Record<string, string> = {}, children: TreeNode[] = []): TreeNode {
  return { key, slots, children };
}

describe('computeInverse', () => {
  it('inverts set on existing slot to set with old value', () => {
    const draft = makeDraft(makeNode('trip', { budget: '1000' }));
    const op: YOp = { set: { path: 'trip/budget', value: '2000' } };
    const inv = computeInverse(op, draft);
    expect(inv).toEqual({ set: { path: 'trip/budget', value: '1000' } });
  });

  it('inverts set on new slot to unset', () => {
    const draft = makeDraft(makeNode('trip', {}));
    const op: YOp = { set: { path: 'trip/budget', value: '1000' } };
    const inv = computeInverse(op, draft);
    expect(inv).toEqual({ unset: { path: 'trip/budget' } });
  });

  it('inverts unset to set with old value', () => {
    const draft = makeDraft(makeNode('trip', { budget: '1000' }));
    const op: YOp = { unset: { path: 'trip/budget' } };
    const inv = computeInverse(op, draft);
    expect(inv).toEqual({ set: { path: 'trip/budget', value: '1000' } });
  });

  it('inverts define to drop', () => {
    const draft = makeDraft();
    const op: YOp = { define: { path: 'hotel' } };
    const inv = computeInverse(op, draft);
    expect(inv).toEqual({ drop: { path: 'hotel' } });
  });

  it('inverts define under parent to drop with full path', () => {
    const draft = makeDraft(makeNode('trip', {}, []));
    const op: YOp = { define: { path: 'trip/hotel' } };
    const inv = computeInverse(op, draft);
    expect(inv).toEqual({ drop: { path: 'trip/hotel' } });
  });

  it('inverts populate to context-based inverse', () => {
    const draft = makeDraft(makeNode('hotel'));
    const op: YOp = { populate: { path: 'hotel', values: { stars: '5', name: 'Hilton' } } };
    const inv = computeInverse(op, draft);
    expect(inv).toHaveProperty('_context');
  });

  it('inverts drop to context-based inverse with snapshot', () => {
    const draft = makeDraft(makeNode('hotel', { stars: '5', name: 'Hilton' }));
    const op: YOp = { drop: { path: 'hotel' } };
    const inv = computeInverse(op, draft);
    expect(inv).toHaveProperty('_context');
    const ctx = (inv as { _context: { snapshot: TreeNode[] } })._context;
    expect(ctx.snapshot).toHaveLength(1);
    expect(ctx.snapshot[0].key).toBe('hotel');
    expect(ctx.snapshot[0].slots).toEqual({ stars: '5', name: 'Hilton' });
  });

  it('inverts rename', () => {
    const draft = makeDraft(makeNode('hotel'));
    const op: YOp = { rename: { path: 'hotel', to: 'accommodation' } };
    const inv = computeInverse(op, draft);
    expect(inv).toEqual({ rename: { path: 'accommodation', to: 'hotel' } });
  });

  it('inverts clone to drop at target', () => {
    const draft = makeDraft(makeNode('hotel', { stars: '5' }));
    const op: YOp = { clone: { from: 'hotel', to: '' } };
    const inv = computeInverse(op, draft);
    expect(inv).toHaveProperty('drop');
  });

  it('inverts move to move back to original position', () => {
    const draft = makeDraft(makeNode('parent', {}, [makeNode('child')]));
    const op: YOp = { move: { from: 'parent/child', to: 'child' } };
    const inv = computeInverse(op, draft);
    expect(inv).toEqual({ move: { from: 'child', to: 'parent/child' } });
  });

  it('inverts relate to unrelate', () => {
    const draft = makeDraft(makeNode('a'), makeNode('b'));
    const op: YOp = { relate: { from: 'a', to: 'b', type: 'causes' } };
    const inv = computeInverse(op, draft);
    expect(inv).toEqual({ unrelate: { from: 'a', to: 'b', type: 'causes' } });
  });

  it('inverts unrelate to relate', () => {
    const draft: SemanticContent = {
      trees: [makeNode('a'), makeNode('b')],
      relations: [{ from: 'a', to: 'b', type: 'causes' }],
    };
    const op: YOp = { unrelate: { from: 'a', to: 'b', type: 'causes' } };
    const inv = computeInverse(op, draft);
    expect(inv).toEqual({ relate: { from: 'a', to: 'b', type: 'causes' } });
  });

  it('returns context-based inverse for nest', () => {
    const draft = makeDraft(makeNode('group', {}, [makeNode('a', { x: '1' }), makeNode('b', { y: '2' })]));
    const op: YOp = { nest: { path: 'group', keys: ['a', 'b'], under: 'subgroup' } };
    const result = computeInverse(op, draft);
    expect(result).toHaveProperty('_context');
  });

  it('returns context-based inverse for split', () => {
    const draft = makeDraft(makeNode('trip', { budget: '1000', duration: '5d' }));
    const op: YOp = { split: { path: 'trip', into: { cost: ['budget'], time: ['duration'] } } };
    const result = computeInverse(op, draft);
    expect(result).toHaveProperty('_context');
  });

  it('returns context-based inverse for fold', () => {
    const draft = makeDraft({ key: 'wrapper', slots: {}, children: [makeNode('inner', { x: '1' })] });
    const op: YOp = { fold: { path: 'wrapper' } };
    const result = computeInverse(op, draft);
    expect(result).toHaveProperty('_context');
  });

  it('returns context-based inverse for merge', () => {
    const draft = makeDraft(makeNode('group', {}, [makeNode('a', { x: '1' }), makeNode('b', { y: '2' })]));
    const op: YOp = { merge: { path: 'group', keys: ['a', 'b'], into: 'combined' } };
    const result = computeInverse(op, draft);
    expect(result).toHaveProperty('_context');
  });

  // ── Roundtrip tests ──

  it('roundtrip: set + inverse restores original draft', () => {
    const original = makeDraft(makeNode('trip', { budget: '1000' }));
    const op: YOp = { set: { path: 'trip/budget', value: '2000' } };
    const inv = computeInverse(op, original);
    const after = applyYOps(original, [op]);
    expect(after.ok).toBe(true);
    const restored = applyYOps({ trees: after.trees, relations: after.relations }, [inv as YOp]);
    expect(restored.ok).toBe(true);
    expect(restored.trees[0].slots.budget).toBe('1000');
  });

  it('roundtrip: define + inverse restores original draft', () => {
    const original = makeDraft(makeNode('trip'));
    const op: YOp = { define: { path: 'hotel' } };
    const inv = computeInverse(op, original);
    // define inverse is a drop
    expect(inv).toEqual({ drop: { path: 'hotel' } });
    const after = applyYOps(original, [op]);
    expect(after.ok).toBe(true);
    expect(after.trees).toHaveLength(2);
    const restored = applyYOps({ trees: after.trees, relations: after.relations }, [inv as YOp]);
    expect(restored.ok).toBe(true);
    expect(restored.trees).toHaveLength(1);
    expect(restored.trees[0].key).toBe('trip');
  });

  it('drop inverse is context-based (snapshot for restoration)', () => {
    const original = makeDraft(makeNode('hotel', { stars: '5', name: 'Hilton' }));
    const op: YOp = { drop: { path: 'hotel' } };
    const inv = computeInverse(op, original);
    // Drop now returns a context inverse with snapshot (since add no longer exists)
    expect(inv).toHaveProperty('_context');
    const ctx = (inv as { _context: { snapshot: TreeNode[] } })._context;
    expect(ctx.snapshot).toHaveLength(1);
    expect(ctx.snapshot[0].key).toBe('hotel');
  });
});
