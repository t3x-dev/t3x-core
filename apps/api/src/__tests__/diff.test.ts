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

vi.mock('@t3x-dev/storage/pglite', () => ({
  findTurnByHash: vi.fn(),
  findCommitV4ByHash: vi.fn(),
  getCommitV3: vi.fn(),
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
      const { findCommitV4ByHash } = await import('@t3x-dev/storage/pglite');
      const { diffCommits } = await import('@t3x-dev/core');

      (findCommitV4ByHash as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          content: { sentences: [{ id: 's1', text: 'Hello world' }] },
        })
        .mockResolvedValueOnce({
          content: { sentences: [{ id: 's2', text: 'Hello there' }] },
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

    it('returns 404 for non-existent V3 commit', async () => {
      const { findCommitV4ByHash, getCommitV3 } = await import('@t3x-dev/storage/pglite');

      (findCommitV4ByHash as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      (getCommitV3 as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

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
