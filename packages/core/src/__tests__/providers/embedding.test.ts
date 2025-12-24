/**
 * Embedding Provider Tests
 *
 * Tests for embedding provider base utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  cosineSimilarity,
  EmbeddingProviderError,
} from '../../providers/embedding/base';

describe('Embedding Provider', () => {
  describe('cosineSimilarity', () => {
    it('returns 1 for identical vectors', () => {
      const vec = [1, 2, 3, 4, 5];
      expect(cosineSimilarity(vec, vec)).toBeCloseTo(1, 5);
    });

    it('returns 0 for orthogonal vectors', () => {
      const vecA = [1, 0, 0];
      const vecB = [0, 1, 0];
      expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(0, 5);
    });

    it('returns -1 for opposite vectors', () => {
      const vecA = [1, 2, 3];
      const vecB = [-1, -2, -3];
      expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(-1, 5);
    });

    it('handles normalized vectors correctly', () => {
      const vecA = [0.6, 0.8]; // Already normalized (0.6^2 + 0.8^2 = 1)
      const vecB = [0.8, 0.6];
      const expected = 0.6 * 0.8 + 0.8 * 0.6; // 0.96
      expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(expected, 5);
    });

    it('handles vectors with different magnitudes', () => {
      const vecA = [1, 0];
      const vecB = [100, 0]; // Same direction, different magnitude
      expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(1, 5);
    });

    it('returns 0 for zero vectors', () => {
      const vecA = [0, 0, 0];
      const vecB = [1, 2, 3];
      expect(cosineSimilarity(vecA, vecB)).toBe(0);
    });

    it('throws for mismatched dimensions', () => {
      const vecA = [1, 2, 3];
      const vecB = [1, 2];
      expect(() => cosineSimilarity(vecA, vecB)).toThrow('Vector dimensions mismatch');
    });

    it('handles high-dimensional vectors', () => {
      const dim = 768; // Typical embedding dimension
      const vecA = Array.from({ length: dim }, () => Math.random());
      const vecB = Array.from({ length: dim }, () => Math.random());

      const result = cosineSimilarity(vecA, vecB);
      expect(result).toBeGreaterThanOrEqual(-1);
      expect(result).toBeLessThanOrEqual(1);
    });

    it('is symmetric', () => {
      const vecA = [1, 2, 3, 4];
      const vecB = [5, 6, 7, 8];
      expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(cosineSimilarity(vecB, vecA), 10);
    });
  });

  describe('EmbeddingProviderError', () => {
    it('creates error with provider ID', () => {
      const error = new EmbeddingProviderError('google-ai:text-embedding-004');

      expect(error.name).toBe('EmbeddingProviderError');
      expect(error.providerId).toBe('google-ai:text-embedding-004');
      expect(error.message).toContain('google-ai:text-embedding-004');
      expect(error.message).toContain('unavailable');
    });

    it('creates error with custom message', () => {
      const error = new EmbeddingProviderError(
        'openai:ada-002',
        undefined,
        'API rate limit exceeded'
      );

      expect(error.message).toBe('API rate limit exceeded');
      expect(error.providerId).toBe('openai:ada-002');
    });

    it('captures cause error', () => {
      const cause = new Error('Network timeout');
      const error = new EmbeddingProviderError('test-provider', cause);

      expect(error.cause).toBe(cause);
    });

    it('is instanceof Error', () => {
      const error = new EmbeddingProviderError('test');
      expect(error).toBeInstanceOf(Error);
    });
  });
});
