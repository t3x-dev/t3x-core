/**
 * Projects Route Tests
 */

import { deleteProject, findProjects, insertProject } from '@t3x/storage';
import type { PGLiteDB } from '@t3x/storage/pglite';
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
import { projectRoutes } from '../routes/projects';

describe('Projects Routes', () => {
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
    // Clean up projects before each test
    const existingProjects = await findProjects(mockDB, {});
    for (const project of existingProjects) {
      await deleteProject(mockDB, project.projectId);
    }
  });

  describe('GET /v1/projects', () => {
    it('returns empty list when no projects exist', async () => {
      const res = await app.request('/v1/projects');
      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.projects).toEqual([]);
    });

    it('returns list of projects', async () => {
      // Create test projects
      await insertProject(mockDB, testData.project({ name: 'Project Alpha' }));
      await insertProject(mockDB, testData.project({ name: 'Project Beta' }));

      const res = await app.request('/v1/projects');
      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.projects.length).toBe(2);
    });

    it('respects limit parameter', async () => {
      // Create 3 projects
      await insertProject(mockDB, testData.project({ name: 'Project 1' }));
      await insertProject(mockDB, testData.project({ name: 'Project 2' }));
      await insertProject(mockDB, testData.project({ name: 'Project 3' }));

      const res = await app.request('/v1/projects?limit=2');
      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.data.projects.length).toBe(2);
      expect(data.data.limit).toBe(2);
    });
  });

  describe('POST /v1/projects', () => {
    it('creates a new project', async () => {
      const res = await app.request('/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Project' }),
      });

      expect(res.status).toBe(201);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('New Project');
      expect(data.data.project_id).toBeDefined();
    });

    it('creates project with metadata', async () => {
      const metadata = { description: 'Test description', tags: ['test'] };

      const res = await app.request('/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Project with Metadata', metadata }),
      });

      expect(res.status).toBe(201);

      const data: ApiResponse = await res.json();
      expect(data.data.metadata).toEqual(metadata);
    });

    it('returns error for missing name', async () => {
      const res = await app.request('/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_REQUEST');
    });

    it('returns error for invalid JSON', async () => {
      const res = await app.request('/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not valid json',
      });

      expect(res.status).toBe(400);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
    });
  });

  describe('GET /v1/projects/:id', () => {
    it('returns project by ID', async () => {
      const project = await insertProject(mockDB, testData.project({ name: 'Find Me' }));

      const res = await app.request(`/v1/projects/${project.projectId}`);
      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('Find Me');
    });

    it('returns 404 for non-existent project', async () => {
      const res = await app.request('/v1/projects/proj_nonexistent');
      expect(res.status).toBe(404);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('NOT_FOUND');
    });
  });
});
