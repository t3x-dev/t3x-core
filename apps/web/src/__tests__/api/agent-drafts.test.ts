/**
 * Agent Drafts API Route Tests
 *
 * Tests POST /api/v1/agent/drafts endpoint.
 * Note: Tests requiring LLM calls are skipped as they need ANTHROPIC_API_KEY.
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
import { POST } from '@/app/api/v1/agent/drafts/route';

describe('Agent Drafts API Routes', () => {
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

    // Add some turns
    await insertTurn(mockDB, {
      projectId: testProjectId,
      conversationId: testConversationId,
      role: 'user',
      content: 'I want to learn about coffee brewing methods',
    });
    await insertTurn(mockDB, {
      projectId: testProjectId,
      conversationId: testConversationId,
      role: 'assistant',
      content: 'Coffee brewing methods include pour-over, French press, and espresso.',
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('POST /api/v1/agent/drafts - Validation', () => {
    it('returns 400 when required fields are missing', async () => {
      const request = new NextRequest('http://localhost/api/v1/agent/drafts', {
        method: 'POST',
        body: JSON.stringify({
          project_id: testProjectId,
          // missing conversation_id, bridge_id, intent
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('INVALID_REQUEST');
      expect(data.error.message).toContain('required');
    });

    it('returns 400 for invalid JSON', async () => {
      const request = new NextRequest('http://localhost/api/v1/agent/drafts', {
        method: 'POST',
        body: 'not valid json',
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('INVALID_JSON');
    });

    it('returns 400 when ANTHROPIC_API_KEY is not configured', async () => {
      // Ensure env var is not set
      const originalKey = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      const request = new NextRequest('http://localhost/api/v1/agent/drafts', {
        method: 'POST',
        body: JSON.stringify({
          project_id: testProjectId,
          conversation_id: testConversationId,
          bridge_id: 'summary',
          intent: 'summarize the conversation',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('PROVIDER_ERROR');
      expect(data.error.message).toContain('API key');

      // Restore env var
      if (originalKey) {
        process.env.ANTHROPIC_API_KEY = originalKey;
      }
    });

    it('returns 404 when project does not exist', async () => {
      const originalKey = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = 'test-key';

      const request = new NextRequest('http://localhost/api/v1/agent/drafts', {
        method: 'POST',
        body: JSON.stringify({
          project_id: 'proj_nonexistent',
          conversation_id: testConversationId,
          bridge_id: 'summary',
          intent: 'summarize',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error.code).toBe('NOT_FOUND');

      // Restore env var
      if (originalKey) {
        process.env.ANTHROPIC_API_KEY = originalKey;
      } else {
        delete process.env.ANTHROPIC_API_KEY;
      }
    });

    it('returns 404 when conversation does not exist', async () => {
      const originalKey = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = 'test-key';

      const request = new NextRequest('http://localhost/api/v1/agent/drafts', {
        method: 'POST',
        body: JSON.stringify({
          project_id: testProjectId,
          conversation_id: 'conv_nonexistent',
          bridge_id: 'summary',
          intent: 'summarize',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error.code).toBe('NOT_FOUND');

      // Restore env var
      if (originalKey) {
        process.env.ANTHROPIC_API_KEY = originalKey;
      } else {
        delete process.env.ANTHROPIC_API_KEY;
      }
    });
  });
});
