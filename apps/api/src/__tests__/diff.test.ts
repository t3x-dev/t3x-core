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
  calculateDiffStats: vi.fn(() => ({ same: 0, modified: 0, added: 0, removed: 0 })),
  DiffType: { SAME: 'same', MODIFIED: 'modified', ADDED: 'added', REMOVED: 'removed' },
  EmbeddingProviderError: class extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'EmbeddingProviderError';
    }
  },
}));

import { diffRoutes } from '../routes/diff';

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

      (getCommitUnified as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          content: {
            frames: [{ id: 'f_001', type: 'legacy_sentence', slots: { text: 'Hello world' } }],
            relations: [],
          },
        })
        .mockResolvedValueOnce({
          content: {
            frames: [{ id: 'f_002', type: 'legacy_sentence', slots: { text: 'Hello there' } }],
            relations: [],
          },
        });

      (diffCommits as ReturnType<typeof vi.fn>).mockReturnValue({
        identical: [],
        similar: [
          {
            source: { id: 's1', text: 'Hello world' },
            target: { id: 's2', text: 'Hello there' },
            similarity: 0.7,
            wordDiff: [],
          },
        ],
        onlyInSource: [],
        onlyInTarget: [],
      });

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
      expect(data.data.method).toBe('jaccard');
    });

    it('falls back to sentence splitting when rings_json is empty (turn hash mode)', async () => {
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
        const { createDiffEngine, createGoogleAIEmbeddingProvider, createCachedEmbeddingProvider } =
          await import('@t3x-dev/core');

        (createGoogleAIEmbeddingProvider as ReturnType<typeof vi.fn>).mockReturnValue({});
        (createCachedEmbeddingProvider as ReturnType<typeof vi.fn>).mockReturnValue({
          setCacheFromRecords: vi.fn().mockReturnValue(0),
          getCacheStats: vi.fn().mockReturnValue({ hits: 0, misses: 0 }),
        });
        const mockDiffEngine = {
          diffTwoWay: vi.fn().mockResolvedValue({
            baseId: 'sha256:base_turn',
            targetId: 'sha256:target_turn',
            segmentDiffs: [],
            stats: { same: 0, modified: 0, added: 2, removed: 2 },
          }),
        };
        (createDiffEngine as ReturnType<typeof vi.fn>).mockReturnValue(mockDiffEngine);

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

        // Verify diff engine was called with fallback segments
        expect(mockDiffEngine.diffTwoWay).toHaveBeenCalled();
        const callArgs = mockDiffEngine.diffTwoWay.mock.calls[0];
        // base segments should be split from content
        expect(callArgs[1]).toEqual([
          { segmentId: 's_fallback_0', text: 'I want a window seat.' },
          { segmentId: 's_fallback_1', text: 'Budget is 3000 dollars.' },
        ]);
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
