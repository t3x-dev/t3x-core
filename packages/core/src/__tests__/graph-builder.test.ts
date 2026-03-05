import { describe, expect, it } from 'vitest';
import { buildKnowledgeGraph } from '../knowledge/graphBuilder';

// Helper: 10-dim unit vector pointing at index idx
const unitVec = (idx: number, dim = 10): number[] => {
  const v = new Array(dim).fill(0);
  v[idx] = 1;
  return v;
};

// Helper: similar vector (high cosine with unitVec at idx)
const similarVec = (idx: number, dim = 10): number[] => {
  const v = new Array(dim).fill(0);
  v[idx] = 0.9;
  v[(idx + 1) % dim] = 0.1;
  return v;
};

describe('buildKnowledgeGraph', () => {
  it('creates nodes from sentence clusters', () => {
    const result = buildKnowledgeGraph({
      sentences: [
        { id: 's1', text: 'pricing strategy', embedding: unitVec(0), commit_hash: 'h1' },
        { id: 's2', text: 'pricing plans', embedding: similarVec(0), commit_hash: 'h1' },
        { id: 's3', text: 'product roadmap', embedding: unitVec(5), commit_hash: 'h2' },
      ],
      relations: [],
      conflicts: [],
    });

    expect(result.nodes.length).toBe(2);
    expect(result.stats.total_sentences).toBe(3);
    expect(result.stats.nodes_created).toBe(2);
  });

  it('creates edges from Ring 4 relations between different clusters', () => {
    const result = buildKnowledgeGraph({
      sentences: [
        { id: 's1', text: 'alpha topic', embedding: unitVec(0), commit_hash: 'h1' },
        { id: 's2', text: 'beta topic', embedding: unitVec(5), commit_hash: 'h1' },
      ],
      relations: [{ source_id: 's1', target_id: 's2', type: 'supports', confidence: 0.9 }],
      conflicts: [],
    });

    expect(result.edges.length).toBe(1);
    expect(result.edges[0].type).toBe('supports');
    expect(result.edges[0].weight).toBe(0.9);
    expect(result.edges[0].evidence.length).toBe(1);
    expect(result.edges[0].evidence[0].source_sentence_id).toBe('s1');
    expect(result.edges[0].evidence[0].target_sentence_id).toBe('s2');
  });

  it('skips edges when both sentences are in the same cluster', () => {
    const result = buildKnowledgeGraph({
      sentences: [
        { id: 's1', text: 'pricing alpha', embedding: unitVec(0), commit_hash: 'h1' },
        { id: 's2', text: 'pricing beta', embedding: similarVec(0), commit_hash: 'h1' },
      ],
      relations: [{ source_id: 's1', target_id: 's2', type: 'elaborates', confidence: 0.8 }],
      conflicts: [],
    });

    // s1 and s2 should cluster together, so no inter-cluster edge
    expect(result.edges.length).toBe(0);
  });

  it('creates contradicts edges from knowledge conflicts', () => {
    const result = buildKnowledgeGraph({
      sentences: [
        { id: 's1', text: 'price is low', embedding: unitVec(0), commit_hash: 'h1' },
        { id: 's2', text: 'quality is high', embedding: unitVec(5), commit_hash: 'h2' },
      ],
      relations: [],
      conflicts: [{ new_sentence_id: 's1', existing_sentence_id: 's2', cosine: 0.85 }],
    });

    expect(result.edges.length).toBe(1);
    expect(result.edges[0].type).toBe('contradicts');
    expect(result.edges[0].weight).toBe(0.85);
  });

  it('aggregates duplicate edges (max weight, combined evidence)', () => {
    const result = buildKnowledgeGraph({
      sentences: [
        { id: 's1', text: 'alpha one', embedding: unitVec(0), commit_hash: 'h1' },
        { id: 's2', text: 'alpha two', embedding: similarVec(0), commit_hash: 'h1' },
        { id: 's3', text: 'beta one', embedding: unitVec(5), commit_hash: 'h1' },
        { id: 's4', text: 'beta two', embedding: similarVec(5), commit_hash: 'h1' },
      ],
      relations: [
        { source_id: 's1', target_id: 's3', type: 'supports', confidence: 0.7 },
        { source_id: 's2', target_id: 's4', type: 'supports', confidence: 0.9 },
      ],
      conflicts: [],
    });

    // Two relations between same cluster pair should merge
    expect(result.edges.length).toBe(1);
    expect(result.edges[0].weight).toBe(0.9); // max
    expect(result.edges[0].evidence.length).toBe(2);
  });

  it('returns correct stats', () => {
    const result = buildKnowledgeGraph({
      sentences: [
        { id: 's1', text: 'alpha', embedding: unitVec(0), commit_hash: 'h1' },
        { id: 's2', text: 'beta', embedding: unitVec(5), commit_hash: 'h1' },
      ],
      relations: [{ source_id: 's1', target_id: 's2', type: 'causes', confidence: 0.8 }],
      conflicts: [],
    });

    expect(result.stats.total_sentences).toBe(2);
    expect(result.stats.nodes_created).toBe(2);
    expect(result.stats.edges_created).toBe(1);
    expect(result.stats.build_time_ms).toBeTypeOf('number');
    expect(result.stats.build_time_ms).toBeGreaterThanOrEqual(0);
  });

  it('handles empty input', () => {
    const result = buildKnowledgeGraph({
      sentences: [],
      relations: [],
      conflicts: [],
    });

    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(result.stats.total_sentences).toBe(0);
  });

  it('handles sentences with no relations or conflicts', () => {
    const result = buildKnowledgeGraph({
      sentences: [
        { id: 's1', text: 'standalone', embedding: unitVec(0), commit_hash: 'h1' },
        { id: 's2', text: 'isolated', embedding: unitVec(3), commit_hash: 'h1' },
      ],
      relations: [],
      conflicts: [],
    });

    expect(result.nodes.length).toBe(2);
    expect(result.edges.length).toBe(0);
  });

  it('skips relations where sentences are not in any cluster', () => {
    const result = buildKnowledgeGraph({
      sentences: [{ id: 's1', text: 'alpha', embedding: unitVec(0), commit_hash: 'h1' }],
      relations: [
        // s999 doesn't exist in sentences
        { source_id: 's1', target_id: 's999', type: 'supports', confidence: 0.9 },
      ],
      conflicts: [],
    });

    expect(result.edges.length).toBe(0);
  });
});
