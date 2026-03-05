import { describe, expect, it } from 'vitest';
import { clusterSentences, cosineSimilarity, extractTopTerms } from '../knowledge/cluster';

// Helper to create unit vectors
const unitVec = (dim: number, index: number): number[] => {
  const v = new Array(dim).fill(0);
  v[index] = 1;
  return v;
};

// Helper to create a vector with values at specific indices
const makeVec = (values: Record<number, number>, dim = 10): number[] => {
  const v = new Array(dim).fill(0);
  for (const [i, val] of Object.entries(values)) {
    v[Number(i)] = val;
  }
  return v;
};

describe('cosineSimilarity', () => {
  it('returns 1.0 for identical vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1.0);
  });

  it('returns 0.0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0.0);
  });

  it('returns value between 0 and 1 for similar vectors', () => {
    const sim = cosineSimilarity([1, 1, 0], [1, 0, 0]);
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });

  it('handles zero vectors gracefully', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 0, 0])).toBe(0);
  });

  it('is symmetric', () => {
    const a = [1, 2, 3];
    const b = [4, 5, 6];
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a));
  });
});

describe('extractTopTerms', () => {
  it('returns top 3 terms by frequency', () => {
    const texts = ['pricing strategy overview', 'pricing plans details', 'strategy for pricing'];
    const result = extractTopTerms(texts);
    expect(result).toContain('pricing');
    expect(result.split(' / ').length).toBeLessThanOrEqual(3);
  });

  it('filters common stop words', () => {
    const result = extractTopTerms(['the is a for with']);
    expect(result).toBe('unnamed');
  });

  it('returns unnamed for empty input', () => {
    expect(extractTopTerms([])).toBe('unnamed');
  });

  it('respects custom N parameter', () => {
    const texts = ['alpha beta gamma delta'];
    const result = extractTopTerms(texts, 2);
    expect(result.split(' / ').length).toBeLessThanOrEqual(2);
  });
});

describe('clusterSentences', () => {
  it('groups similar sentences into same cluster', () => {
    // Two similar vectors (cosine > 0.75) and one different
    const sentences = [
      {
        id: 's_1',
        text: 'pricing strategy',
        embedding: makeVec({ 0: 0.9, 1: 0.1 }),
        commit_hash: 'h1',
      },
      {
        id: 's_2',
        text: 'pricing plans',
        embedding: makeVec({ 0: 0.8, 1: 0.2 }),
        commit_hash: 'h1',
      },
      {
        id: 's_3',
        text: 'product roadmap',
        embedding: makeVec({ 5: 1.0 }),
        commit_hash: 'h2',
      },
    ];
    const clusters = clusterSentences(sentences);
    expect(clusters.length).toBe(2);
    // First two should be together
    const pricingCluster = clusters.find((c) => c.members.some((m) => m.sentence_id === 's_1'));
    expect(pricingCluster?.members.length).toBe(2);
    expect(pricingCluster?.members.map((m) => m.sentence_id)).toContain('s_2');
  });

  it('separates dissimilar sentences into different clusters', () => {
    const sentences = [
      {
        id: 's_1',
        text: 'topic one',
        embedding: unitVec(5, 0),
        commit_hash: 'h1',
      },
      {
        id: 's_2',
        text: 'topic two',
        embedding: unitVec(5, 1),
        commit_hash: 'h1',
      },
      {
        id: 's_3',
        text: 'topic three',
        embedding: unitVec(5, 2),
        commit_hash: 'h1',
      },
    ];
    const clusters = clusterSentences(sentences);
    expect(clusters.length).toBe(3);
  });

  it('returns empty array for empty input', () => {
    expect(clusterSentences([])).toEqual([]);
  });

  it('handles single sentence', () => {
    const clusters = clusterSentences([
      {
        id: 's_1',
        text: 'hello world',
        embedding: [1, 0],
        commit_hash: 'h1',
      },
    ]);
    expect(clusters.length).toBe(1);
    expect(clusters[0].members.length).toBe(1);
  });

  it('respects custom similarity threshold', () => {
    // These vectors have cosine ~0.98 - with high threshold they still cluster
    const sentences = [
      {
        id: 's_1',
        text: 'alpha',
        embedding: makeVec({ 0: 1.0, 1: 0.1 }),
        commit_hash: 'h1',
      },
      {
        id: 's_2',
        text: 'beta',
        embedding: makeVec({ 0: 1.0, 1: 0.15 }),
        commit_hash: 'h1',
      },
    ];
    // With very high threshold (0.999), they should be separate
    const separate = clusterSentences(sentences, {
      similarity_threshold: 0.999,
    });
    expect(separate.length).toBe(2);

    // With normal threshold, they should cluster
    const together = clusterSentences(sentences, {
      similarity_threshold: 0.75,
    });
    expect(together.length).toBe(1);
  });

  it('labels clusters with top terms from member texts', () => {
    const sentences = [
      {
        id: 's_1',
        text: 'enterprise pricing strategy',
        embedding: makeVec({ 0: 0.9, 1: 0.1 }),
        commit_hash: 'h1',
      },
      {
        id: 's_2',
        text: 'pricing plans overview',
        embedding: makeVec({ 0: 0.8, 1: 0.2 }),
        commit_hash: 'h1',
      },
    ];
    const clusters = clusterSentences(sentences);
    expect(clusters[0].label).toContain('pricing');
  });

  it('includes correct member sentence IDs and commit hashes', () => {
    const sentences = [
      {
        id: 's_abc',
        text: 'test',
        embedding: [1, 0],
        commit_hash: 'sha256:commit1',
      },
    ];
    const clusters = clusterSentences(sentences);
    expect(clusters[0].members[0]).toEqual({
      sentence_id: 's_abc',
      commit_hash: 'sha256:commit1',
    });
  });

  it('computes centroid as average of member embeddings', () => {
    const sentences = [
      { id: 's_1', text: 'a', embedding: [1, 0, 0], commit_hash: 'h1' },
      { id: 's_2', text: 'b', embedding: [0, 1, 0], commit_hash: 'h1' },
    ];
    // Force them into one cluster with very low threshold
    const clusters = clusterSentences(sentences, {
      similarity_threshold: 0,
    });
    expect(clusters.length).toBe(1);
    expect(clusters[0].centroid[0]).toBeCloseTo(0.5);
    expect(clusters[0].centroid[1]).toBeCloseTo(0.5);
    expect(clusters[0].centroid[2]).toBeCloseTo(0);
  });
});
