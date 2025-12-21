/**
 * Embedding Providers
 *
 * Google AI Studio embedding provider + cached wrapper.
 * Adapted for @t3x/storage async operations.
 */

import {
  EmbeddingProvider,
  EmbeddingProviderError,
  cosineSimilarity,
} from '@t3x/core';
import {
  findSegmentEmbeddingsByTurns,
  bufferToFloat32Array,
  type AnyDB,
} from '@t3x/storage';

const GOOGLE_AI_EMBEDDING_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

// ============================================================================
// Google AI Embedding Provider
// ============================================================================

/**
 * Configuration options for Google AI Studio Embedding Provider
 */
export interface GoogleAIEmbeddingConfig {
  /**
   * Google AI Studio API key
   * Get one at: https://aistudio.google.com/app/apikey
   */
  apiKey: string;

  /**
   * Model to use for embeddings
   * @default "text-embedding-004"
   */
  model?: string;

  /**
   * Request timeout in milliseconds
   * @default 30000
   */
  timeout?: number;
}

/**
 * Google AI Studio Embedding Provider
 *
 * Uses the text-embedding-004 model by default (768 dimensions).
 */
export class GoogleAIEmbeddingProvider implements EmbeddingProvider {
  readonly id: string;
  readonly dim: number;

  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeout: number;

  constructor(config: GoogleAIEmbeddingConfig) {
    if (!config.apiKey) {
      throw new EmbeddingProviderError(
        'google-ai',
        undefined,
        'Google AI Studio API key is required. Set GOOGLE_AI_STUDIO_KEY environment variable.'
      );
    }

    this.apiKey = config.apiKey;
    this.model = config.model ?? 'text-embedding-004';
    this.timeout = config.timeout ?? 30000;

    this.id = `google-ai:${this.model}`;

    // Model dimensions
    // text-embedding-004: 768 dimensions
    this.dim = 768;
  }

  async encode(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    try {
      // Encode each text (could be optimized with batching)
      const embeddings = await Promise.all(texts.map((text) => this.embedSingle(text)));
      return embeddings;
    } catch (error) {
      throw new EmbeddingProviderError(
        this.id,
        error instanceof Error ? error : undefined,
        `Failed to encode texts: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  similarity(vecA: number[], vecB: number[]): number {
    return cosineSimilarity(vecA, vecB);
  }

  /**
   * Embed a single text using Google AI Studio API
   */
  private async embedSingle(text: string): Promise<number[]> {
    const url = `${GOOGLE_AI_EMBEDDING_URL}/${this.model}:embedContent?key=${this.apiKey}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: `models/${this.model}`,
          content: {
            parts: [{ text }],
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseText = await response.text();

      if (!response.ok) {
        throw new Error(`Google AI API error (${response.status}): ${responseText}`);
      }

      const data = JSON.parse(responseText) as GoogleAIEmbedResponse;

      if (!data.embedding?.values) {
        throw new Error('Invalid response: missing embedding values');
      }

      return data.embedding.values;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.timeout}ms`);
      }
      throw error;
    }
  }
}

interface GoogleAIEmbedResponse {
  embedding: {
    values: number[];
  };
}

/**
 * Factory function to create Google AI Embedding Provider
 */
export function createGoogleAIEmbeddingProvider(
  config: GoogleAIEmbeddingConfig
): EmbeddingProvider {
  return new GoogleAIEmbeddingProvider(config);
}

// ============================================================================
// Cached Embedding Provider
// ============================================================================

/**
 * Segment embedding record from database
 */
interface SegmentEmbeddingRecord {
  segmentId: string;
  turnHash: string;
  segmentText: string;
  embeddingModel: string;
  embedding: Buffer;
}

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
  async loadFromTurns(db: AnyDB, turnHashes: string[]): Promise<number> {
    if (turnHashes.length === 0) return 0;

    const embeddingsByTurn = await findSegmentEmbeddingsByTurns(db, turnHashes);
    let loaded = 0;

    for (const [, records] of embeddingsByTurn) {
      for (const record of records) {
        // Only use embeddings from matching model
        if (record.embeddingModel === this.id) {
          const embedding = bufferToFloat32Array(record.embedding);
          this.cache.set(record.segmentText, embedding);
          loaded++;
        }
      }
    }

    return loaded;
  }

  /**
   * Manually set a cache entry
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
      if (record.embeddingModel === this.id) {
        const embedding = bufferToFloat32Array(record.embedding);
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
}

/**
 * Factory function to create a cached embedding provider
 */
export function createCachedEmbeddingProvider(
  provider: EmbeddingProvider
): CachedEmbeddingProvider {
  return new CachedEmbeddingProvider({ provider });
}

// Re-export for convenience
export { EmbeddingProviderError, cosineSimilarity };
