/**
 * Stub Embedding Providers for testing.
 *
 * Deterministic — no external calls.
 */

import type { EmbeddingProvider } from '../../providers/embedding';

/**
 * Length-based similarity. Simple and deterministic.
 */
export class StubEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'stub-embedding';
  readonly dim = 1;

  async encode(texts: string[]): Promise<number[][]> {
    return texts.map((text) => [text.length]);
  }

  similarity(vecA: number[], vecB: number[]): number {
    const a = vecA[0];
    const b = vecB[0];
    if (a === 0 || b === 0) return 0;
    return 1.0 - Math.abs(a - b) / Math.max(a, b);
  }
}

/**
 * Word-overlap (Jaccard) similarity. More realistic for semantic testing.
 */
export class WordOverlapEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'word-overlap';
  readonly dim = 100;

  private wordCache = new Map<string, Set<string>>();

  private getWords(text: string): Set<string> {
    const cached = this.wordCache.get(text);
    if (cached) return cached;
    const words = new Set(
      text
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 0)
    );
    this.wordCache.set(text, words);
    return words;
  }

  async encode(texts: string[]): Promise<number[][]> {
    return texts.map((_, i) => [i]);
  }

  similarity(_vecA: number[], _vecB: number[]): number {
    return 0.5;
  }

  textSimilarity(textA: string, textB: string): number {
    const wordsA = this.getWords(textA);
    const wordsB = this.getWords(textB);
    if (wordsA.size === 0 && wordsB.size === 0) return 1.0;
    if (wordsA.size === 0 || wordsB.size === 0) return 0.0;
    const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
    const union = new Set([...wordsA, ...wordsB]);
    return intersection.size / union.size;
  }
}

/**
 * Exact-match similarity. Returns 1.0 for identical texts, 0.0 otherwise.
 */
export class ExactMatchEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'exact-match';
  readonly dim = 256;

  private textToVec = new Map<string, number[]>();
  private vecCounter = 0;

  async encode(texts: string[]): Promise<number[][]> {
    return texts.map((text) => {
      const normalized = text.toLowerCase().trim();
      let vec = this.textToVec.get(normalized);
      if (!vec) {
        vec = Array(this.dim).fill(0);
        vec[this.vecCounter % this.dim] = 1;
        this.vecCounter++;
        this.textToVec.set(normalized, vec);
      }
      return vec;
    });
  }

  similarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) return 0;
    for (let i = 0; i < vecA.length; i++) {
      if (vecA[i] !== vecB[i]) return 0;
    }
    return 1.0;
  }
}
