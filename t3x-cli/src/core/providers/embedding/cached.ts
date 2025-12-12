/**
 * Cached Embedding Provider
 *
 * Wraps an embedding provider to use pre-computed embeddings from database.
 * Falls back to the underlying provider for cache misses.
 */

import {
  EmbeddingProvider,
  cosineSimilarity,
} from "@t3x/core";
import {
  getSegmentEmbeddingsByTurns,
  bufferToFloat32Array,
  SegmentEmbeddingRecord,
} from "../../storage";

/**
 * Configuration for cached embedding provider
 */
export interface CachedEmbeddingConfig {
  /** The underlying embedding provider for cache misses */
  provider: EmbeddingProvider;
  /** Pre-loaded embeddings keyed by segment text */
  cache?: Map<string, number[]>;
}

/**
 * Cached Embedding Provider
 *
 * Uses pre-computed embeddings when available, falls back to API calls.
 */
export class CachedEmbeddingProvider implements EmbeddingProvider {
  readonly id: string;
  readonly dim: number;

  private readonly provider: EmbeddingProvider;
  private readonly cache: Map<string, number[]>;

  constructor(config: CachedEmbeddingConfig) {
    this.provider = config.provider;
    this.id = config.provider.id;
    this.dim = config.provider.dim;
    this.cache = config.cache ?? new Map();
  }

  /**
   * Load embeddings from database for given turn hashes
   * Returns the number of embeddings loaded
   */
  loadFromTurns(turnHashes: string[]): number {
    if (turnHashes.length === 0) return 0;

    const embeddingsByTurn = getSegmentEmbeddingsByTurns(turnHashes);
    let loaded = 0;

    for (const [_turnHash, records] of embeddingsByTurn) {
      for (const record of records) {
        // Only use embeddings from matching model
        if (record.embedding_model === this.id) {
          const embedding = bufferToFloat32Array(record.embedding);
          this.cache.set(record.segment_text, embedding);
          loaded++;
        }
      }
    }

    return loaded;
  }

  /**
   * Manually set a cache entry
   * Used by routes that load embeddings directly from database
   */
  setCache(text: string, embedding: number[]): void {
    this.cache.set(text, embedding);
  }

  /**
   * Batch set cache entries with model validation
   * Only loads embeddings that match this provider's model
   * Returns the number of entries loaded
   */
  setCacheFromRecords(records: SegmentEmbeddingRecord[]): number {
    let loaded = 0;
    for (const record of records) {
      // Only use embeddings from matching model
      if (record.embedding_model === this.id) {
        const embedding = bufferToFloat32Array(record.embedding);
        this.cache.set(record.segment_text, embedding);
        loaded++;
      }
    }
    return loaded;
  }

  /**
   * @deprecated Use setCacheFromRecords() instead
   */
  loadFromRecords(records: SegmentEmbeddingRecord[]): number {
    return this.setCacheFromRecords(records);
  }

  /**
   * Check how many texts would hit cache vs miss
   */
  checkCacheStatus(texts: string[]): { hits: number; misses: number; missedTexts: string[] } {
    let hits = 0;
    const missedTexts: string[] = [];

    for (const text of texts) {
      if (this.cache.has(text)) {
        hits++;
      } else {
        missedTexts.push(text);
      }
    }

    return { hits, misses: missedTexts.length, missedTexts };
  }

  /**
   * Encode texts to embeddings
   * Uses cache when available, falls back to API for misses
   */
  async encode(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    // Check cache first
    const results: (number[] | null)[] = texts.map((text) =>
      this.cache.get(text) ?? null
    );

    // Find cache misses
    const missIndices: number[] = [];
    const missTexts: string[] = [];
    for (let i = 0; i < results.length; i++) {
      if (results[i] === null) {
        missIndices.push(i);
        missTexts.push(texts[i]);
      }
    }

    // Fetch missing embeddings from provider
    if (missTexts.length > 0) {
      const missEmbeddings = await this.provider.encode(missTexts);

      // Fill in results and update cache
      for (let i = 0; i < missIndices.length; i++) {
        const idx = missIndices[i];
        const text = missTexts[i];
        const embedding = missEmbeddings[i];

        results[idx] = embedding;
        this.cache.set(text, embedding);
      }
    }

    return results as number[][];
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  similarity(vecA: number[], vecB: number[]): number {
    return cosineSimilarity(vecA, vecB);
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; modelId: string } {
    return {
      size: this.cache.size,
      modelId: this.id,
    };
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

/**
 * Factory function to create a cached embedding provider
 */
export function createCachedEmbeddingProvider(
  provider: EmbeddingProvider,
  turnHashes?: string[]
): CachedEmbeddingProvider {
  const cached = new CachedEmbeddingProvider({ provider });
  if (turnHashes && turnHashes.length > 0) {
    cached.loadFromTurns(turnHashes);
  }
  return cached;
}
