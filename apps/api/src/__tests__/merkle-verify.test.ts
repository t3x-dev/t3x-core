/**
 * Merkle Verification Route Tests
 *
 * Tests for:
 * - GET /v1/projects/:id/verify/quick (Quick Merkle verification)
 * - POST /v1/projects/:id/backfill-merkle (Backfill missing merkle roots)
 */

import {
  commitsV4,
  createCommitV4,
  deleteProject,
  findProjects,
  insertProject,
} from '@t3x/storage';
import type { PGLiteDB } from '@t3x/storage/pglite';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiResponse = any;

// Mock the database module before importing routes
let mockDB: PGLiteDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

// Import routes after mocking
import { projectRoutes } from '../routes/projects.openapi';

describe('Merkle Verification Routes', () => {
  let cleanup: () => Promise<void>;
  const app = new Hono();
  app.route('/', projectRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    const existingProjects = await findProjects(mockDB, {});
    for (const project of existingProjects) {
      await deleteProject(mockDB, project.projectId);
    }
  });

  describe('GET /v1/projects/:id/verify/quick', () => {
    it('returns valid for project with untampered commits', async () => {
      const project = await insertProject(mockDB, testData.project({ name: 'Quick Verify' }));

      await createCommitV4(mockDB, {
        project_id: project.projectId,
        author: { type: 'human', name: 'Tester' },
        sentences: [{ id: 's_qv1', text: 'Quick verify test' }],
        branch: 'main',
      });

      const res = await app.request(`/v1/projects/${project.projectId}/verify/quick`);
      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.valid).toBe(true);
      expect(data.data.checked).toBe(1);
      expect(data.data.mismatches).toEqual([]);
      expect(data.data.verified_at).toBeTruthy();
    });

    it('detects tampered merkle root', async () => {
      const project = await insertProject(mockDB, testData.project({ name: 'Tampered Quick' }));

      const commit = await createCommitV4(mockDB, {
        project_id: project.projectId,
        author: { type: 'human', name: 'Tester' },
        sentences: [{ id: 's_tq1', text: 'Tampered sentence' }],
        branch: 'main',
      });

      // Tamper the stored merkle_root
      await (mockDB as unknown as import('@t3x/storage').AnyDB)
        .update(commitsV4)
        .set({ merkleRoot: 'sha256:fake_root_value' })
        .where(eq(commitsV4.hash, commit.hash));

      const res = await app.request(`/v1/projects/${project.projectId}/verify/quick`);
      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.valid).toBe(false);
      expect(data.data.mismatches).toContain(commit.hash);
    });

    it('returns 404 for non-existent project', async () => {
      const res = await app.request('/v1/projects/proj_nonexistent/verify/quick');
      expect(res.status).toBe(404);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('NOT_FOUND');
    });

    it('returns valid for empty project', async () => {
      const project = await insertProject(mockDB, testData.project({ name: 'Empty Quick' }));

      const res = await app.request(`/v1/projects/${project.projectId}/verify/quick`);
      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.valid).toBe(true);
      expect(data.data.checked).toBe(0);
    });
  });

  describe('POST /v1/projects/:id/backfill-merkle', () => {
    it('backfills commits without merkle roots', async () => {
      const project = await insertProject(mockDB, testData.project({ name: 'Backfill API' }));

      const commit = await createCommitV4(mockDB, {
        project_id: project.projectId,
        author: { type: 'human', name: 'Tester' },
        sentences: [{ id: 's_ba1', text: 'Backfill API test' }],
        branch: 'main',
      });

      // Remove merkle_root to simulate pre-existing commit
      await (mockDB as unknown as import('@t3x/storage').AnyDB)
        .update(commitsV4)
        .set({ merkleRoot: null })
        .where(eq(commitsV4.hash, commit.hash));

      const res = await app.request(`/v1/projects/${project.projectId}/backfill-merkle`, {
        method: 'POST',
      });
      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.updated).toBe(1);
      expect(data.data.verified_at).toBeTruthy();
    });

    it('returns 0 when all commits already have roots', async () => {
      const project = await insertProject(mockDB, testData.project({ name: 'No Backfill API' }));

      await createCommitV4(mockDB, {
        project_id: project.projectId,
        author: { type: 'human', name: 'Tester' },
        sentences: [{ id: 's_nb1', text: 'Already has root' }],
        branch: 'main',
      });

      const res = await app.request(`/v1/projects/${project.projectId}/backfill-merkle`, {
        method: 'POST',
      });
      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.updated).toBe(0);
    });

    it('returns 404 for non-existent project', async () => {
      const res = await app.request('/v1/projects/proj_nonexistent/backfill-merkle', {
        method: 'POST',
      });
      expect(res.status).toBe(404);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('NOT_FOUND');
    });
  });
});
