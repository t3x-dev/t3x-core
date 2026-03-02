/**
 * Merkle Tree Verification (#14)
 *
 * Builds a binary Merkle tree from commit sentences for efficient
 * integrity verification. Each leaf is sha256(id + text).
 *
 * Supports:
 * - Full tree construction with root hash
 * - Membership proof (verify single sentence belongs to tree)
 */

import { sha256 } from '../common';

export interface MerkleLeaf {
  id: string;
  hash: string;
  index: number;
}

export interface MerkleTree {
  root: string;
  leaves: MerkleLeaf[];
  depth: number;
  /** Internal nodes, layer by layer (leaves → root). layers[0] = leaf hashes */
  layers: string[][];
}

export interface MembershipProof {
  verified: boolean;
  sentence_id: string;
  leaf_hash: string;
  proof: ProofStep[];
}

export interface ProofStep {
  hash: string;
  position: 'left' | 'right';
}

function hashLeaf(id: string, text: string): string {
  return `sha256:${sha256(`${id}:${text}`)}`;
}

function hashPair(left: string, right: string): string {
  // Strip prefix for internal hashing, re-add for output
  const l = left.replace('sha256:', '');
  const r = right.replace('sha256:', '');
  return `sha256:${sha256(`${l}:${r}`)}`;
}

export function buildMerkleTree(
  sentences: { id: string; text: string }[],
): MerkleTree {
  if (sentences.length === 0) {
    return {
      root: `sha256:${sha256('empty')}`,
      leaves: [],
      depth: 0,
      layers: [],
    };
  }

  // Build leaf layer
  const leafHashes = sentences.map((s) => hashLeaf(s.id, s.text));
  const merkleLeaves: MerkleLeaf[] = sentences.map((s, i) => ({
    id: s.id,
    hash: leafHashes[i],
    index: i,
  }));

  const layers: string[][] = [leafHashes];

  // Build tree bottom-up
  let current = leafHashes;
  while (current.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < current.length; i += 2) {
      const left = current[i];
      const right = current[i + 1] ?? left; // duplicate last if odd
      next.push(hashPair(left, right));
    }
    layers.push(next);
    current = next;
  }

  return {
    root: current[0],
    leaves: merkleLeaves,
    depth: layers.length - 1,
    layers,
  };
}

export function verifyMembership(
  tree: MerkleTree,
  sentenceId: string,
): MembershipProof | null {
  const leaf = tree.leaves.find((l) => l.id === sentenceId);
  if (!leaf) return null;

  const proof: ProofStep[] = [];
  let index = leaf.index;

  for (let layer = 0; layer < tree.depth; layer++) {
    const currentLayer = tree.layers[layer];
    const isRight = index % 2 === 1;
    const siblingIndex = isRight ? index - 1 : index + 1;
    const siblingHash = currentLayer[siblingIndex] ?? currentLayer[index]; // self if no sibling

    proof.push({
      hash: siblingHash,
      position: isRight ? 'left' : 'right',
    });

    index = Math.floor(index / 2);
  }

  // Verify by recomputing root
  let computed = leaf.hash;
  for (const step of proof) {
    if (step.position === 'left') {
      computed = hashPair(step.hash, computed);
    } else {
      computed = hashPair(computed, step.hash);
    }
  }

  return {
    verified: computed === tree.root,
    sentence_id: sentenceId,
    leaf_hash: leaf.hash,
    proof,
  };
}
