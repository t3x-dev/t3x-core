/**
 * Individual Conversation API Route Tests
 *
 * Tests GET/PUT/DELETE /api/v1/conversations/:id endpoints.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { setupTestDB, testData } from '../setup';
import type { AnyDB } from '@t3x/storage';
import { insertProject, insertConversation, insertTurn } from '@t3x/storage';

// Mock the database module before importing routes
let mockDB: AnyDB;

vi.mock('@/lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
}));

// Import routes after mocking
import { GET, PUT, DELETE } from '@/app/api/v1/conversations/[id]/route';

describe('Conversations [id] API Routes', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  let testConversationId: string;

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    // Create test project and conversation
    const project = await insertProject(mockDB, testData.project({ name: 'Test Project' }));
    testProjectId = project.projectId;

    const conv = await insertConversation(mockDB, {
      projectId: testProjectId,
      title: 'Test Conversation',
    });
    testConversationId = conv.conversationId;

    // Add turns for turn count
    await insertTurn(mockDB, {
      projectId: testProjectId,
      conversationId: testConversationId,
      role: 'user',
      content: 'Hello',
    });
    await insertTurn(mockDB, {
      projectId: testProjectId,
      conversationId: testConversationId,
      role: 'assistant',
      content: 'Hi there!',
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('GET /api/v1/conversations/:id', () => {
    it('returns conversation with turn count', async () => {
      const request = new NextRequest(`http://localhost/api/v1/conversations/${testConversationId}`);
      const params = Promise.resolve({ id: testConversationId });

      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.conversation_id).toBe(testConversationId);
      expect(data.data.project_id).toBe(testProjectId);
      expect(data.data.title).toBe('Test Conversation');
      expect(data.data.turns_count).toBe(2);
    });

    it('returns 404 for non-existent conversation', async () => {
      const request = new NextRequest('http://localhost/api/v1/conversations/conv_nonexistent');
      const params = Promise.resolve({ id: 'conv_nonexistent' });

      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('NOT_FOUND');
    });
  });

  describe('PUT /api/v1/conversations/:id', () => {
    it('updates conversation title', async () => {
      const request = new NextRequest(`http://localhost/api/v1/conversations/${testConversationId}`, {
        method: 'PUT',
        body: JSON.stringify({ title: 'Updated Title' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const params = Promise.resolve({ id: testConversationId });

      const response = await PUT(request, { params });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.title).toBe('Updated Title');
    });

    it('updates conversation position', async () => {
      const request = new NextRequest(`http://localhost/api/v1/conversations/${testConversationId}`, {
        method: 'PUT',
        body: JSON.stringify({ position_x: 100, position_y: 200 }),
        headers: { 'Content-Type': 'application/json' },
      });
      const params = Promise.resolve({ id: testConversationId });

      const response = await PUT(request, { params });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.position_x).toBe(100);
      expect(data.data.position_y).toBe(200);
    });

    it('updates conversation metadata', async () => {
      const metadata = { topic: 'testing', priority: 'high' };
      const request = new NextRequest(`http://localhost/api/v1/conversations/${testConversationId}`, {
        method: 'PUT',
        body: JSON.stringify({ metadata }),
        headers: { 'Content-Type': 'application/json' },
      });
      const params = Promise.resolve({ id: testConversationId });

      const response = await PUT(request, { params });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.metadata).toEqual(metadata);
    });

    it('returns 404 for non-existent conversation', async () => {
      const request = new NextRequest('http://localhost/api/v1/conversations/conv_nonexistent', {
        method: 'PUT',
        body: JSON.stringify({ title: 'New Title' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const params = Promise.resolve({ id: 'conv_nonexistent' });

      const response = await PUT(request, { params });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error.code).toBe('NOT_FOUND');
    });

    it('returns 400 for invalid JSON', async () => {
      const request = new NextRequest(`http://localhost/api/v1/conversations/${testConversationId}`, {
        method: 'PUT',
        body: 'not valid json',
        headers: { 'Content-Type': 'application/json' },
      });
      const params = Promise.resolve({ id: testConversationId });

      const response = await PUT(request, { params });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('INVALID_JSON');
    });
  });

  describe('DELETE /api/v1/conversations/:id', () => {
    it('deletes conversation and returns success', async () => {
      // Create a conversation to delete
      const toDelete = await insertConversation(mockDB, {
        projectId: testProjectId,
        title: 'To Delete',
      });

      const request = new NextRequest(`http://localhost/api/v1/conversations/${toDelete.conversationId}`, {
        method: 'DELETE',
      });
      const params = Promise.resolve({ id: toDelete.conversationId });

      const response = await DELETE(request, { params });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.deleted).toBe(true);
      expect(data.data.conversation_id).toBe(toDelete.conversationId);
    });

    it('returns 404 for non-existent conversation', async () => {
      const request = new NextRequest('http://localhost/api/v1/conversations/conv_nonexistent', {
        method: 'DELETE',
      });
      const params = Promise.resolve({ id: 'conv_nonexistent' });

      const response = await DELETE(request, { params });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error.code).toBe('NOT_FOUND');
    });
  });
});
