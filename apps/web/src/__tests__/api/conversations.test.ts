/**
 * Conversations API Route Tests
 *
 * Tests GET /api/v1/conversations and POST /api/v1/conversations endpoints.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { setupTestDB, testData } from '../setup';
import type { AnyDB } from '@t3x/storage';
import { insertProject, insertConversation, findConversationsByProject } from '@t3x/storage';

// Mock the database module before importing routes
let mockDB: AnyDB;
let testProjectId: string;

vi.mock('@/lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
}));

// Import routes after mocking
import { GET, POST } from '@/app/api/v1/conversations/route';

describe('Conversations API Routes', () => {
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    // Create a test project
    const project = await insertProject(mockDB, testData.project({ name: 'Conversations Test Project' }));
    testProjectId = project.projectId;

    // Create some test conversations
    await insertConversation(mockDB, testData.conversation(testProjectId, { title: 'Chat One' }));
    await insertConversation(mockDB, testData.conversation(testProjectId, { title: 'Chat Two' }));
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('GET /api/v1/conversations', () => {
    it('returns 400 when project_id is missing', async () => {
      const request = new NextRequest('http://localhost/api/v1/conversations');

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_REQUEST');
    });

    it('returns list of conversations for a project', async () => {
      const request = new NextRequest(`http://localhost/api/v1/conversations?project_id=${testProjectId}`);

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.conversations).toBeDefined();
      expect(Array.isArray(data.data.conversations)).toBe(true);
      expect(data.data.conversations.length).toBe(2);
      expect(data.data.project_id).toBe(testProjectId);
    });

    it('respects limit parameter', async () => {
      const request = new NextRequest(`http://localhost/api/v1/conversations?project_id=${testProjectId}&limit=1`);

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.conversations.length).toBe(1);
      expect(data.data.limit).toBe(1);
    });

    it('returns conversations with correct field names (snake_case)', async () => {
      const request = new NextRequest(`http://localhost/api/v1/conversations?project_id=${testProjectId}`);

      const response = await GET(request);
      const data = await response.json();

      const conversation = data.data.conversations[0];
      expect(conversation.conversation_id).toBeDefined();
      expect(conversation.project_id).toBe(testProjectId);
      expect(conversation.created_at).toBeDefined();
    });

    it('returns empty array for project with no conversations', async () => {
      const emptyProject = await insertProject(mockDB, testData.project({ name: 'Empty Project' }));
      const request = new NextRequest(`http://localhost/api/v1/conversations?project_id=${emptyProject.projectId}`);

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.conversations).toEqual([]);
    });
  });

  describe('POST /api/v1/conversations', () => {
    it('creates a new conversation', async () => {
      const request = new NextRequest('http://localhost/api/v1/conversations', {
        method: 'POST',
        body: JSON.stringify({
          project_id: testProjectId,
          title: 'New Conversation',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.title).toBe('New Conversation');
      expect(data.data.conversation_id).toMatch(/^conv_[a-f0-9]+$/);
    });

    it('creates conversation with position', async () => {
      const request = new NextRequest('http://localhost/api/v1/conversations', {
        method: 'POST',
        body: JSON.stringify({
          project_id: testProjectId,
          title: 'Positioned Chat',
          position_x: 100,
          position_y: 200,
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.data.position_x).toBe(100);
      expect(data.data.position_y).toBe(200);
    });

    it('returns 400 when project_id is missing', async () => {
      const request = new NextRequest('http://localhost/api/v1/conversations', {
        method: 'POST',
        body: JSON.stringify({ title: 'No Project' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_REQUEST');
    });

    it('returns 404 when project does not exist', async () => {
      const request = new NextRequest('http://localhost/api/v1/conversations', {
        method: 'POST',
        body: JSON.stringify({
          project_id: 'proj_nonexistent',
          title: 'Orphan Chat',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('NOT_FOUND');
    });

    it('stores conversation in database', async () => {
      const request = new NextRequest('http://localhost/api/v1/conversations', {
        method: 'POST',
        body: JSON.stringify({
          project_id: testProjectId,
          title: 'Verify Storage',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      // Verify in database
      const conversations = await findConversationsByProject(mockDB, { projectId: testProjectId });
      const found = conversations.find((c) => c.conversationId === data.data.conversation_id);

      expect(found).toBeDefined();
      expect(found!.title).toBe('Verify Storage');
    });
  });
});
