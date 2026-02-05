/**
 * Google AI Embedding Provider Tests
 *
 * Tests with mocked fetch to verify batch splitting, error handling, timeout.
 */

import { describe, expect, it, vi } from 'vitest';
import { EmbeddingProviderError } from '../../providers/embedding/base';
import {
  createGoogleAIEmbeddingProvider,
  GoogleAIEmbeddingProvider,
} from '../../providers/embedding/google-ai';

// Helper: create a mock embedding vector
const mockVector = (dim = 768) => Array.from({ length: dim }, (_, i) => i * 0.001);

// Helper: create a mock fetch that returns embeddings
function mockFetch(embeddings: number[][], status = 200) {
  return vi.fn(() =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      text: () =>
        Promise.resolve(JSON.stringify({ embeddings: embeddings.map((v) => ({ values: v })) })),
    })
  ) as unknown as typeof fetch;
}

// Helper: create a failing fetch
function failingFetch(errorText: string, status = 500) {
  return vi.fn(() =>
    Promise.resolve({
      ok: false,
      status,
      statusText: 'Error',
      text: () => Promise.resolve(errorText),
    })
  ) as unknown as typeof fetch;
}

describe('GoogleAIEmbeddingProvider', () => {
  // =========================================================================
  // Constructor
  // =========================================================================
  describe('constructor', () => {
    it('throws without API key', () => {
      expect(() => new GoogleAIEmbeddingProvider({ apiKey: '' })).toThrow(EmbeddingProviderError);
    });

    it('sets default model and dimensions', () => {
      const provider = new GoogleAIEmbeddingProvider({
        apiKey: 'test-key',
        fetch: mockFetch([]),
      });
      expect(provider.id).toBe('google-ai:gemini-embedding-001');
      expect(provider.dim).toBe(768);
    });

    it('accepts custom model and dimensions', () => {
      const provider = new GoogleAIEmbeddingProvider({
        apiKey: 'test-key',
        model: 'custom-model',
        outputDimensionality: 256,
        fetch: mockFetch([]),
      });
      expect(provider.id).toBe('google-ai:custom-model');
      expect(provider.dim).toBe(256);
    });
  });

  // =========================================================================
  // encode
  // =========================================================================
  describe('encode', () => {
    it('returns empty array for empty input', async () => {
      const provider = new GoogleAIEmbeddingProvider({
        apiKey: 'test-key',
        fetch: mockFetch([]),
      });
      const result = await provider.encode([]);
      expect(result).toEqual([]);
    });

    it('encodes single text', async () => {
      const vec = mockVector();
      const fn = mockFetch([vec]);
      const provider = new GoogleAIEmbeddingProvider({ apiKey: 'key', fetch: fn });

      const result = await provider.encode(['Hello']);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(vec);
    });

    it('encodes multiple texts in a single batch', async () => {
      const vecs = [mockVector(), mockVector()];
      const fn = mockFetch(vecs);
      const provider = new GoogleAIEmbeddingProvider({ apiKey: 'key', fetch: fn });

      const result = await provider.encode(['Hello', 'World']);
      expect(result).toHaveLength(2);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('splits large batches (>100) into chunks', async () => {
      const batchSize = 150;
      // First call: 100 embeddings, second call: 50 embeddings
      const chunk1 = Array.from({ length: 100 }, () => mockVector(4));
      const chunk2 = Array.from({ length: 50 }, () => mockVector(4));

      const fn = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(JSON.stringify({ embeddings: chunk1.map((v) => ({ values: v })) })),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(JSON.stringify({ embeddings: chunk2.map((v) => ({ values: v })) })),
        }) as unknown as typeof fetch;

      const provider = new GoogleAIEmbeddingProvider({
        apiKey: 'key',
        outputDimensionality: 4,
        fetch: fn,
      });

      const texts = Array.from({ length: batchSize }, (_, i) => `Text ${i}`);
      const result = await provider.encode(texts);

      expect(result).toHaveLength(150);
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('sends correct request body', async () => {
      const fn = mockFetch([mockVector(4)]);
      const provider = new GoogleAIEmbeddingProvider({
        apiKey: 'key',
        outputDimensionality: 4,
        fetch: fn,
      });

      await provider.encode(['Test text']);

      const callArgs = (fn as ReturnType<typeof vi.fn>).mock.calls[0];
      const url = callArgs[0] as string;
      const options = callArgs[1] as RequestInit;
      const body = JSON.parse(options.body as string);

      expect(url).toContain('key=key');
      expect(url).toContain('batchEmbedContents');
      expect(body.requests).toHaveLength(1);
      expect(body.requests[0].content.parts[0].text).toBe('Test text');
      expect(body.requests[0].outputDimensionality).toBe(4);
    });

    it('throws EmbeddingProviderError on HTTP error', async () => {
      const fn = failingFetch('{"error": "forbidden"}', 403);
      const provider = new GoogleAIEmbeddingProvider({ apiKey: 'key', fetch: fn });

      await expect(provider.encode(['test'])).rejects.toThrow(EmbeddingProviderError);
    });

    it('throws on embeddings count mismatch', async () => {
      // Return 1 embedding for 2 inputs
      const fn = mockFetch([mockVector()]);
      const provider = new GoogleAIEmbeddingProvider({ apiKey: 'key', fetch: fn });

      await expect(provider.encode(['a', 'b'])).rejects.toThrow(EmbeddingProviderError);
    });

    it('throws on timeout (AbortError)', async () => {
      const fn = vi.fn(
        () =>
          new Promise((_, reject) => {
            const err = new DOMException('signal is aborted', 'AbortError');
            setTimeout(() => reject(err), 10);
          })
      ) as unknown as typeof fetch;

      const provider = new GoogleAIEmbeddingProvider({
        apiKey: 'key',
        timeout: 1,
        fetch: fn,
      });

      await expect(provider.encode(['test'])).rejects.toThrow(EmbeddingProviderError);
    });
  });

  // =========================================================================
  // similarity
  // =========================================================================
  describe('similarity', () => {
    it('delegates to cosineSimilarity', () => {
      const provider = new GoogleAIEmbeddingProvider({
        apiKey: 'key',
        fetch: mockFetch([]),
      });
      const result = provider.similarity([1, 0], [1, 0]);
      expect(result).toBeCloseTo(1, 5);
    });
  });

  // =========================================================================
  // Factory
  // =========================================================================
  describe('createGoogleAIEmbeddingProvider', () => {
    it('returns provider instance', () => {
      const provider = createGoogleAIEmbeddingProvider({
        apiKey: 'key',
        fetch: mockFetch([]),
      });
      expect(provider.id).toContain('google-ai');
    });
  });
});
