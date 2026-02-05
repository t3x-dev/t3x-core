/**
 * Conversations Route Tests (CRUD)
 *
 * Context endpoints are tested in conversation-context.test.ts
 */

import { insertConversation, insertProject, insertTurn } from '@t3x/storage';
import type { PGLiteDB } from '@t3x/storage/pglite';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

type ApiResponse = any;

let mockDB: PGLiteDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

import { conversationRoutes } from '../routes/conversations';

describe('Conversations Routes', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  const app = new Hono();
  app.route('/', conversationRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    const project = await insertProject(mockDB, testData.project({ name: 'Conversations Test' }));
    testProjectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  // =========================================================================
  // GET /v1/conversations
  // =========================================================================
  describe('GET /v1/conversations', () => {
    it('returns 400 without project_id', async () => {
      const res = await app.request('/v1/conversations');
      expect(res.status).toBe(400);
      const data: ApiResponse = await res.json();
      expect(data.error.code).toBe('INVALID_REQUEST');
    });

    it('returns empty list for new project', async () => {
      const res = await app.request(`/v1/conversations?project_id=${testProjectId}`);
      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.conversations).toEqual([]);
    });

    it('returns conversations after creation', async () => {
      await insertConversation(mockDB, { projectId: testProjectId, title: 'Conv 1' });
      await insertConversation(mockDB, { projectId: testProjectId, title: 'Conv 2' });

      const res = await app.request(`/v1/conversations?project_id=${testProjectId}`);
      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.data.conversations.length).toBe(2);
    });

    it('respects limit parameter', async () => {
      const res = await app.request(`/v1/conversations?project_id=${testProjectId}&limit=1`);
      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.data.conversations.length).toBe(1);
    });
  });

  // =========================================================================
  // POST /v1/conversations
  // =========================================================================
  describe('POST /v1/conversations', () => {
    it('creates a conversation', async () => {
      const res = await app.request('/v1/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          title: 'New Conversation',
        }),
      });

      expect(res.status).toBe(201);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.title).toBe('New Conversation');
      expect(data.data.conversation_id).toBeDefined();
      expect(data.data.project_id).toBe(testProjectId);
    });

    it('creates with position and metadata', async () => {
      const res = await app.request('/v1/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          title: 'Positioned Conv',
          position_x: 100.5,
          position_y: 200.3,
          metadata: { source: 'test' },
        }),
      });

      expect(res.status).toBe(201);
      const data: ApiResponse = await res.json();
      expect(data.data.position_x).toBe(100.5);
      expect(data.data.position_y).toBe(200.3);
      expect(data.data.metadata).toEqual({ source: 'test' });
    });

    it('returns 400 for missing project_id', async () => {
      const res = await app.request('/v1/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'No project' }),
      });

      expect(res.status).toBe(400);
    });

    it('returns 404 for non-existent project', async () => {
      const res = await app.request('/v1/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: 'proj_nonexistent', title: 'test' }),
      });

      expect(res.status).toBe(404);
    });

    it('returns 400 for invalid JSON', async () => {
      const res = await app.request('/v1/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      });

      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // GET /v1/conversations/:id
  // =========================================================================
  describe('GET /v1/conversations/:id', () => {
    it('returns conversation with turn count', async () => {
      const conv = await insertConversation(mockDB, {
        projectId: testProjectId,
        title: 'Get By ID',
      });

      // Add turns
      await insertTurn(mockDB, {
        projectId: testProjectId,
        conversationId: conv.conversationId,
        role: 'user',
        content: 'Hello',
      });
      await insertTurn(mockDB, {
        projectId: testProjectId,
        conversationId: conv.conversationId,
        role: 'assistant',
        content: 'Hi',
      });

      const res = await app.request(`/v1/conversations/${conv.conversationId}`);
      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.data.title).toBe('Get By ID');
      expect(data.data.turns_count).toBe(2);
    });

    it('returns 404 for non-existent conversation', async () => {
      const res = await app.request('/v1/conversations/conv_nonexistent');
      expect(res.status).toBe(404);
      const data: ApiResponse = await res.json();
      expect(data.error.code).toBe('NOT_FOUND');
    });
  });

  // =========================================================================
  // PUT /v1/conversations/:id
  // =========================================================================
  describe('PUT /v1/conversations/:id', () => {
    it('updates conversation title', async () => {
      const conv = await insertConversation(mockDB, {
        projectId: testProjectId,
        title: 'Original Title',
      });

      const res = await app.request(`/v1/conversations/${conv.conversationId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Updated Title' }),
      });

      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.data.title).toBe('Updated Title');
    });

    it('updates position', async () => {
      const conv = await insertConversation(mockDB, {
        projectId: testProjectId,
        title: 'Position Update',
      });

      const res = await app.request(`/v1/conversations/${conv.conversationId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position_x: 500, position_y: 300 }),
      });

      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.data.position_x).toBe(500);
      expect(data.data.position_y).toBe(300);
    });

    it('returns 404 for non-existent conversation', async () => {
      const res = await app.request('/v1/conversations/conv_nonexistent', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'x' }),
      });

      expect(res.status).toBe(404);
    });
  });

  // =========================================================================
  // DELETE /v1/conversations/:id
  // =========================================================================
  describe('DELETE /v1/conversations/:id', () => {
    it('deletes conversation', async () => {
      const conv = await insertConversation(mockDB, {
        projectId: testProjectId,
        title: 'To Delete',
      });

      const res = await app.request(`/v1/conversations/${conv.conversationId}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.data.deleted).toBe(true);

      // Verify deleted
      const getRes = await app.request(`/v1/conversations/${conv.conversationId}`);
      expect(getRes.status).toBe(404);
    });

    it('returns 404 for non-existent conversation', async () => {
      const res = await app.request('/v1/conversations/conv_nonexistent', {
        method: 'DELETE',
      });

      expect(res.status).toBe(404);
    });
  });
});
