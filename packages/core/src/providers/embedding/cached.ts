/**
 * Cached Embedding Provider
 *
 * Wraps any EmbeddingProvider with an in-memory cache.
 * Cache can be pre-populated with embeddings from database.
 */

import { cosineSimilarity, type EmbeddingProvider } from './base';

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
   * Manually set a cache entry
   */
  setCache(text: string, embedding: number[]): void {
    this.cache.set(text, embedding);
  }

  /**
   * Get a cached embedding (or undefined if not cached)
   */
  getCache(text: string): number[] | undefined {
    return this.cache.get(text);
  }

  /**
   * Check if a text is in the cache
   */
  hasCache(text: string): boolean {
    return this.cache.has(text);
  }

  /**
   * Batch set cache entries from records
   *
   * @param records - Array of records with segmentText, embeddingModel, and embedding
   * @returns Number of entries loaded (only entries matching this provider's model are loaded)
   */
  setCacheFromRecords(
    records: Array<{
      segmentText: string;
      embeddingModel: string;
      embedding: ArrayBuffer | Buffer | number[];
    }>
  ): number {
    let loaded = 0;
    for (const record of records) {
      // Only use embeddings from matching model
      if (record.embeddingModel === this.id) {
        const embedding = Array.isArray(record.embedding)
          ? record.embedding
          : this.bufferToFloat32Array(record.embedding);
        this.cache.set(record.segmentText, embedding);
        loaded++;
      }
    }
    return loaded;
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
    const results: (number[] | null)[] = texts.map((text) => this.cache.get(text) ?? null);

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

  /**
   * Convert Buffer/ArrayBuffer to number array
   */
  private bufferToFloat32Array(buffer: ArrayBuffer | Buffer): number[] {
    // Handle Node.js Buffer (has buffer property pointing to ArrayBuffer)
    const arrayBuffer =
      'buffer' in buffer && buffer.buffer instanceof ArrayBuffer
        ? buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
        : buffer;
    const float32Array = new Float32Array(arrayBuffer);
    return Array.from(float32Array);
  }
}

/**
 * Factory function to create a cached embedding provider
 */
export function createCachedEmbeddingProvider(
  provider: EmbeddingProvider
): CachedEmbeddingProvider {
  return new CachedEmbeddingProvider({ provider });
}
