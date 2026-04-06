/**
 * Relations Route Tests
 *
 * Tests for GET relations endpoint (reads from commit content.relations).
 */

import type { AnyDB } from '@t3x-dev/storage';
import { insertProject } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

// biome-ignore lint/suspicious/noExplicitAny: test helper
type ApiResponse = any;

let mockDB: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

import { commitRoutes } from '../routes/commits.openapi';
import { relationsRoutes } from '../routes/relations.openapi';

describe('Relations Routes', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  let testCommitHash: string;
  const app = new Hono();
  app.route('/', commitRoutes);
  app.route('/', relationsRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    const project = await insertProject(mockDB, testData.project({ name: 'Relations Test' }));
    testProjectId = project.projectId;

    // Create a commit with inline relations
    const res = await app.request('/v1/commits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parents: [],
        author: { type: 'human', name: 'Relation Tester' },
        content: {
          trees: [
            { key: 'f_001', slots: { text: 'Tokyo in spring' }, children: [] },
            { key: 'f_002', slots: { text: 'Cherry blossoms' }, children: [] },
          ],
          relations: [
            { from: 'f_001', to: 'f_002', type: 'causes' },
          ],
        },
        project_id: testProjectId,
        message: 'Relations test commit',
        branch: 'main',
      }),
    });

    const data: ApiResponse = await res.json();
    expect(data.success).toBe(true);
    testCommitHash = data.data.commit.hash;
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('GET /v1/commits/:hash/relations', () => {
    it('returns relations from commit content', async () => {
      const res = await app.request(`/v1/commits/${encodeURIComponent(testCommitHash)}/relations`);
      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.relations).toHaveLength(1);
      expect(data.data.relations[0].from).toBe('f_001');
      expect(data.data.relations[0].to).toBe('f_002');
    });

    it('returns 404 for non-existent commit', async () => {
      const res = await app.request('/v1/commits/sha256:nonexistent_hash/relations');
      expect(res.status).toBe(404);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('COMMIT_NOT_FOUND');
    });
  });
});
