/**
 * Conversation Context Route Tests
 *
 * Integration tests for Conversation Context API endpoints.
 */

import { insertConversation, insertProject } from '@t3x/storage';
import type { PGLiteDB } from '@t3x/storage/pglite';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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
import { conversationRoutes } from '../routes/conversations';

describe('Conversation Context Routes', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  let testConversationId: string;
  const app = new Hono();
  app.route('/', conversationRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    // Create a test project
    const project = await insertProject(mockDB, testData.project({ name: 'Context Test Project' }));
    testProjectId = project.projectId;

    // Create a test conversation
    const conversation = await insertConversation(mockDB, {
      projectId: testProjectId,
      title: 'Test Conversation for Context',
    });
    testConversationId = conversation.conversationId;
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('GET /v1/conversations/:id/context', () => {
    it('returns null for conversation with no custom context', async () => {
      const res = await app.request(`/v1/conversations/${testConversationId}/context`);
      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      // No custom context configured = null (using default)
      expect(data.data).toBeNull();
    });

    it('returns 404 for non-existent conversation', async () => {
      const res = await app.request('/v1/conversations/conv_nonexistent/context');
      expect(res.status).toBe(404);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('NOT_FOUND');
    });
  });

  describe('PUT /v1/conversations/:id/context', () => {
    it('sets context with specific pin IDs', async () => {
      const pinIds = ['pin_test1', 'pin_test2'];
      const res = await app.request(`/v1/conversations/${testConversationId}/context`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selected_pin_ids: pinIds,
        }),
      });

      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.conversation_id).toBe(testConversationId);
      expect(data.data.selected_pin_ids).toEqual(pinIds);
      expect(data.data.updated_at).toBeDefined();
    });

    it('sets context with empty pin IDs (fresh start)', async () => {
      const res = await app.request(`/v1/conversations/${testConversationId}/context`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selected_pin_ids: [],
        }),
      });

      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.selected_pin_ids).toEqual([]);
    });

    it('sets context with null (use all pins)', async () => {
      const res = await app.request(`/v1/conversations/${testConversationId}/context`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selected_pin_ids: null,
        }),
      });

      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.selected_pin_ids).toBeNull();
    });

    it('returns 400 for missing selected_pin_ids', async () => {
      const res = await app.request(`/v1/conversations/${testConversationId}/context`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_REQUEST');
    });

    it('returns 404 for non-existent conversation', async () => {
      const res = await app.request('/v1/conversations/conv_nonexistent/context', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selected_pin_ids: ['pin_test'],
        }),
      });

      expect(res.status).toBe(404);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('NOT_FOUND');
    });

    it('returns 400 for invalid JSON', async () => {
      const res = await app.request(`/v1/conversations/${testConversationId}/context`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json',
      });

      expect(res.status).toBe(400);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_JSON');
    });
  });

  describe('GET /v1/conversations/:id/context after PUT', () => {
    let contextTestConvId: string;

    beforeAll(async () => {
      // Create a separate conversation for this test
      const conversation = await insertConversation(mockDB, {
        projectId: testProjectId,
        title: 'Context Get After Put Test',
      });
      contextTestConvId = conversation.conversationId;
    });

    it('returns previously set context', async () => {
      const pinIds = ['pin_gettest1', 'pin_gettest2', 'pin_gettest3'];

      // Set context
      await app.request(`/v1/conversations/${contextTestConvId}/context`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selected_pin_ids: pinIds,
        }),
      });

      // Get context
      const res = await app.request(`/v1/conversations/${contextTestConvId}/context`);
      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.conversation_id).toBe(contextTestConvId);
      expect(data.data.selected_pin_ids).toEqual(pinIds);
    });
  });

  describe('GET /v1/conversations/:id/memory', () => {
    it('returns built context with empty pins', async () => {
      const res = await app.request(`/v1/conversations/${testConversationId}/memory`);
      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('text');
      expect(data.data).toHaveProperty('token_estimate');
      expect(data.data).toHaveProperty('sources');
      expect(typeof data.data.text).toBe('string');
      expect(typeof data.data.token_estimate).toBe('number');
      expect(Array.isArray(data.data.sources)).toBe(true);
    });

    it('returns 404 for non-existent conversation', async () => {
      const res = await app.request('/v1/conversations/conv_nonexistent/memory');
      expect(res.status).toBe(404);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /v1/conversations/:id/context-export', () => {
    it('returns JSON format by default', async () => {
      const res = await app.request(`/v1/conversations/${testConversationId}/context-export`);
      expect(res.status).toBe(200);

      // Check headers
      expect(res.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
      expect(res.headers.get('Content-Disposition')).toContain('attachment');
      expect(res.headers.get('Content-Disposition')).toContain('.json');

      // Check body is valid JSON
      const data = await res.json();
      expect(data).toHaveProperty('metadata');
      expect(data).toHaveProperty('context');
      expect(data.metadata.format).toBe('json');
      expect(data.metadata.conversation_id).toBe(testConversationId);
    });

    it('returns JSON format with ?format=json', async () => {
      const res = await app.request(
        `/v1/conversations/${testConversationId}/context-export?format=json`
      );
      expect(res.status).toBe(200);

      expect(res.headers.get('Content-Type')).toBe('application/json; charset=utf-8');

      const data = await res.json();
      expect(data.metadata.format).toBe('json');
    });

    it('returns Markdown format with ?format=markdown', async () => {
      const res = await app.request(
        `/v1/conversations/${testConversationId}/context-export?format=markdown`
      );
      expect(res.status).toBe(200);

      // Check headers
      expect(res.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8');
      expect(res.headers.get('Content-Disposition')).toContain('attachment');
      expect(res.headers.get('Content-Disposition')).toContain('.md');

      // Check body is markdown
      const text = await res.text();
      expect(text).toContain('# Context Export');
      expect(text).toContain('**Conversation ID:**');
      expect(text).toContain('**Token estimate:**');
      expect(text).toContain('## Sources');
    });

    it('returns 404 for non-existent conversation', async () => {
      const res = await app.request('/v1/conversations/conv_nonexistent/context-export');
      expect(res.status).toBe(404);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('NOT_FOUND');
    });

    it('includes correct filename in Content-Disposition', async () => {
      const res = await app.request(`/v1/conversations/${testConversationId}/context-export`);
      expect(res.status).toBe(200);

      const disposition = res.headers.get('Content-Disposition');
      expect(disposition).toContain(`filename="${testConversationId}-context.json"`);
    });

    it('includes correct filename for markdown format', async () => {
      const res = await app.request(
        `/v1/conversations/${testConversationId}/context-export?format=markdown`
      );
      expect(res.status).toBe(200);

      const disposition = res.headers.get('Content-Disposition');
      expect(disposition).toContain(`filename="${testConversationId}-context.md"`);
    });

    it('JSON export includes context with text, token_estimate, and sources', async () => {
      const res = await app.request(`/v1/conversations/${testConversationId}/context-export`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.context).toHaveProperty('text');
      expect(data.context).toHaveProperty('token_estimate');
      expect(data.context).toHaveProperty('sources');
      expect(typeof data.context.text).toBe('string');
      expect(typeof data.context.token_estimate).toBe('number');
      expect(Array.isArray(data.context.sources)).toBe(true);
    });

    it('exports with metadata including exported_at timestamp', async () => {
      const res = await app.request(`/v1/conversations/${testConversationId}/context-export`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.metadata.exported_at).toBeDefined();
      // Check it's a valid ISO date string
      const exportedAt = new Date(data.metadata.exported_at);
      expect(exportedAt.toISOString()).toBe(data.metadata.exported_at);
    });
  });
});
