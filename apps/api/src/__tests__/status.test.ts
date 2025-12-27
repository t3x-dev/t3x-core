/**
 * Status Route Tests
 */

import { deleteProject, findProjects, insertProject } from '@t3x/storage';
import type { PGLiteDB } from '@t3x/storage/pglite';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

// Mock the database module before importing routes
let mockDB: PGLiteDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

// Import routes after mocking
import { statusRoutes } from '../routes/status';

describe('Status Routes', () => {
  let cleanup: () => Promise<void>;
  const app = new Hono();
  app.route('/', statusRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    // Clean up projects before each test
    const existingProjects = await findProjects(mockDB, {});
    for (const project of existingProjects) {
      await deleteProject(mockDB, project.projectId);
    }
  });

  describe('GET /v1/status', () => {
    it('returns empty status for empty database', async () => {
      const res = await app.request('/v1/status');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.status).toBe('ok');
      expect(data.data.database).toBe('connected');
      expect(data.data.projects_count).toBe('empty');
    });

    it('returns available status with data', async () => {
      // Create test data
      await insertProject(mockDB, testData.project());

      const res = await app.request('/v1/status');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.data.projects_count).toBe('available');
    });
  });
});
