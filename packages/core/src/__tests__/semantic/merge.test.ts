import { describe, expect, it } from 'vitest';
import { prepareMerge } from '../../semantic/merge';
import type { SemanticContent, TreeNode } from '../../semantic/types';

const t = (key: string, slots: Record<string, unknown>, children: TreeNode[] = []): TreeNode => ({
  key,
  slots,
  children,
});

const sc = (trees: TreeNode[], relations: SemanticContent['relations'] = []): SemanticContent => ({
  trees,
  relations,
});

describe('prepareMerge', () => {
  it('auto-keeps nodes identical in source and target', () => {
    const base = sc([t('topic_a', { a: 1 })]);
    const source = sc([t('topic_a', { a: 1 })]);
    const target = sc([t('topic_a', { a: 1 })]);
    const result = prepareMerge(base, source, target);
    expect(result.autoKept).toHaveLength(1);
    expect(result.conflicts).toHaveLength(0);
  });

  it('auto-keeps when only source modified', () => {
    const base = sc([t('topic_a', { a: 1 })]);
    const source = sc([t('topic_a', { a: 99 })]);
    const target = sc([t('topic_a', { a: 1 })]);
    const result = prepareMerge(base, source, target);
    expect(result.autoKept).toHaveLength(1);
    expect(result.autoKept[0]).toBe('topic_a');
  });

  it('auto-keeps when only target modified', () => {
    const base = sc([t('topic_a', { a: 1 })]);
    const source = sc([t('topic_a', { a: 1 })]);
    const target = sc([t('topic_a', { a: 99 })]);
    const result = prepareMerge(base, source, target);
    expect(result.autoKept).toHaveLength(1);
    expect(result.autoKept[0]).toBe('topic_a');
  });

  it('detects conflict when both modified same slot differently', () => {
    const base = sc([t('topic_a', { a: 1 })]);
    const source = sc([t('topic_a', { a: 10 })]);
    const target = sc([t('topic_a', { a: 20 })]);
    const result = prepareMerge(base, source, target);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].path).toBe('topic_a');
    expect(result.conflicts[0].slotConflicts[0]).toMatchObject({
      key: 'a',
      baseValue: 1,
      sourceValue: 10,
      targetValue: 20,
    });
  });

  it('handles node only in source', () => {
    const base = sc([]);
    const source = sc([t('topic_a', { a: 1 })]);
    const target = sc([]);
    const result = prepareMerge(base, source, target);
    expect(result.onlyInSource).toHaveLength(1);
    expect(result.onlyInSource[0]).toBe('topic_a');
  });

  it('handles node only in target', () => {
    const base = sc([]);
    const source = sc([]);
    const target = sc([t('topic_a', { a: 1 })]);
    const result = prepareMerge(base, source, target);
    expect(result.onlyInTarget).toHaveLength(1);
    expect(result.onlyInTarget[0]).toBe('topic_a');
  });

  it('categorizes relations', () => {
    const trees = [t('topic_a', { a: 1 }), t('topic_b', { b: 2 })];
    const base = sc(trees);
    const source = sc(trees, [{ from: 'topic_a', to: 'topic_b', type: 'causes' }]);
    const target = sc(trees, [{ from: 'topic_a', to: 'topic_b', type: 'depends' }]);
    const result = prepareMerge(base, source, target);
    expect(result.relationsOnlyInSource).toHaveLength(1);
    expect(result.relationsOnlyInTarget).toHaveLength(1);
  });

  it('no conflict when both make same change', () => {
    const base = sc([t('topic_a', { a: 1 })]);
    const source = sc([t('topic_a', { a: 99 })]);
    const target = sc([t('topic_a', { a: 99 })]);
    const result = prepareMerge(base, source, target);
    expect(result.autoKept).toHaveLength(1);
    expect(result.conflicts).toHaveLength(0);
  });
});
