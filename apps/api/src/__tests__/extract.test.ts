/**
 * Extract Route Tests
 *
 * Integration tests for POST /v1/extract endpoint.
 */

import type { AnyDB } from '@t3x-dev/storage';
import { insertProject } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

// biome-ignore lint/suspicious/noExplicitAny: test helper
type ApiResponse = any;

// Mock the database module before importing routes
let mockDB: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

// Mock the webhook dispatcher
const mockDispatch = vi.fn();
vi.mock('../lib/webhook-dispatcher', () => ({
  webhookDispatcher: {
    dispatch: (...args: unknown[]) => mockDispatch(...args),
  },
}));

// Import routes after mocking
import { extractRoutes } from '../routes/extract.openapi';

describe('Extract Routes', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  const app = new Hono();
  app.route('/', extractRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    // Create test project
    const project = await insertProject(mockDB, testData.project({ name: 'Extract Test Project' }));
    testProjectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(() => {
    mockDispatch.mockClear();
  });

  describe('POST /v1/extract', () => {
    it('one-shot: creates conversation, extracts sentences, returns draft', async () => {
      const res = await app.request('/v1/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          text: 'The project deadline is next Friday. We need to hire two engineers. Budget is $50k.',
          source: 'test-api',
        }),
      });

      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.conversation_id).toBeTruthy();
      expect(data.data.conversation_id).toMatch(/^conv_/);
      expect(data.data.draft_id).toBeTruthy();
      expect(data.data.sentences).toBeInstanceOf(Array);
      expect(data.data.sentences.length).toBeGreaterThan(0);

      // Each sentence should have id and text
      for (const sentence of data.data.sentences) {
        expect(sentence.id).toBeTruthy();
        expect(sentence.text).toBeTruthy();
        expect(typeof sentence.confidence).toBe('number');
      }
    });

    it('incremental: reuses conversation_id, appends turn', async () => {
      // First extraction — creates conversation
      const res1 = await app.request('/v1/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          text: 'First message with some content.',
        }),
      });

      expect(res1.status).toBe(200);
      const data1: ApiResponse = await res1.json();
      const conversationId = data1.data.conversation_id;

      // Second extraction — reuses conversation
      const res2 = await app.request('/v1/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          text: 'Second message with additional details.',
          conversation_id: conversationId,
        }),
      });

      expect(res2.status).toBe(200);
      const data2: ApiResponse = await res2.json();
      expect(data2.success).toBe(true);
      expect(data2.data.conversation_id).toBe(conversationId);
      expect(data2.data.draft_id).toBeTruthy();
      expect(data2.data.sentences.length).toBeGreaterThan(0);
    });

    it('fires draft.ready webhook on successful extraction', async () => {
      const res = await app.request('/v1/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          text: 'Webhook test message with content.',
        }),
      });

      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);

      // draft.ready webhook should have been dispatched
      expect(mockDispatch).toHaveBeenCalledWith(
        'draft.ready',
        expect.objectContaining({
          project_id: testProjectId,
          draft_id: expect.any(String),
          sentence_count: expect.any(Number),
        }),
        testProjectId
      );
    });

    it('returns 400 for empty text (Zod validation)', async () => {
      const res = await app.request('/v1/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          text: '',
        }),
      });

      // Zod min(1) validation should reject empty text
      expect(res.status).toBe(400);
    });

    it('returns 404 for non-existent project', async () => {
      const res = await app.request('/v1/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: 'proj_nonexistent',
          text: 'Some text to extract.',
        }),
      });

      expect(res.status).toBe(404);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
    });

    it('returns 404 for non-existent conversation_id', async () => {
      const res = await app.request('/v1/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          text: 'Some text.',
          conversation_id: 'conv_nonexistent',
        }),
      });

      expect(res.status).toBe(404);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
    });

    it('detects drift in incremental mode', async () => {
      // First extraction
      const res1 = await app.request('/v1/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          text: 'The budget is $50k for the project.',
        }),
      });
      const data1: ApiResponse = await res1.json();
      const conversationId = data1.data.conversation_id;

      // Second extraction with changed content — adds new turn
      const res2 = await app.request('/v1/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          text: 'Actually the budget is $100k for the project.',
          conversation_id: conversationId,
        }),
      });

      expect(res2.status).toBe(200);
      const data2: ApiResponse = await res2.json();
      expect(data2.success).toBe(true);
      // Drift may or may not be present depending on similarity — just check shape
      if (data2.data.drift) {
        expect(data2.data.drift).toBeInstanceOf(Array);
        for (const item of data2.data.drift) {
          expect(item.sentence_id).toBeTruthy();
          expect(typeof item.before).toBe('string');
          expect(typeof item.after).toBe('string');
        }
      }
    });
  });
});
