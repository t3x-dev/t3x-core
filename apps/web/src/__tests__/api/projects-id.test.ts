/**
 * Individual Project API Route Tests
 *
 * Tests GET/PUT/DELETE /api/v1/projects/:id endpoints.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { setupTestDB, testData } from '../setup';
import type { AnyDB } from '@t3x/storage';
import { insertProject, insertConversation, insertTurn, insertBranch } from '@t3x/storage';

// Mock the database module before importing routes
let mockDB: AnyDB;

vi.mock('@/lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
}));

// Import routes after mocking
import { GET, PUT, DELETE } from '@/app/api/v1/projects/[id]/route';

describe('Projects [id] API Routes', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    // Create a test project with related entities
    const project = await insertProject(mockDB, testData.project({ name: 'Test Project' }));
    testProjectId = project.projectId;

    // Add related entities for stats
    const conv = await insertConversation(mockDB, {
      projectId: testProjectId,
      title: 'Test Conversation',
    });
    await insertTurn(mockDB, {
      projectId: testProjectId,
      conversationId: conv.conversationId,
      role: 'user',
      content: 'Hello',
    });
    await insertBranch(mockDB, {
      projectId: testProjectId,
      name: 'main',
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('GET /api/v1/projects/:id', () => {
    it('returns project with stats', async () => {
      const request = new NextRequest(`http://localhost/api/v1/projects/${testProjectId}`);
      const params = Promise.resolve({ id: testProjectId });

      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.project_id).toBe(testProjectId);
      expect(data.data.name).toBe('Test Project');
      expect(data.data.conversations_count).toBe(1);
      expect(data.data.turns_count).toBe(1);
      expect(data.data.branches_count).toBe(1);
    });

    it('returns 404 for non-existent project', async () => {
      const request = new NextRequest('http://localhost/api/v1/projects/proj_nonexistent');
      const params = Promise.resolve({ id: 'proj_nonexistent' });

      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('NOT_FOUND');
    });
  });

  describe('PUT /api/v1/projects/:id', () => {
    it('updates project name', async () => {
      const request = new NextRequest(`http://localhost/api/v1/projects/${testProjectId}`, {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated Project Name' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const params = Promise.resolve({ id: testProjectId });

      const response = await PUT(request, { params });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('Updated Project Name');
    });

    it('updates project metadata', async () => {
      const metadata = { tags: ['updated'], version: 2 };
      const request = new NextRequest(`http://localhost/api/v1/projects/${testProjectId}`, {
        method: 'PUT',
        body: JSON.stringify({ metadata }),
        headers: { 'Content-Type': 'application/json' },
      });
      const params = Promise.resolve({ id: testProjectId });

      const response = await PUT(request, { params });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.metadata).toEqual(metadata);
    });

    it('returns 404 for non-existent project', async () => {
      const request = new NextRequest('http://localhost/api/v1/projects/proj_nonexistent', {
        method: 'PUT',
        body: JSON.stringify({ name: 'New Name' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const params = Promise.resolve({ id: 'proj_nonexistent' });

      const response = await PUT(request, { params });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error.code).toBe('NOT_FOUND');
    });

    it('returns 400 for invalid JSON', async () => {
      const request = new NextRequest(`http://localhost/api/v1/projects/${testProjectId}`, {
        method: 'PUT',
        body: 'not valid json',
        headers: { 'Content-Type': 'application/json' },
      });
      const params = Promise.resolve({ id: testProjectId });

      const response = await PUT(request, { params });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('INVALID_JSON');
    });
  });

  describe('DELETE /api/v1/projects/:id', () => {
    it('deletes project and returns success', async () => {
      // Create a project to delete
      const toDelete = await insertProject(mockDB, testData.project({ name: 'To Delete' }));
      const request = new NextRequest(`http://localhost/api/v1/projects/${toDelete.projectId}`, {
        method: 'DELETE',
      });
      const params = Promise.resolve({ id: toDelete.projectId });

      const response = await DELETE(request, { params });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.deleted).toBe(true);
      expect(data.data.project_id).toBe(toDelete.projectId);
    });

    it('returns 404 for non-existent project', async () => {
      const request = new NextRequest('http://localhost/api/v1/projects/proj_nonexistent', {
        method: 'DELETE',
      });
      const params = Promise.resolve({ id: 'proj_nonexistent' });

      const response = await DELETE(request, { params });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error.code).toBe('NOT_FOUND');
    });
  });
});
