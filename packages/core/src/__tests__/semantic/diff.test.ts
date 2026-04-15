import { describe, expect, it } from 'vitest';
import { diffCommits } from '../../semantic/diff';
import type { SemanticContent, TreeNode } from '../../semantic/types';

const tree = (
  key: string,
  slots: Record<string, unknown>,
  children: TreeNode[] = []
): TreeNode => ({
  key,
  slots,
  children,
});

describe('diffCommits', () => {
  it('detects identical nodes', () => {
    const a: SemanticContent = { trees: [tree('topic_a', { a: 1 })], relations: [] };
    const b: SemanticContent = { trees: [tree('topic_a', { a: 1 })], relations: [] };
    const result = diffCommits(a, b);
    expect(result.identical).toHaveLength(1);
    expect(result.identical[0]).toBe('topic_a');
    expect(result.modified).toHaveLength(0);
  });

  it('detects modified slot', () => {
    const a: SemanticContent = { trees: [tree('topic_a', { a: 1 })], relations: [] };
    const b: SemanticContent = { trees: [tree('topic_a', { a: 99 })], relations: [] };
    const result = diffCommits(a, b);
    expect(result.modified).toHaveLength(1);
    expect(result.modified[0].path).toBe('topic_a');
    expect(result.modified[0].slotDiffs[0]).toMatchObject({
      key: 'a',
      type: 'changed',
      oldValue: 1,
      newValue: 99,
    });
  });

  it('detects added slot', () => {
    const a: SemanticContent = { trees: [tree('topic_a', { a: 1 })], relations: [] };
    const b: SemanticContent = { trees: [tree('topic_a', { a: 1, b: 2 })], relations: [] };
    const result = diffCommits(a, b);
    expect(result.modified).toHaveLength(1);
    expect(result.modified[0].slotDiffs).toContainEqual(
      expect.objectContaining({ key: 'b', type: 'added', newValue: 2 })
    );
  });

  it('detects removed slot', () => {
    const a: SemanticContent = { trees: [tree('topic_a', { a: 1, b: 2 })], relations: [] };
    const b: SemanticContent = { trees: [tree('topic_a', { a: 1 })], relations: [] };
    const result = diffCommits(a, b);
    expect(result.modified).toHaveLength(1);
    expect(result.modified[0].slotDiffs).toContainEqual(
      expect.objectContaining({ key: 'b', type: 'removed', oldValue: 2 })
    );
  });

  it('detects added node', () => {
    const a: SemanticContent = { trees: [tree('topic_a', { a: 1 })], relations: [] };
    const b: SemanticContent = {
      trees: [tree('topic_a', { a: 1 }), tree('topic_b', { b: 2 })],
      relations: [],
    };
    const result = diffCommits(a, b);
    expect(result.onlyInTarget).toHaveLength(1);
    expect(result.onlyInTarget[0]).toBe('topic_b');
  });

  it('detects removed node', () => {
    const a: SemanticContent = {
      trees: [tree('topic_a', { a: 1 }), tree('topic_b', { b: 2 })],
      relations: [],
    };
    const b: SemanticContent = { trees: [tree('topic_a', { a: 1 })], relations: [] };
    const result = diffCommits(a, b);
    expect(result.onlyInSource).toHaveLength(1);
    expect(result.onlyInSource[0]).toBe('topic_b');
  });

  it('detects added relations', () => {
    const a: SemanticContent = {
      trees: [tree('topic_a', { a: 1 }), tree('topic_b', { b: 2 })],
      relations: [],
    };
    const b: SemanticContent = {
      trees: [tree('topic_a', { a: 1 }), tree('topic_b', { b: 2 })],
      relations: [{ from: 'topic_a', to: 'topic_b', type: 'causes' }],
    };
    const result = diffCommits(a, b);
    expect(result.relationsAdded).toHaveLength(1);
  });

  it('detects removed relations', () => {
    const a: SemanticContent = {
      trees: [tree('topic_a', { a: 1 }), tree('topic_b', { b: 2 })],
      relations: [{ from: 'topic_a', to: 'topic_b', type: 'causes' }],
    };
    const b: SemanticContent = {
      trees: [tree('topic_a', { a: 1 }), tree('topic_b', { b: 2 })],
      relations: [],
    };
    const result = diffCommits(a, b);
    expect(result.relationsRemoved).toHaveLength(1);
  });

  it('injects word diff for long string slots', () => {
    const a: SemanticContent = {
      trees: [tree('topic_a', { text: 'The quick brown fox jumps over the lazy dog' })],
      relations: [],
    };
    const b: SemanticContent = {
      trees: [tree('topic_a', { text: 'The slow brown fox jumps over the happy dog' })],
      relations: [],
    };
    const mockWordDiff = (_x: string, _y: string) => [{ type: 'unchanged' as const, text: 'stub' }];
    const result = diffCommits(a, b, mockWordDiff);
    expect(result.modified[0].slotDiffs[0].wordDiff).toBeDefined();
  });

  it('does not inject word diff for short strings', () => {
    const a: SemanticContent = { trees: [tree('topic_a', { city: 'Paris' })], relations: [] };
    const b: SemanticContent = { trees: [tree('topic_a', { city: 'Tokyo' })], relations: [] };
    const mockWordDiff = (_x: string, _y: string) => [{ type: 'unchanged' as const, text: 'stub' }];
    const result = diffCommits(a, b, mockWordDiff);
    expect(result.modified[0].slotDiffs[0].wordDiff).toBeUndefined();
  });
});
