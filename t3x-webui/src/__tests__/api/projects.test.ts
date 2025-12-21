/**
 * Projects API Route Tests
 *
 * Tests GET /api/v1/projects and POST /api/v1/projects endpoints.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { setupTestDB, testData, getTestDB } from '../setup';
import type { AnyDB } from '@t3x/storage';
import { insertProject, findProjects } from '@t3x/storage';

// Mock the database module before importing routes
let mockDB: AnyDB;

vi.mock('@/lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
}));

// Import routes after mocking
import { GET, POST } from '@/app/api/v1/projects/route';

describe('Projects API Routes', () => {
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('GET /api/v1/projects', () => {
    beforeEach(async () => {
      // Create some test projects
      await insertProject(mockDB, testData.project({ name: 'Project Alpha' }));
      await insertProject(mockDB, testData.project({ name: 'Project Beta' }));
    });

    it('returns list of projects', async () => {
      const request = new NextRequest('http://localhost/api/v1/projects');

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.projects).toBeDefined();
      expect(Array.isArray(data.data.projects)).toBe(true);
      expect(data.data.projects.length).toBeGreaterThanOrEqual(2);
    });

    it('respects limit parameter', async () => {
      const request = new NextRequest('http://localhost/api/v1/projects?limit=1');

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.projects.length).toBe(1);
      expect(data.data.limit).toBe(1);
    });

    it('respects offset parameter', async () => {
      const request = new NextRequest('http://localhost/api/v1/projects?offset=1');

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.offset).toBe(1);
    });

    it('returns projects with correct field names (snake_case)', async () => {
      const request = new NextRequest('http://localhost/api/v1/projects');

      const response = await GET(request);
      const data = await response.json();

      const project = data.data.projects[0];
      expect(project.project_id).toBeDefined();
      expect(project.name).toBeDefined();
      expect(project.created_at).toBeDefined();
    });
  });

  describe('POST /api/v1/projects', () => {
    it('creates a new project', async () => {
      const request = new NextRequest('http://localhost/api/v1/projects', {
        method: 'POST',
        body: JSON.stringify({ name: 'New Project' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('New Project');
      expect(data.data.project_id).toMatch(/^proj_[a-f0-9]+$/);
    });

    it('creates project with metadata', async () => {
      const metadata = { tags: ['test', 'demo'], priority: 1 };
      const request = new NextRequest('http://localhost/api/v1/projects', {
        method: 'POST',
        body: JSON.stringify({ name: 'Project with Metadata', metadata }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.data.metadata).toEqual(metadata);
    });

    it('returns 400 when name is missing', async () => {
      const request = new NextRequest('http://localhost/api/v1/projects', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_REQUEST');
    });

    it('returns 400 for invalid JSON', async () => {
      const request = new NextRequest('http://localhost/api/v1/projects', {
        method: 'POST',
        body: 'not valid json',
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_JSON');
    });

    it('stores project in database', async () => {
      const request = new NextRequest('http://localhost/api/v1/projects', {
        method: 'POST',
        body: JSON.stringify({ name: 'Verify Storage' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      // Verify in database
      const projects = await findProjects(mockDB, {});
      const found = projects.find((p) => p.projectId === data.data.project_id);

      expect(found).toBeDefined();
      expect(found!.name).toBe('Verify Storage');
    });
  });
});
