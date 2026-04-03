/**
 * Diff Routes Tests
 */

import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

// Mock dependencies
const mockDB = {};

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

vi.mock('@t3x-dev/storage', () => ({
  findTurnByHash: vi.fn(),
  getCommitUnified: vi.fn(),
  findSegmentEmbeddingsByTurn: vi.fn().mockResolvedValue([]),
}));

vi.mock('@t3x-dev/core', () => ({
  createDiffEngine: vi.fn(),
  createGoogleAIEmbeddingProvider: vi.fn(),
  createCachedEmbeddingProvider: vi.fn(),
  diffCommits: vi.fn(),
  flattenTrees: vi.fn((trees: unknown[]) => trees),
  EmbeddingProviderError: class extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'EmbeddingProviderError';
    }
  },
}));

import { diffRoutes } from '../routes/diff.openapi';

const app = new Hono();
app.route('/', diffRoutes);

describe('Diff Routes', () => {
  describe('POST /v1/diff/two-way', () => {
    it('returns 400 for invalid JSON', async () => {
      const res = await app.request('/v1/diff/two-way', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe('INVALID_JSON');
    });

    it('returns 400 for empty body', async () => {
      const res = await app.request('/v1/diff/two-way', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(null),
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 for missing params', async () => {
      const res = await app.request('/v1/diff/two-way', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe('INVALID_REQUEST');
    });

    it('returns success for V4 commit hash mode', async () => {
      const { getCommitUnified } = await import('@t3x-dev/storage');
      const { diffCommits } = await import('@t3x-dev/core');

      const baseCommit = {
        hash: 'sha256:base',
        message: 'base commit',
        author: { type: 'human', id: 'user1', name: 'User' },
        committed_at: '2024-01-01T00:00:00Z',
        branch: 'main',
        content: {
          trees: [{ key: 'f_001', slots: { text: 'Hello world' }, children: [] }],
          relations: [],
        },
      };
      const targetCommit = {
        hash: 'sha256:target',
        message: 'target commit',
        author: { type: 'human', id: 'user1', name: 'User' },
        committed_at: '2024-01-02T00:00:00Z',
        branch: 'main',
        content: {
          trees: [{ key: 'f_002', slots: { text: 'Hello there' }, children: [] }],
          relations: [],
        },
      };

      (getCommitUnified as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(baseCommit)
        .mockResolvedValueOnce(targetCommit);

      const mockFrameDiffResult = {
        identical: [],
        similar: [
          {
            base: { key: 'f_001', slots: { text: 'Hello world' } },
            target: { key: 'f_002', slots: { text: 'Hello there' } },
            similarity: 0.7,
            word_diff: [],
          },
        ],
        only_in_base: [],
        only_in_target: [],
      };
      (diffCommits as ReturnType<typeof vi.fn>).mockReturnValue(mockFrameDiffResult);

      const res = await app.request('/v1/diff/two-way', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base_commit_hash: 'sha256:base',
          target_commit_hash: 'sha256:target',
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.diff).toEqual(mockFrameDiffResult);
      expect(data.data.base.hash).toBe('sha256:base');
      expect(data.data.target.hash).toBe('sha256:target');
    });

    it('returns placeholder response for turn hash mode', async () => {
      const origGoogleKey = process.env.GOOGLE_AI_STUDIO_KEY;
      try {
        const { findTurnByHash } = await import('@t3x-dev/storage');

        (findTurnByHash as ReturnType<typeof vi.fn>)
          .mockResolvedValueOnce({
            turnHash: 'sha256:base_turn',
            content: 'I want a window seat. Budget is 3000 dollars.',
            ringsJson: null,
          })
          .mockResolvedValueOnce({
            turnHash: 'sha256:target_turn',
            content: 'Prefer aisle seat. Budget is flexible.',
            ringsJson: null,
          });

        // Turn hash mode needs embedding API — mock it
        process.env.GOOGLE_AI_STUDIO_KEY = 'test-key';
        const { createGoogleAIEmbeddingProvider, createCachedEmbeddingProvider } =
          await import('@t3x-dev/core');

        (createGoogleAIEmbeddingProvider as ReturnType<typeof vi.fn>).mockReturnValue({});
        (createCachedEmbeddingProvider as ReturnType<typeof vi.fn>).mockReturnValue({
          setCacheFromRecords: vi.fn().mockReturnValue(0),
          getCacheStats: vi.fn().mockReturnValue({ hits: 0, misses: 0 }),
        });

        const res = await app.request('/v1/diff/two-way', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            baseTurnHash: 'sha256:base_turn',
            targetTurnHash: 'sha256:target_turn',
          }),
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        // Legacy sentence DiffEngine removed; turn hash mode now returns placeholder
        expect(data.data.method).toBe('placeholder');
      } finally {
        if (origGoogleKey === undefined) {
          delete process.env.GOOGLE_AI_STUDIO_KEY;
        } else {
          process.env.GOOGLE_AI_STUDIO_KEY = origGoogleKey;
        }
      }
    });

    it('returns 404 for non-existent commit', async () => {
      const { getCommitUnified } = await import('@t3x-dev/storage');

      (getCommitUnified as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const res = await app.request('/v1/diff/two-way', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base_commit_hash: 'sha256:missing',
          target_commit_hash: 'sha256:also_missing',
        }),
      });

      expect(res.status).toBe(404);
    });
  });

  describe('POST /v1/diff/three-way', () => {
    it('returns 400 for invalid JSON', async () => {
      const res = await app.request('/v1/diff/three-way', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'bad',
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 for missing params', async () => {
      const res = await app.request('/v1/diff/three-way', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe('INVALID_REQUEST');
    });

    it('returns 400 for empty body', async () => {
      const res = await app.request('/v1/diff/three-way', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(null),
      });
      expect(res.status).toBe(400);
    });
  });
});
