import { describe, expect, it } from 'vitest';
import { buildMerkleTree, verifyMembership } from '../../hash/merkleTree';

describe('buildMerkleTree', () => {
  it('builds tree from nodes and returns root hash', () => {
    const nodes = [
      { id: 's_1', text: 'User prefers dark mode.' },
      { id: 's_2', text: 'OAuth 2.0 is the auth standard.' },
      { id: 's_3', text: 'TypeScript is preferred.' },
      { id: 's_4', text: 'Tests should use vitest.' },
    ];

    const tree = buildMerkleTree(nodes);
    expect(tree.root).toMatch(/^sha256:/);
    expect(tree.leaves).toHaveLength(4);
    expect(tree.depth).toBeGreaterThan(0);
  });

  it('returns deterministic root for same input', () => {
    const nodes = [
      { id: 's_1', text: 'Hello world.' },
      { id: 's_2', text: 'Goodbye world.' },
    ];

    const tree1 = buildMerkleTree(nodes);
    const tree2 = buildMerkleTree(nodes);
    expect(tree1.root).toBe(tree2.root);
  });

  it('changes root when any node changes', () => {
    const nodes1 = [
      { id: 's_1', text: 'Hello world.' },
      { id: 's_2', text: 'Goodbye world.' },
    ];
    const nodes2 = [
      { id: 's_1', text: 'Hello world.' },
      { id: 's_2', text: 'Goodbye universe.' },
    ];

    const tree1 = buildMerkleTree(nodes1);
    const tree2 = buildMerkleTree(nodes2);
    expect(tree1.root).not.toBe(tree2.root);
  });

  it('handles single node', () => {
    const tree = buildMerkleTree([{ id: 's_1', text: 'Solo.' }]);
    expect(tree.root).toMatch(/^sha256:/);
    expect(tree.leaves).toHaveLength(1);
  });

  it('handles empty input', () => {
    const tree = buildMerkleTree([]);
    expect(tree.root).toMatch(/^sha256:/);
    expect(tree.leaves).toHaveLength(0);
    expect(tree.depth).toBe(0);
  });

  it('handles odd number of nodes (pads last level)', () => {
    const nodes = [
      { id: 's_1', text: 'One.' },
      { id: 's_2', text: 'Two.' },
      { id: 's_3', text: 'Three.' },
    ];

    const tree = buildMerkleTree(nodes);
    expect(tree.root).toMatch(/^sha256:/);
    expect(tree.leaves).toHaveLength(3);
  });
});

describe('verifyMembership', () => {
  it('verifies a node is in the tree', () => {
    const nodes = [
      { id: 's_1', text: 'User prefers dark mode.' },
      { id: 's_2', text: 'OAuth 2.0 is the auth standard.' },
      { id: 's_3', text: 'TypeScript is preferred.' },
      { id: 's_4', text: 'Tests should use vitest.' },
    ];

    const tree = buildMerkleTree(nodes);
    const proof = verifyMembership(tree, 's_2');
    expect(proof).not.toBeNull();
    expect(proof!.verified).toBe(true);
    expect(proof!.proof).toHaveLength(tree.depth);
  });

  it('returns null for non-existent node', () => {
    const nodes = [
      { id: 's_1', text: 'Hello.' },
      { id: 's_2', text: 'World.' },
    ];

    const tree = buildMerkleTree(nodes);
    const proof = verifyMembership(tree, 's_nonexistent');
    expect(proof).toBeNull();
  });
});
