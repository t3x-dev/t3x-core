import { describe, expect, it, vi } from 'vitest';
import { T3xClient } from '../client.js';

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

describe('T3xClient merge draft methods', () => {
  const baseUrl = 'http://localhost:8000/api';

  describe('createMergeDraft', () => {
    it('calls POST /v1/merge/drafts and returns draft', async () => {
      const draft = {
        id: 'md_123',
        project_id: 'proj_1',
        source_hash: 'sha_src',
        target_hash: 'sha_tgt',
        status: 'pending',
        prepared: { autoKept: [], conflicts: [], onlyInSource: [], onlyInTarget: [], relationsOnlyInSource: [], relationsOnlyInTarget: [], relationsInBoth: [] },
        message: null,
        created_at: '2026-04-09T00:00:00Z',
        updated_at: '2026-04-09T00:00:00Z',
      };
      const fetchFn = mockFetch(201, { success: true, data: draft });
      const client = new T3xClient({ baseUrl, fetch: fetchFn });

      const result = await client.createMergeDraft({
        project_id: 'proj_1',
        source_hash: 'sha_src',
        target_hash: 'sha_tgt',
      });

      expect(result.id).toBe('md_123');
      expect(result.status).toBe('pending');
      expect(fetchFn).toHaveBeenCalledWith(
        expect.stringContaining('/v1/merge/drafts'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('commitMergeDraft', () => {
    it('calls POST /v1/merge/drafts/:id/commit and returns commit result', async () => {
      const commitResult = {
        hash: 'sha_merged',
        parents: ['sha_src', 'sha_tgt'],
        author: { type: 'human', name: 'user' },
        committed_at: '2026-04-09T00:00:00Z',
        message: 'merge done',
        branch: 'main',
        merge_summary: {
          kept_identical: 5,
          resolved_conflicts: 0,
          kept_from_source: 2,
          kept_from_target: 1,
          discarded: 0,
          total_nodes: 8,
        },
      };
      const fetchFn = mockFetch(201, { success: true, data: commitResult });
      const client = new T3xClient({ baseUrl, fetch: fetchFn });

      const result = await client.commitMergeDraft('md_123', {
        message: 'merge done',
      });

      expect(result.hash).toBe('sha_merged');
      expect(result.merge_summary.kept_identical).toBe(5);
      expect(fetchFn).toHaveBeenCalledWith(
        expect.stringContaining('/v1/merge/drafts/md_123/commit'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('deleteMergeDraft', () => {
    it('calls DELETE /v1/merge/drafts/:id', async () => {
      const fetchFn = mockFetch(200, { success: true, data: { deleted: true } });
      const client = new T3xClient({ baseUrl, fetch: fetchFn });

      await client.deleteMergeDraft('md_123');

      expect(fetchFn).toHaveBeenCalledWith(
        expect.stringContaining('/v1/merge/drafts/md_123'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });
});
