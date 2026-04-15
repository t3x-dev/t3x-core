import type { SemanticContent, TreeNode } from '@t3x-dev/core';
import { describe, expect, it } from 'vitest';
import { findNodeByPath, isEmpty } from '../tree';

const makeNode = (
  key: string,
  slots: Record<string, string> = {},
  children: TreeNode[] = []
): TreeNode => ({
  key,
  slots,
  children,
});

const tree: SemanticContent = {
  trees: [
    makeNode('trip', { title: 'Paris' }, [
      makeNode('budget', { amount: '10k' }),
      makeNode('activities', {}, [makeNode('museum', { name: 'Louvre' })]),
    ]),
  ],
  relations: [],
};

describe('findNodeByPath', () => {
  it('finds root node by single-segment path', () => {
    expect(findNodeByPath(tree, 'trip')?.key).toBe('trip');
  });

  it('finds nested child', () => {
    expect(findNodeByPath(tree, 'trip/budget')?.key).toBe('budget');
  });

  it('finds deeply nested child', () => {
    expect(findNodeByPath(tree, 'trip/activities/museum')?.key).toBe('museum');
  });

  it('returns null when top-level not found', () => {
    expect(findNodeByPath(tree, 'missing')).toBeNull();
  });

  it('returns null when middle segment not found', () => {
    expect(findNodeByPath(tree, 'trip/wrong/budget')).toBeNull();
  });

  it('returns null on empty tree', () => {
    expect(findNodeByPath({ trees: [], relations: [] }, 'anything')).toBeNull();
  });
});

describe('isEmpty', () => {
  it('true for empty tree', () => {
    expect(isEmpty({ trees: [], relations: [] })).toBe(true);
  });

  it('false when trees has content', () => {
    expect(isEmpty(tree)).toBe(false);
  });

  it('true when trees empty even if relations present', () => {
    expect(isEmpty({ trees: [], relations: [{ from: 'a', to: 'b', type: 'depends' }] })).toBe(true);
  });
});
