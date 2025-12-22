/**
 * Drafts API Route Tests
 *
 * Tests GET/POST /api/v1/drafts and GET/DELETE /api/v1/drafts/:id endpoints.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { setupTestDB, testData } from '../setup';
import type { AnyDB } from '@t3x/storage';
import { insertProject, insertConversation, insertDraft } from '@t3x/storage';

// Mock the database module before importing routes
let mockDB: AnyDB;

vi.mock('@/lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
}));

// Import routes after mocking
import { GET as listDrafts, POST } from '@/app/api/v1/drafts/route';
import { GET as getDraft, DELETE } from '@/app/api/v1/drafts/[id]/route';

describe('Drafts API Routes', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  let testConversationId: string;
  let testDraftId: string;

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    // Create test project
    const project = await insertProject(mockDB, testData.project({ name: 'Test Project' }));
    testProjectId = project.projectId;

    // Create conversation
    const conv = await insertConversation(mockDB, {
      projectId: testProjectId,
      title: 'Test Conversation',
    });
    testConversationId = conv.conversationId;

    // Create a draft
    const draft = await insertDraft(mockDB, {
      projectId: testProjectId,
      conversationId: testConversationId,
      bridgeId: 'summary',
      bridgePayload: { intent: 'summarize' },
      llmConfig: { provider: 'anthropic', model: 'claude-3' },
      text: 'This is a test draft',
    });
    testDraftId = draft.draftId;
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('GET /api/v1/drafts', () => {
    it('returns drafts for a project', async () => {
      const request = new NextRequest(`http://localhost/api/v1/drafts?project_id=${testProjectId}`);

      const response = await listDrafts(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.drafts.length).toBeGreaterThanOrEqual(1);
      expect(data.data.project_id).toBe(testProjectId);
    });

    it('returns 400 when project_id is missing', async () => {
      const request = new NextRequest('http://localhost/api/v1/drafts');

      const response = await listDrafts(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('INVALID_REQUEST');
    });

    it('respects limit and offset parameters', async () => {
      const request = new NextRequest(`http://localhost/api/v1/drafts?project_id=${testProjectId}&limit=1`);

      const response = await listDrafts(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.drafts.length).toBeLessThanOrEqual(1);
      expect(data.data.limit).toBe(1);
    });

    it('returns drafts with correct field names', async () => {
      const request = new NextRequest(`http://localhost/api/v1/drafts?project_id=${testProjectId}`);

      const response = await listDrafts(request);
      const data = await response.json();

      const draft = data.data.drafts[0];
      expect(draft.draft_id).toBeDefined();
      expect(draft.project_id).toBeDefined();
      expect(draft.conversation_id).toBeDefined();
      expect(draft.bridge_id).toBeDefined();
      expect(draft.text).toBeDefined();
      expect(draft.status).toBeDefined();
      expect(draft.created_at).toBeDefined();
    });
  });

  describe('POST /api/v1/drafts', () => {
    it('creates a new draft', async () => {
      const request = new NextRequest('http://localhost/api/v1/drafts', {
        method: 'POST',
        body: JSON.stringify({
          project_id: testProjectId,
          conversation_id: testConversationId,
          bridge_id: 'intent',
          bridge_payload: { action: 'analyze' },
          llm_config: { provider: 'openai', model: 'gpt-4' },
          text: 'New draft text',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.draft_id).toMatch(/^draft_[a-f0-9]+$/);
      expect(data.data.bridge_id).toBe('intent');
      expect(data.data.text).toBe('New draft text');
      expect(data.data.status).toBe('ephemeral');
    });

    it('returns 400 when required fields are missing', async () => {
      const request = new NextRequest('http://localhost/api/v1/drafts', {
        method: 'POST',
        body: JSON.stringify({
          project_id: testProjectId,
          // missing conversation_id, bridge_id, text
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('INVALID_REQUEST');
    });

    it('returns 404 when project does not exist', async () => {
      const request = new NextRequest('http://localhost/api/v1/drafts', {
        method: 'POST',
        body: JSON.stringify({
          project_id: 'proj_nonexistent',
          conversation_id: testConversationId,
          bridge_id: 'test',
          text: 'Test',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error.code).toBe('NOT_FOUND');
    });

    it('returns 400 for invalid JSON', async () => {
      const request = new NextRequest('http://localhost/api/v1/drafts', {
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

  describe('GET /api/v1/drafts/:id', () => {
    it('returns draft by id', async () => {
      const request = new NextRequest(`http://localhost/api/v1/drafts/${testDraftId}`);
      const params = Promise.resolve({ id: testDraftId });

      const response = await getDraft(request, { params });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.draft_id).toBe(testDraftId);
      expect(data.data.text).toBe('This is a test draft');
    });

    it('returns 404 for non-existent draft', async () => {
      const request = new NextRequest('http://localhost/api/v1/drafts/draft_nonexistent');
      const params = Promise.resolve({ id: 'draft_nonexistent' });

      const response = await getDraft(request, { params });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error.code).toBe('NOT_FOUND');
    });
  });

  describe('DELETE /api/v1/drafts/:id', () => {
    it('deletes draft and returns success', async () => {
      // Create a draft to delete
      const toDelete = await insertDraft(mockDB, {
        projectId: testProjectId,
        conversationId: testConversationId,
        bridgeId: 'delete-test',
        bridgePayload: {},
        llmConfig: {},
        text: 'To be deleted',
      });

      const request = new NextRequest(`http://localhost/api/v1/drafts/${toDelete.draftId}`, {
        method: 'DELETE',
      });
      const params = Promise.resolve({ id: toDelete.draftId });

      const response = await DELETE(request, { params });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.deleted).toBe(true);
      expect(data.data.draft_id).toBe(toDelete.draftId);
    });

    it('returns 404 for non-existent draft', async () => {
      const request = new NextRequest('http://localhost/api/v1/drafts/draft_nonexistent', {
        method: 'DELETE',
      });
      const params = Promise.resolve({ id: 'draft_nonexistent' });

      const response = await DELETE(request, { params });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error.code).toBe('NOT_FOUND');
    });
  });
});
