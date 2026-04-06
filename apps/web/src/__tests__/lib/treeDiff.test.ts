import { describe, expect, it } from 'vitest';
import { computeTreeDiff } from '@/lib/treeDiff';
import type { TreeNode } from '@t3x-dev/core';

const makeNode = (key: string, slots: Record<string, string> = {}, children: TreeNode[] = []): TreeNode =>
  ({ key, slots, children, source: {} } as any);

describe('computeTreeDiff', () => {
  it('marks all nodes as added when base is empty', () => {
    const diff = computeTreeDiff([], [makeNode('trip', { destination: 'Hangzhou' })]);
    expect(diff.added).toContain('trip');
    expect(diff.addedSlots['trip']).toContain('destination');
    expect(diff.summary.nodesAdded).toBe(1);
    expect(diff.summary.slotsAdded).toBe(1);
  });

  it('detects modified slots', () => {
    const base = [makeNode('trip', { budget: 'moderate' })];
    const result = [makeNode('trip', { budget: '3000 CNY' })];
    const diff = computeTreeDiff(base, result);
    expect(diff.modifiedSlots['trip']).toContainEqual({ key: 'budget', oldValue: 'moderate', newValue: '3000 CNY' });
    expect(diff.summary.slotsModified).toBe(1);
  });

  it('detects removed nodes', () => {
    const base = [makeNode('trip'), makeNode('old')];
    const result = [makeNode('trip')];
    const diff = computeTreeDiff(base, result);
    expect(diff.removed).toContain('old');
    expect(diff.summary.nodesRemoved).toBe(1);
  });

  it('handles unchanged trees', () => {
    const trees = [makeNode('trip', { budget: 'moderate' })];
    const diff = computeTreeDiff(trees, trees);
    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
    expect(Object.keys(diff.modifiedSlots)).toHaveLength(0);
  });

  it('detects added slots on existing nodes', () => {
    const base = [makeNode('trip', { dest: 'HZ' })];
    const result = [makeNode('trip', { dest: 'HZ', budget: '3000' })];
    const diff = computeTreeDiff(base, result);
    expect(diff.addedSlots['trip']).toContain('budget');
    expect(diff.summary.slotsAdded).toBe(1);
  });

  it('detects removed slots', () => {
    const base = [makeNode('trip', { dest: 'HZ', old: 'x' })];
    const result = [makeNode('trip', { dest: 'HZ' })];
    const diff = computeTreeDiff(base, result);
    expect(diff.removedSlots['trip']).toContain('old');
    expect(diff.summary.slotsRemoved).toBe(1);
  });
});
