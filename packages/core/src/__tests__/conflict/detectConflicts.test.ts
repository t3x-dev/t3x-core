import { describe, expect, it, vi } from 'vitest';
import { detectConflicts } from '../../conflict/detectConflicts';
import type { EmbeddingProvider } from '../../providers/embedding/base';

function makeMockEmbedder(embeddings: Map<string, number[]>): EmbeddingProvider {
  return {
    id: 'mock:test',
    dim: 3,
    encode: vi.fn(async (texts: string[]) =>
      texts.map((t) => embeddings.get(t) ?? [0, 0, 0]),
    ),
    similarity: (a, b) => {
      let dot = 0, na = 0, nb = 0;
      for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
      }
      const d = Math.sqrt(na) * Math.sqrt(nb);
      return d === 0 ? 0 : dot / d;
    },
  };
}

describe('detectConflicts', () => {
  it('detects conflict: high cosine but low jaccard', async () => {
    // Two sentences that are semantically similar (high cosine) but use different words (low jaccard)
    const vecA = [1, 0, 0];
    const vecB = [0.98, 0.15, 0.05]; // cosine ~0.98 with vecA

    const embeddings = new Map<string, number[]>();
    embeddings.set('The user prefers dark themes', vecA);

    const embedder = makeMockEmbedder(embeddings);

    const result = await detectConflicts(
      [{ id: 's_new1', text: 'The user prefers dark themes' }],
      [{
        id: 's_old1',
        text: 'Light mode is the preferred display setting',
        commit_hash: 'sha256:commit1',
        embedding: vecB,
      }],
      embedder,
    );

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].new_sentence_id).toBe('s_new1');
    expect(result.conflicts[0].existing_sentence_id).toBe('s_old1');
    expect(result.conflicts[0].cosine).toBeGreaterThanOrEqual(0.80);
    expect(result.conflicts[0].jaccard).toBeLessThan(0.70);
  });

  it('does NOT flag when cosine < 0.80 (unrelated sentences)', async () => {
    const vecA = [1, 0, 0];
    const vecUnrelated = [0, 0, 1]; // cosine 0.0

    const embeddings = new Map<string, number[]>();
    embeddings.set('I like pizza', vecA);

    const embedder = makeMockEmbedder(embeddings);

    const result = await detectConflicts(
      [{ id: 's_new1', text: 'I like pizza' }],
      [{
        id: 's_old1',
        text: 'The weather is nice',
        commit_hash: 'sha256:commit1',
        embedding: vecUnrelated,
      }],
      embedder,
    );

    expect(result.conflicts).toHaveLength(0);
  });

  it('does NOT flag when both cosine high AND jaccard high (same thing, not conflicting)', async () => {
    const vec = [1, 0, 0];

    const embeddings = new Map<string, number[]>();
    embeddings.set('user prefers dark mode', vec);

    const embedder = makeMockEmbedder(embeddings);

    const result = await detectConflicts(
      [{ id: 's_new1', text: 'user prefers dark mode' }],
      [{
        id: 's_old1',
        text: 'user prefers dark mode setting',
        commit_hash: 'sha256:commit1',
        embedding: vec, // identical vector = cosine 1.0
      }],
      embedder,
    );

    // High cosine AND high jaccard = same statement, not a conflict
    expect(result.conflicts).toHaveLength(0);
  });

  it('handles multiple new sentences against multiple existing', async () => {
    const vec1 = [1, 0, 0];
    const vec2 = [0, 1, 0];
    const vec1Similar = [0.99, 0.1, 0]; // high cosine with vec1

    const embeddings = new Map<string, number[]>();
    embeddings.set('cats are the best pets', vec1);
    embeddings.set('dogs are friendly animals', vec2);

    const embedder = makeMockEmbedder(embeddings);

    const result = await detectConflicts(
      [
        { id: 's_new1', text: 'cats are the best pets' },
        { id: 's_new2', text: 'dogs are friendly animals' },
      ],
      [
        { id: 's_old1', text: 'felines make terrible companions', commit_hash: 'sha256:c1', embedding: vec1Similar },
        { id: 's_old2', text: 'something totally unrelated', commit_hash: 'sha256:c2', embedding: [0, 0, 1] },
      ],
      embedder,
    );

    // Only s_new1 vs s_old1 should conflict (high cosine, low jaccard)
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].new_sentence_id).toBe('s_new1');
    expect(result.conflicts[0].existing_sentence_id).toBe('s_old1');
    expect(result.checked_count).toBe(2);
  });

  it('returns empty when no existing sentences', async () => {
    const embedder = makeMockEmbedder(new Map([['hello', [1, 0, 0]]]));

    const result = await detectConflicts(
      [{ id: 's_new1', text: 'hello' }],
      [],
      embedder,
    );

    expect(result.conflicts).toHaveLength(0);
    expect(result.checked_count).toBe(1);
  });

  it('respects custom thresholds', async () => {
    const vec = [1, 0, 0];
    const vecSimilar = [0.95, 0.3, 0]; // cosine ~0.95

    const embeddings = new Map<string, number[]>();
    embeddings.set('the user likes coffee', vec);

    const embedder = makeMockEmbedder(embeddings);

    // With default threshold (0.80) → would be a conflict
    const result1 = await detectConflicts(
      [{ id: 's_new1', text: 'the user likes coffee' }],
      [{ id: 's_old1', text: 'tea is their preferred beverage', commit_hash: 'sha256:c1', embedding: vecSimilar }],
      embedder,
    );
    expect(result1.conflicts).toHaveLength(1);

    // With higher cosine threshold (0.98) → not a conflict
    const result2 = await detectConflicts(
      [{ id: 's_new1', text: 'the user likes coffee' }],
      [{ id: 's_old1', text: 'tea is their preferred beverage', commit_hash: 'sha256:c1', embedding: vecSimilar }],
      embedder,
      { cosineThreshold: 0.98 },
    );
    expect(result2.conflicts).toHaveLength(0);
  });
});
