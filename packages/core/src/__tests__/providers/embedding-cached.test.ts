/**
 * Cached Embedding Provider Tests
 *
 * Tests cache hit/miss logic, setCacheFromRecords, buffer conversion.
 */

import { describe, expect, it, vi } from 'vitest';
import type { EmbeddingProvider } from '../../providers/embedding/base';
import {
  CachedEmbeddingProvider,
  createCachedEmbeddingProvider,
} from '../../providers/embedding/cached';

// Mock underlying provider
function createMockProvider(dim = 4): EmbeddingProvider & { encode: ReturnType<typeof vi.fn> } {
  return {
    id: 'mock-provider',
    dim,
    encode: vi.fn(async (texts: string[]) =>
      texts.map(() => Array.from({ length: dim }, () => Math.random()))
    ),
    similarity: vi.fn(() => 0.9),
  };
}

describe('CachedEmbeddingProvider', () => {
  // =========================================================================
  // Constructor and identity
  // =========================================================================
  describe('constructor', () => {
    it('inherits id and dim from underlying provider', () => {
      const mock = createMockProvider(256);
      const cached = new CachedEmbeddingProvider({ provider: mock });
      expect(cached.id).toBe('mock-provider');
      expect(cached.dim).toBe(256);
    });

    it('accepts pre-populated cache', () => {
      const mock = createMockProvider();
      const cache = new Map([['hello', [1, 2, 3, 4]]]);
      const cached = new CachedEmbeddingProvider({ provider: mock, cache });
      expect(cached.hasCache('hello')).toBe(true);
    });
  });

  // =========================================================================
  // Cache CRUD
  // =========================================================================
  describe('cache operations', () => {
    it('setCache and getCache work', () => {
      const cached = new CachedEmbeddingProvider({ provider: createMockProvider() });
      cached.setCache('test', [1, 2, 3, 4]);
      expect(cached.getCache('test')).toEqual([1, 2, 3, 4]);
    });

    it('hasCache returns false for uncached text', () => {
      const cached = new CachedEmbeddingProvider({ provider: createMockProvider() });
      expect(cached.hasCache('unknown')).toBe(false);
    });

    it('clearCache removes all entries', () => {
      const cached = new CachedEmbeddingProvider({ provider: createMockProvider() });
      cached.setCache('a', [1]);
      cached.setCache('b', [2]);
      cached.clearCache();
      expect(cached.getCacheStats().size).toBe(0);
    });

    it('getCacheStats returns size and modelId', () => {
      const cached = new CachedEmbeddingProvider({ provider: createMockProvider() });
      cached.setCache('x', [1]);
      const stats = cached.getCacheStats();
      expect(stats.size).toBe(1);
      expect(stats.modelId).toBe('mock-provider');
    });
  });

  // =========================================================================
  // checkCacheStatus
  // =========================================================================
  describe('checkCacheStatus', () => {
    it('reports hits and misses', () => {
      const cached = new CachedEmbeddingProvider({ provider: createMockProvider() });
      cached.setCache('cached', [1, 2, 3, 4]);

      const status = cached.checkCacheStatus(['cached', 'not-cached', 'also-not']);
      expect(status.hits).toBe(1);
      expect(status.misses).toBe(2);
      expect(status.missedTexts).toEqual(['not-cached', 'also-not']);
    });

    it('reports all hits when fully cached', () => {
      const cached = new CachedEmbeddingProvider({ provider: createMockProvider() });
      cached.setCache('a', [1]);
      cached.setCache('b', [2]);

      const status = cached.checkCacheStatus(['a', 'b']);
      expect(status.hits).toBe(2);
      expect(status.misses).toBe(0);
    });
  });

  // =========================================================================
  // encode - cache behavior
  // =========================================================================
  describe('encode', () => {
    it('returns empty for empty input', async () => {
      const cached = new CachedEmbeddingProvider({ provider: createMockProvider() });
      const result = await cached.encode([]);
      expect(result).toEqual([]);
    });

    it('returns cached embeddings without calling provider', async () => {
      const mock = createMockProvider();
      const cached = new CachedEmbeddingProvider({ provider: mock });
      cached.setCache('hello', [1, 2, 3, 4]);

      const result = await cached.encode(['hello']);
      expect(result).toEqual([[1, 2, 3, 4]]);
      expect(mock.encode).not.toHaveBeenCalled();
    });

    it('calls provider for cache misses only', async () => {
      const mock = createMockProvider();
      const cached = new CachedEmbeddingProvider({ provider: mock });
      cached.setCache('cached', [1, 2, 3, 4]);

      const result = await cached.encode(['cached', 'uncached']);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual([1, 2, 3, 4]); // From cache
      expect(mock.encode).toHaveBeenCalledWith(['uncached']); // Only miss
    });

    it('populates cache after fetching misses', async () => {
      const mock = createMockProvider();
      mock.encode.mockResolvedValueOnce([[5, 6, 7, 8]]);

      const cached = new CachedEmbeddingProvider({ provider: mock });
      await cached.encode(['new-text']);

      expect(cached.hasCache('new-text')).toBe(true);
      expect(cached.getCache('new-text')).toEqual([5, 6, 7, 8]);
    });

    it('calls provider for all texts when cache is empty', async () => {
      const mock = createMockProvider();
      const cached = new CachedEmbeddingProvider({ provider: mock });

      await cached.encode(['a', 'b', 'c']);
      expect(mock.encode).toHaveBeenCalledWith(['a', 'b', 'c']);
    });

    it('preserves order when mixing cached and uncached', async () => {
      const mock = createMockProvider();
      mock.encode.mockResolvedValueOnce([
        [10, 20, 30, 40],
        [50, 60, 70, 80],
      ]);

      const cached = new CachedEmbeddingProvider({ provider: mock });
      cached.setCache('b', [5, 6, 7, 8]);

      const result = await cached.encode(['a', 'b', 'c']);
      expect(result[0]).toEqual([10, 20, 30, 40]); // 'a' from provider (first miss)
      expect(result[1]).toEqual([5, 6, 7, 8]); // 'b' from cache
      expect(result[2]).toEqual([50, 60, 70, 80]); // 'c' from provider (second miss)
    });
  });

  // =========================================================================
  // setCacheFromRecords
  // =========================================================================
  describe('setCacheFromRecords', () => {
    it('loads records matching provider model', () => {
      const cached = new CachedEmbeddingProvider({ provider: createMockProvider() });

      const loaded = cached.setCacheFromRecords([
        { segmentText: 'text1', embeddingModel: 'mock-provider', embedding: [1, 2, 3, 4] },
        { segmentText: 'text2', embeddingModel: 'other-model', embedding: [5, 6, 7, 8] },
        { segmentText: 'text3', embeddingModel: 'mock-provider', embedding: [9, 10, 11, 12] },
      ]);

      expect(loaded).toBe(2);
      expect(cached.hasCache('text1')).toBe(true);
      expect(cached.hasCache('text2')).toBe(false); // Different model
      expect(cached.hasCache('text3')).toBe(true);
    });

    it('converts ArrayBuffer to number array', () => {
      const cached = new CachedEmbeddingProvider({ provider: createMockProvider() });

      // Create Float32Array buffer
      const floats = new Float32Array([1.0, 2.0, 3.0, 4.0]);
      const buffer = floats.buffer;

      const loaded = cached.setCacheFromRecords([
        { segmentText: 'buf-test', embeddingModel: 'mock-provider', embedding: buffer },
      ]);

      expect(loaded).toBe(1);
      const result = cached.getCache('buf-test')!;
      expect(result).toHaveLength(4);
      expect(result[0]).toBeCloseTo(1.0);
      expect(result[3]).toBeCloseTo(4.0);
    });

    it('converts Node.js Buffer to number array', () => {
      const cached = new CachedEmbeddingProvider({ provider: createMockProvider() });

      // Create Node.js Buffer from Float32Array
      const floats = new Float32Array([0.5, 1.5, 2.5, 3.5]);
      const buf = Buffer.from(floats.buffer);

      const loaded = cached.setCacheFromRecords([
        { segmentText: 'node-buf', embeddingModel: 'mock-provider', embedding: buf },
      ]);

      expect(loaded).toBe(1);
      const result = cached.getCache('node-buf')!;
      expect(result[0]).toBeCloseTo(0.5);
      expect(result[3]).toBeCloseTo(3.5);
    });

    it('returns 0 for empty records', () => {
      const cached = new CachedEmbeddingProvider({ provider: createMockProvider() });
      expect(cached.setCacheFromRecords([])).toBe(0);
    });
  });

  // =========================================================================
  // similarity
  // =========================================================================
  describe('similarity', () => {
    it('delegates to cosineSimilarity', () => {
      const cached = new CachedEmbeddingProvider({ provider: createMockProvider() });
      const result = cached.similarity([1, 0], [1, 0]);
      expect(result).toBeCloseTo(1, 5);
    });
  });

  // =========================================================================
  // Factory
  // =========================================================================
  describe('createCachedEmbeddingProvider', () => {
    it('creates instance with empty cache', () => {
      const mock = createMockProvider();
      const cached = createCachedEmbeddingProvider(mock);
      expect(cached).toBeInstanceOf(CachedEmbeddingProvider);
      expect(cached.getCacheStats().size).toBe(0);
    });
  });
});
