import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the fetch function
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import after mocking
import {
  clearTurnContextCache,
  fetchTurnContextBatch,
  fetchTurnContextCached,
} from '@/infrastructure';

describe('Turn Context Cache', () => {
  beforeEach(() => {
    clearTurnContextCache();
    mockFetch.mockReset();
  });

  afterEach(() => {
    clearTurnContextCache();
  });

  const mockTurnContextData = {
    target_turn: {
      turn_hash: 'sha256:test',
      role: 'assistant',
      content: 'Test content',
      created_at: '2024-01-01T00:00:00Z',
    },
    context: [],
    conversation_id: 'conv_123',
    conversation_title: 'Test Conversation',
  };

  describe('fetchTurnContextCached', () => {
    it('caches successful responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: mockTurnContextData }),
      });

      // First call should fetch
      const result1 = await fetchTurnContextCached('sha256:test');
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result1).toEqual(mockTurnContextData);

      // Second call should use cache
      const result2 = await fetchTurnContextCached('sha256:test');
      expect(mockFetch).toHaveBeenCalledTimes(1); // Still 1
      expect(result2).toEqual(mockTurnContextData);
    });

    it('deduplicates concurrent requests', async () => {
      let resolvePromise: (value: unknown) => void;
      const slowPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      mockFetch.mockImplementationOnce(() => slowPromise);

      // Start two concurrent requests
      const promise1 = fetchTurnContextCached('sha256:concurrent');
      const promise2 = fetchTurnContextCached('sha256:concurrent');

      // Resolve the fetch
      resolvePromise!({
        ok: true,
        json: () => Promise.resolve({ success: true, data: mockTurnContextData }),
      });

      // Both should resolve to the same data
      const [result1, result2] = await Promise.all([promise1, promise2]);
      expect(result1).toEqual(result2);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('separates cache by options', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true, data: mockTurnContextData }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              data: { ...mockTurnContextData, context: ['different'] },
            }),
        });

      // Different options should result in different cache entries
      await fetchTurnContextCached('sha256:test', { before: 0, after: 0 });
      await fetchTurnContextCached('sha256:test', { before: 2, after: 2 });

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('fetchTurnContextBatch', () => {
    it('fetches multiple turns in parallel', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              data: {
                ...mockTurnContextData,
                target_turn: { ...mockTurnContextData.target_turn, turn_hash: 'sha256:a' },
              },
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              data: {
                ...mockTurnContextData,
                target_turn: { ...mockTurnContextData.target_turn, turn_hash: 'sha256:b' },
              },
            }),
        });

      const results = await fetchTurnContextBatch(['sha256:a', 'sha256:b']);

      expect(results.size).toBe(2);
      expect(results.get('sha256:a')).not.toBeNull();
      expect(results.get('sha256:b')).not.toBeNull();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('deduplicates input hashes', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: mockTurnContextData }),
      });

      const results = await fetchTurnContextBatch(['sha256:dup', 'sha256:dup', 'sha256:dup']);

      expect(results.size).toBe(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('handles errors gracefully', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true, data: mockTurnContextData }),
        })
        .mockRejectedValueOnce(new Error('Network error'));

      const results = await fetchTurnContextBatch(['sha256:good', 'sha256:bad']);

      expect(results.get('sha256:good')).not.toBeNull();
      expect(results.get('sha256:bad')).toBeNull();
    });
  });

  describe('clearTurnContextCache', () => {
    it('clears cached data', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: mockTurnContextData }),
      });

      // Populate cache
      await fetchTurnContextCached('sha256:clear');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Clear cache
      clearTurnContextCache();

      // Should fetch again
      await fetchTurnContextCached('sha256:clear');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
