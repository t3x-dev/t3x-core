import { describe, expect, it } from 'vitest';
import type { Relation, SemanticContent, TreeNode } from '../../semantic/types';
import { applyYOps } from '../engine';

// ── Test Helpers ──

const t = (
  key: string,
  slots: Record<string, unknown> = {},
  children: TreeNode[] = [],
): TreeNode => ({
  key,
  slots: slots as TreeNode['slots'],
  children,
});

const sc = (
  trees: TreeNode[],
  relations: SemanticContent['relations'] = [],
): SemanticContent => ({
  trees,
  relations,
});

// ── relate ──

describe('relate', () => {
  it('adds a relation between existing nodes', () => {
    const content = sc([t('trip', {}, [t('dining', {}), t('budget', {})])]);
    const result = applyYOps(content, [
      { relate: { from: 'trip/dining', to: 'trip/budget', type: 'depends' } },
    ]);
    expect(result.ok).toBe(true);
    expect(result.relations).toHaveLength(1);
    expect(result.relations[0]).toEqual({
      from: 'trip/dining',
      to: 'trip/budget',
      type: 'depends',
    });
  });

  it('attaches confidence to relation', () => {
    const content = sc([t('trip', {}, [t('dining', {}), t('budget', {})])]);
    const result = applyYOps(content, [
      { relate: { from: 'trip/dining', to: 'trip/budget', type: 'causes', confidence: 0.8 } },
    ]);
    expect(result.ok).toBe(true);
    expect(result.relations[0].confidence).toBe(0.8);
  });

  it('rejects self-relation', () => {
    const content = sc([t('trip', {})]);
    const result = applyYOps(content, [
      { relate: { from: 'trip', to: 'trip', type: 'causes' } },
    ]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('SELF_RELATION');
  });

  it('rejects duplicate relation (same from/to/type)', () => {
    const rels: Relation[] = [
      { from: 'trip/dining', to: 'trip/budget', type: 'depends' },
    ];
    const content = sc([t('trip', {}, [t('dining', {}), t('budget', {})])], rels);
    const result = applyYOps(content, [
      { relate: { from: 'trip/dining', to: 'trip/budget', type: 'depends' } },
    ]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('DUPLICATE_RELATION');
  });

  it('detects cycle in causes relations', () => {
    // A causes B already exists; adding B causes A would create a cycle
    const rels: Relation[] = [
      { from: 'trip/a', to: 'trip/b', type: 'causes' },
    ];
    const content = sc([t('trip', {}, [t('a', {}), t('b', {})])], rels);
    const result = applyYOps(content, [
      { relate: { from: 'trip/b', to: 'trip/a', type: 'causes' } },
    ]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('CYCLE_DETECTED');
  });

  it('detects cycle in follows relations', () => {
    const rels: Relation[] = [
      { from: 'trip/a', to: 'trip/b', type: 'follows' },
      { from: 'trip/b', to: 'trip/c', type: 'follows' },
    ];
    const content = sc([t('trip', {}, [t('a', {}), t('b', {}), t('c', {})])], rels);
    // Adding C follows A would create A->B->C->A cycle
    const result = applyYOps(content, [
      { relate: { from: 'trip/c', to: 'trip/a', type: 'follows' } },
    ]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('CYCLE_DETECTED');
  });

  it('allows non-causal duplicate type (different from/to with same type)', () => {
    // "depends" is not in the causes/follows set, so no cycle check
    const rels: Relation[] = [
      { from: 'trip/a', to: 'trip/b', type: 'depends' },
    ];
    const content = sc([t('trip', {}, [t('a', {}), t('b', {})])], rels);
    // Adding reverse depends: B depends A — this is allowed (depends has no cycle check)
    const result = applyYOps(content, [
      { relate: { from: 'trip/b', to: 'trip/a', type: 'depends' } },
    ]);
    expect(result.ok).toBe(true);
    expect(result.relations).toHaveLength(2);
  });

  it('allows same from/to with different type', () => {
    const rels: Relation[] = [
      { from: 'trip/a', to: 'trip/b', type: 'depends' },
    ];
    const content = sc([t('trip', {}, [t('a', {}), t('b', {})])], rels);
    const result = applyYOps(content, [
      { relate: { from: 'trip/a', to: 'trip/b', type: 'contrasts' } },
    ]);
    expect(result.ok).toBe(true);
    expect(result.relations).toHaveLength(2);
  });

  it('rejects when from node does not exist', () => {
    const content = sc([t('trip', {}, [t('a', {})])]);
    const result = applyYOps(content, [
      { relate: { from: 'nonexistent', to: 'trip/a', type: 'causes' } },
    ]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('NODE_NOT_FOUND');
  });

  it('rejects when to node does not exist', () => {
    const content = sc([t('trip', {}, [t('a', {})])]);
    const result = applyYOps(content, [
      { relate: { from: 'trip/a', to: 'nonexistent', type: 'causes' } },
    ]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('NODE_NOT_FOUND');
  });
});

// ── unrelate ──

describe('unrelate', () => {
  it('removes a relation', () => {
    const rels: Relation[] = [
      { from: 'trip/dining', to: 'trip/budget', type: 'depends' },
    ];
    const content = sc([t('trip', {}, [t('dining', {}), t('budget', {})])], rels);
    const result = applyYOps(content, [
      { unrelate: { from: 'trip/dining', to: 'trip/budget', type: 'depends' } },
    ]);
    expect(result.ok).toBe(true);
    expect(result.relations).toHaveLength(0);
  });

  it('is no-op for missing relation (idempotent)', () => {
    const content = sc([t('trip', {})]);
    const result = applyYOps(content, [
      { unrelate: { from: 'trip', to: 'other', type: 'causes' } },
    ]);
    expect(result.ok).toBe(true);
    expect(result.applied).toBe(1);
    expect(result.relations).toHaveLength(0);
  });

  it('only removes matching relation, leaves others', () => {
    const rels: Relation[] = [
      { from: 'trip/a', to: 'trip/b', type: 'depends' },
      { from: 'trip/a', to: 'trip/b', type: 'causes' },
      { from: 'trip/b', to: 'trip/a', type: 'depends' },
    ];
    const content = sc([t('trip', {}, [t('a', {}), t('b', {})])], rels);
    const result = applyYOps(content, [
      { unrelate: { from: 'trip/a', to: 'trip/b', type: 'depends' } },
    ]);
    expect(result.ok).toBe(true);
    expect(result.relations).toHaveLength(2);
  });
});
