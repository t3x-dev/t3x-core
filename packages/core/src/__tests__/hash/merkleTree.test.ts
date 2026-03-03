import { describe, expect, it } from 'vitest';
import { buildMerkleTree, verifyMembership } from '../../hash/merkleTree';

describe('buildMerkleTree', () => {
  it('builds tree from sentences and returns root hash', () => {
    const sentences = [
      { id: 's_1', text: 'User prefers dark mode.' },
      { id: 's_2', text: 'OAuth 2.0 is the auth standard.' },
      { id: 's_3', text: 'TypeScript is preferred.' },
      { id: 's_4', text: 'Tests should use vitest.' },
    ];

    const tree = buildMerkleTree(sentences);
    expect(tree.root).toMatch(/^sha256:/);
    expect(tree.leaves).toHaveLength(4);
    expect(tree.depth).toBeGreaterThan(0);
  });

  it('returns deterministic root for same input', () => {
    const sentences = [
      { id: 's_1', text: 'Hello world.' },
      { id: 's_2', text: 'Goodbye world.' },
    ];

    const tree1 = buildMerkleTree(sentences);
    const tree2 = buildMerkleTree(sentences);
    expect(tree1.root).toBe(tree2.root);
  });

  it('changes root when any sentence changes', () => {
    const sentences1 = [
      { id: 's_1', text: 'Hello world.' },
      { id: 's_2', text: 'Goodbye world.' },
    ];
    const sentences2 = [
      { id: 's_1', text: 'Hello world.' },
      { id: 's_2', text: 'Goodbye universe.' },
    ];

    const tree1 = buildMerkleTree(sentences1);
    const tree2 = buildMerkleTree(sentences2);
    expect(tree1.root).not.toBe(tree2.root);
  });

  it('handles single sentence', () => {
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

  it('handles odd number of sentences (pads last level)', () => {
    const sentences = [
      { id: 's_1', text: 'One.' },
      { id: 's_2', text: 'Two.' },
      { id: 's_3', text: 'Three.' },
    ];

    const tree = buildMerkleTree(sentences);
    expect(tree.root).toMatch(/^sha256:/);
    expect(tree.leaves).toHaveLength(3);
  });
});

describe('verifyMembership', () => {
  it('verifies a sentence is in the tree', () => {
    const sentences = [
      { id: 's_1', text: 'User prefers dark mode.' },
      { id: 's_2', text: 'OAuth 2.0 is the auth standard.' },
      { id: 's_3', text: 'TypeScript is preferred.' },
      { id: 's_4', text: 'Tests should use vitest.' },
    ];

    const tree = buildMerkleTree(sentences);
    const proof = verifyMembership(tree, 's_2');
    expect(proof).not.toBeNull();
    expect(proof!.verified).toBe(true);
    expect(proof!.proof).toHaveLength(tree.depth);
  });

  it('returns null for non-existent sentence', () => {
    const sentences = [
      { id: 's_1', text: 'Hello.' },
      { id: 's_2', text: 'World.' },
    ];

    const tree = buildMerkleTree(sentences);
    const proof = verifyMembership(tree, 's_nonexistent');
    expect(proof).toBeNull();
  });
});
