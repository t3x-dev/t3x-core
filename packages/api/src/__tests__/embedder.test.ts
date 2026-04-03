import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock @t3x-dev/core before importing the module under test
vi.mock('@t3x-dev/core', () => ({
  createGoogleAIEmbeddingProvider: vi.fn(() => ({
    id: 'google-ai-text-embedding-004',
    embed: vi.fn(),
  })),
}));

describe('embedder', () => {
  const originalEnv = process.env.GOOGLE_AI_STUDIO_KEY;

  beforeEach(() => {
    // Reset module cache so each test gets fresh singleton state
    vi.resetModules();
    // Suppress console output from embedder initialization
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore original env
    if (originalEnv !== undefined) {
      process.env.GOOGLE_AI_STUDIO_KEY = originalEnv;
    } else {
      delete process.env.GOOGLE_AI_STUDIO_KEY;
    }
    vi.restoreAllMocks();
  });

  describe('isSemanticValidationConfigured', () => {
    it('returns true when GOOGLE_AI_STUDIO_KEY is set', async () => {
      process.env.GOOGLE_AI_STUDIO_KEY = 'test-key-123';
      const { isSemanticValidationConfigured } = await import('../lib/embedder');
      expect(isSemanticValidationConfigured()).toBe(true);
    });

    it('returns false when GOOGLE_AI_STUDIO_KEY is not set', async () => {
      delete process.env.GOOGLE_AI_STUDIO_KEY;
      const { isSemanticValidationConfigured } = await import('../lib/embedder');
      expect(isSemanticValidationConfigured()).toBe(false);
    });

    it('returns false when GOOGLE_AI_STUDIO_KEY is empty string', async () => {
      process.env.GOOGLE_AI_STUDIO_KEY = '';
      const { isSemanticValidationConfigured } = await import('../lib/embedder');
      expect(isSemanticValidationConfigured()).toBe(false);
    });
  });

  describe('getEmbedder', () => {
    it('returns null when API key is not configured', async () => {
      delete process.env.GOOGLE_AI_STUDIO_KEY;
      const { getEmbedder } = await import('../lib/embedder');

      const result = getEmbedder();
      expect(result).toBeNull();
    });

    it('returns provider when API key is configured', async () => {
      process.env.GOOGLE_AI_STUDIO_KEY = 'test-key-123';
      const { getEmbedder } = await import('../lib/embedder');

      const result = getEmbedder();
      expect(result).not.toBeNull();
      expect(result?.id).toBe('google-ai-text-embedding-004');
    });

    it('returns same instance on second call (singleton)', async () => {
      process.env.GOOGLE_AI_STUDIO_KEY = 'test-key-123';
      const { getEmbedder } = await import('../lib/embedder');

      const first = getEmbedder();
      const second = getEmbedder();
      expect(first).toBe(second);
    });

    it('returns null when provider creation fails', async () => {
      process.env.GOOGLE_AI_STUDIO_KEY = 'test-key-123';

      // Make createGoogleAIEmbeddingProvider throw
      const core = await import('@t3x-dev/core');
      vi.mocked(core.createGoogleAIEmbeddingProvider).mockImplementationOnce(() => {
        throw new Error('Network error');
      });

      const { getEmbedder } = await import('../lib/embedder');

      const result = getEmbedder();
      expect(result).toBeNull();
    });

    it('caches null result after initialization failure', async () => {
      process.env.GOOGLE_AI_STUDIO_KEY = 'test-key-123';

      const core = await import('@t3x-dev/core');
      vi.mocked(core.createGoogleAIEmbeddingProvider).mockImplementationOnce(() => {
        throw new Error('Network error');
      });

      const { getEmbedder } = await import('../lib/embedder');

      // First call fails
      const first = getEmbedder();
      expect(first).toBeNull();

      // Second call returns cached null without retrying
      const second = getEmbedder();
      expect(second).toBeNull();
      expect(core.createGoogleAIEmbeddingProvider).toHaveBeenCalledTimes(1);
    });
  });
});
