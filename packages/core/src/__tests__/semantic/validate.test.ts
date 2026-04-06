import { describe, expect, it } from 'vitest';
import type { SemanticContent, TreeNode } from '../../semantic/types';
import { validateIntegrity } from '../../semantic/validate';

const tree = (key: string, slots: Record<string, unknown> = { a: 1 }, children: TreeNode[] = []): TreeNode => ({
  key,
  slots,
  children,
});

describe('validateIntegrity', () => {
  it('passes for valid content', () => {
    const content: SemanticContent = {
      trees: [tree('topic_a'), tree('topic_b')],
      relations: [{ from: 'topic_a', to: 'topic_b', type: 'causes' }],
    };
    const result = validateIntegrity(content);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('detects duplicate root tree keys', () => {
    const content: SemanticContent = {
      trees: [tree('topic_a'), tree('topic_a')],
      relations: [],
    };
    const result = validateIntegrity(content);
    expect(result.valid).toBe(false);
    expect(result.errors[0].type).toBe('duplicate_key');
  });

  it('detects duplicate child keys within a tree', () => {
    const content: SemanticContent = {
      trees: [tree('root', { a: 1 }, [tree('child'), tree('child')])],
      relations: [],
    };
    const result = validateIntegrity(content);
    expect(result.valid).toBe(false);
    expect(result.errors[0].type).toBe('duplicate_key');
  });

  it('detects broken relation endpoint', () => {
    const content: SemanticContent = {
      trees: [tree('topic_a')],
      relations: [{ from: 'topic_a', to: 'nonexistent', type: 'causes' }],
    };
    const result = validateIntegrity(content);
    expect(result.valid).toBe(false);
    expect(result.errors[0].type).toBe('broken_relation');
  });

  it('detects self-referencing relation', () => {
    const content: SemanticContent = {
      trees: [tree('topic_a')],
      relations: [{ from: 'topic_a', to: 'topic_a', type: 'causes' }],
    };
    const result = validateIntegrity(content);
    expect(result.valid).toBe(false);
    expect(result.errors[0].type).toBe('self_relation');
  });

  it('detects causal cycle', () => {
    const content: SemanticContent = {
      trees: [tree('a'), tree('b'), tree('c')],
      relations: [
        { from: 'a', to: 'b', type: 'causes' },
        { from: 'b', to: 'c', type: 'causes' },
        { from: 'c', to: 'a', type: 'causes' },
      ],
    };
    const result = validateIntegrity(content);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.type === 'cycle')).toBe(true);
  });

  it('warns on orphan tree', () => {
    const content: SemanticContent = {
      trees: [tree('topic_a'), tree('topic_b')],
      relations: [],
    };
    const result = validateIntegrity(content);
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.type === 'orphan_tree')).toBe(true);
  });

  it('no orphan warning for single tree', () => {
    const content: SemanticContent = {
      trees: [tree('topic_a')],
      relations: [],
    };
    const result = validateIntegrity(content);
    expect(result.warnings.filter((w) => w.type === 'orphan_tree')).toHaveLength(0);
  });

  it('does not flag depends cycle (only causes/follows trigger cycle detection)', () => {
    const content: SemanticContent = {
      trees: [tree('a'), tree('b')],
      relations: [
        { from: 'a', to: 'b', type: 'depends' },
        { from: 'b', to: 'a', type: 'depends' },
      ],
    };
    const result = validateIntegrity(content);
    expect(result.errors.filter((e) => e.type === 'cycle')).toHaveLength(0);
  });

  it('reports full cycle path in error message', () => {
    const content: SemanticContent = {
      trees: [tree('a'), tree('b'), tree('c')],
      relations: [
        { from: 'a', to: 'b', type: 'causes' },
        { from: 'b', to: 'c', type: 'causes' },
        { from: 'c', to: 'a', type: 'causes' },
      ],
    };
    const result = validateIntegrity(content);
    const cycleErr = result.errors.find((e) => e.type === 'cycle');
    expect(cycleErr).toBeDefined();
    expect(cycleErr!.message).toContain('→');
    expect(cycleErr!.message).toContain('a');
    expect(cycleErr!.message).toContain('b');
    expect(cycleErr!.message).toContain('c');
  });

  it('detects follows cycle', () => {
    const content: SemanticContent = {
      trees: [tree('a'), tree('b')],
      relations: [
        { from: 'a', to: 'b', type: 'follows' },
        { from: 'b', to: 'a', type: 'follows' },
      ],
    };
    const result = validateIntegrity(content);
    expect(result.errors.some((e) => e.type === 'cycle')).toBe(true);
  });
});

describe('validateIntegrity — tree with children', () => {
  it('passes for valid tree with children', () => {
    const t: TreeNode = {
      key: 'trip',
      slots: { dest: 'Tokyo' },
      children: [{ key: 'budget', slots: { amount: 5000 }, children: [] }],
    };
    const content: SemanticContent = { trees: [t], relations: [] };
    const result = validateIntegrity(content);
    expect(result.valid).toBe(true);
  });

  it('no orphan warnings for single tree with children', () => {
    const t: TreeNode = {
      key: 'trip',
      slots: { dest: 'Tokyo' },
      children: [{ key: 'budget', slots: { amount: 5000 }, children: [] }],
    };
    const content: SemanticContent = { trees: [t], relations: [] };
    const result = validateIntegrity(content);
    expect(result.warnings.filter((w) => w.type === 'orphan_tree')).toHaveLength(0);
  });

  it('validates cross-tree relation endpoints against path IDs', () => {
    const t: TreeNode = { key: 'trip', slots: { dest: 'Tokyo' }, children: [] };
    const content: SemanticContent = {
      trees: [t],
      relations: [{ from: 'trip', to: 'nonexistent', type: 'depends' }],
    };
    const result = validateIntegrity(content);
    expect(result.valid).toBe(false);
    expect(result.errors[0].type).toBe('broken_relation');
  });
});
