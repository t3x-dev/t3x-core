/**
 * Branches API Route Tests
 *
 * Tests GET/POST /api/v1/branches endpoints.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { setupTestDB, testData } from '../setup';
import type { AnyDB } from '@t3x/storage';
import { insertProject, insertBranch } from '@t3x/storage';

// Mock the database module before importing routes
let mockDB: AnyDB;

vi.mock('@/lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
}));

// Import routes after mocking
import { GET, POST } from '@/app/api/v1/branches/route';

describe('Branches API Routes', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    // Create test project
    const project = await insertProject(mockDB, testData.project({ name: 'Test Project' }));
    testProjectId = project.projectId;

    // Create some test branches
    await insertBranch(mockDB, {
      projectId: testProjectId,
      name: 'main',
      description: 'Main branch',
    });
    await insertBranch(mockDB, {
      projectId: testProjectId,
      name: 'feature/test',
      parentBranch: 'main',
      description: 'Feature branch',
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('GET /api/v1/branches', () => {
    it('returns branches for a project', async () => {
      const request = new NextRequest(`http://localhost/api/v1/branches?project_id=${testProjectId}`);

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.branches.length).toBe(2);
      expect(data.data.project_id).toBe(testProjectId);
    });

    it('returns 400 when project_id is missing', async () => {
      const request = new NextRequest('http://localhost/api/v1/branches');

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('INVALID_REQUEST');
    });

    it('respects limit and offset parameters', async () => {
      const request = new NextRequest(`http://localhost/api/v1/branches?project_id=${testProjectId}&limit=1&offset=0`);

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.branches.length).toBe(1);
      expect(data.data.limit).toBe(1);
      expect(data.data.offset).toBe(0);
    });

    it('returns branches with correct field names', async () => {
      const request = new NextRequest(`http://localhost/api/v1/branches?project_id=${testProjectId}`);

      const response = await GET(request);
      const data = await response.json();

      const branch = data.data.branches[0];
      expect(branch.branch_id).toBeDefined();
      expect(branch.project_id).toBeDefined();
      expect(branch.name).toBeDefined();
      expect(branch.created_at).toBeDefined();
      expect(branch.updated_at).toBeDefined();
    });
  });

  describe('POST /api/v1/branches', () => {
    it('creates a new branch', async () => {
      const request = new NextRequest('http://localhost/api/v1/branches', {
        method: 'POST',
        body: JSON.stringify({
          project_id: testProjectId,
          name: 'new-branch',
          description: 'A new branch',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('new-branch');
      expect(data.data.branch_id).toMatch(/^branch_[a-f0-9]+$/);
    });

    it('creates branch with parent', async () => {
      const request = new NextRequest('http://localhost/api/v1/branches', {
        method: 'POST',
        body: JSON.stringify({
          project_id: testProjectId,
          name: 'child-branch',
          parent_branch: 'main',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.data.parent_branch).toBe('main');
    });

    it('returns 400 when project_id is missing', async () => {
      const request = new NextRequest('http://localhost/api/v1/branches', {
        method: 'POST',
        body: JSON.stringify({ name: 'test' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('INVALID_REQUEST');
    });

    it('returns 400 when name is missing', async () => {
      const request = new NextRequest('http://localhost/api/v1/branches', {
        method: 'POST',
        body: JSON.stringify({ project_id: testProjectId }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('INVALID_REQUEST');
    });

    it('returns 404 when project does not exist', async () => {
      const request = new NextRequest('http://localhost/api/v1/branches', {
        method: 'POST',
        body: JSON.stringify({
          project_id: 'proj_nonexistent',
          name: 'test-branch',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error.code).toBe('NOT_FOUND');
    });

    it('returns 409 when branch already exists', async () => {
      const request = new NextRequest('http://localhost/api/v1/branches', {
        method: 'POST',
        body: JSON.stringify({
          project_id: testProjectId,
          name: 'main', // Already exists
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data.error.code).toBe('CONFLICT');
    });

    it('returns 400 for invalid JSON', async () => {
      const request = new NextRequest('http://localhost/api/v1/branches', {
        method: 'POST',
        body: 'not valid json',
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('INVALID_JSON');
    });
  });
});
