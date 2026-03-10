/**
 * Turns Route Tests
 */

import { insertConversation, insertProject, insertTurn } from '@t3x-dev/storage';
import type { PGLiteDB } from '@t3x-dev/storage/pglite';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

type ApiResponse = any;

let mockDB: PGLiteDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

// Mock NLP provider to avoid real API calls
vi.mock('../lib/nlp', () => ({
  getNLPProvider: vi.fn(() => ({
    detectLanguage: vi.fn(() => Promise.resolve({ language: 'en', confidence: 1 })),
    extractEntities: vi.fn(() => Promise.resolve([])),
    analyzeSentiment: vi.fn(() => Promise.resolve({ score: 0, magnitude: 0 })),
  })),
}));

import { turnRoutes } from '../routes/turns';

describe('Turns Routes', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  let testConversationId: string;
  const app = new Hono();
  app.route('/', turnRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    const project = await insertProject(mockDB, testData.project({ name: 'Turns Test' }));
    testProjectId = project.projectId;

    const conversation = await insertConversation(mockDB, {
      projectId: testProjectId,
      title: 'Test Conversation',
    });
    testConversationId = conversation.conversationId;
  });

  afterAll(async () => {
    await cleanup();
  });

  // =========================================================================
  // GET /v1/turns
  // =========================================================================
  describe('GET /v1/turns', () => {
    it('returns 400 without conversation_id', async () => {
      const res = await app.request('/v1/turns');
      expect(res.status).toBe(400);
      const data: ApiResponse = await res.json();
      expect(data.error.code).toBe('INVALID_REQUEST');
    });

    it('returns empty list for conversation with no turns', async () => {
      const res = await app.request(`/v1/turns?conversation_id=${testConversationId}`);
      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.turns).toEqual([]);
    });

    it('returns turns after creation', async () => {
      await insertTurn(mockDB, {
        projectId: testProjectId,
        conversationId: testConversationId,
        role: 'user',
        content: 'Hello world',
      });

      const res = await app.request(`/v1/turns?conversation_id=${testConversationId}`);
      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.data.turns.length).toBeGreaterThanOrEqual(1);
      expect(data.data.turns[0].role).toBe('user');
      expect(data.data.turns[0].content).toBe('Hello world');
    });

    it('supports order parameter', async () => {
      const res = await app.request(`/v1/turns?conversation_id=${testConversationId}&order=desc`);
      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.data.order).toBe('desc');
    });
  });

  // =========================================================================
  // POST /v1/turns
  // =========================================================================
  describe('POST /v1/turns', () => {
    it('creates a turn with provided rings', async () => {
      const rings = { ring1: { keywords: ['test'] }, ring2: {}, ring3: { segments: [] } };
      const res = await app.request('/v1/turns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          conversation_id: testConversationId,
          role: 'assistant',
          content: 'Hello! How can I help?',
          rings,
        }),
      });

      expect(res.status).toBe(201);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.role).toBe('assistant');
      expect(data.data.content).toBe('Hello! How can I help?');
      expect(data.data.turn_hash).toBeDefined();
    });

    it('returns 400 for missing required fields', async () => {
      const res = await app.request('/v1/turns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: testProjectId }),
      });

      expect(res.status).toBe(400);
      const data: ApiResponse = await res.json();
      expect(data.error.code).toBe('INVALID_REQUEST');
    });

    it('returns 400 for invalid role', async () => {
      const res = await app.request('/v1/turns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          conversation_id: testConversationId,
          role: 'invalid_role',
          content: 'test',
        }),
      });

      expect(res.status).toBe(400);
    });

    it('returns 404 for non-existent conversation', async () => {
      const res = await app.request('/v1/turns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          conversation_id: 'conv_nonexistent',
          role: 'user',
          content: 'test',
          rings: {},
        }),
      });

      expect(res.status).toBe(404);
    });

    it('returns 400 for invalid JSON', async () => {
      const res = await app.request('/v1/turns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      });

      expect(res.status).toBe(400);
    });

    it('skips ring extraction when DISABLE_RING_EXTRACTION=true', async () => {
      const origEnv = process.env.DISABLE_RING_EXTRACTION;
      process.env.DISABLE_RING_EXTRACTION = 'true';
      try {
        const res = await app.request('/v1/turns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: testProjectId,
            conversation_id: testConversationId,
            role: 'user',
            content: 'Ring extraction should be skipped',
          }),
        });

        expect(res.status).toBe(201);
        const data: ApiResponse = await res.json();
        expect(data.success).toBe(true);
        // rings should be null since extraction was skipped and no rings were provided
        expect(data.data.rings).toBeNull();
      } finally {
        if (origEnv === undefined) {
          delete process.env.DISABLE_RING_EXTRACTION;
        } else {
          process.env.DISABLE_RING_EXTRACTION = origEnv;
        }
      }
    });
  });

  // =========================================================================
  // GET /v1/turns/:hash
  // =========================================================================
  describe('GET /v1/turns/:hash', () => {
    it('returns turn by hash', async () => {
      const turn = await insertTurn(mockDB, {
        projectId: testProjectId,
        conversationId: testConversationId,
        role: 'user',
        content: 'Find me by hash',
      });

      const res = await app.request(`/v1/turns/${encodeURIComponent(turn.turnHash)}`);
      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.data.content).toBe('Find me by hash');
    });

    it('returns 404 for non-existent hash', async () => {
      const res = await app.request('/v1/turns/sha256:nonexistent');
      expect(res.status).toBe(404);
    });
  });

  // =========================================================================
  // GET /v1/turns/:hash/chain
  // =========================================================================
  describe('GET /v1/turns/:hash/chain', () => {
    it('returns turn chain', async () => {
      // Create a chain of turns
      const _t1 = await insertTurn(mockDB, {
        projectId: testProjectId,
        conversationId: testConversationId,
        role: 'user',
        content: 'Chain message 1',
      });
      const t2 = await insertTurn(mockDB, {
        projectId: testProjectId,
        conversationId: testConversationId,
        role: 'assistant',
        content: 'Chain message 2',
      });

      const res = await app.request(`/v1/turns/${encodeURIComponent(t2.turnHash)}/chain`);
      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.data.chain.length).toBeGreaterThanOrEqual(1);
    });
  });

  // =========================================================================
  // GET /v1/turns/:hash/context
  // =========================================================================
  describe('GET /v1/turns/:hash/context', () => {
    it('returns turn with context', async () => {
      const turn = await insertTurn(mockDB, {
        projectId: testProjectId,
        conversationId: testConversationId,
        role: 'user',
        content: 'Context target turn',
      });

      const res = await app.request(
        `/v1/turns/${encodeURIComponent(turn.turnHash)}/context?before=1&after=1`
      );
      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.data.target_turn).toBeDefined();
      expect(data.data.target_turn.is_target).toBe(true);
      expect(data.data.context.length).toBeGreaterThanOrEqual(1);
    });

    it('returns 404 for non-existent turn', async () => {
      const res = await app.request('/v1/turns/sha256:nonexistent/context');
      expect(res.status).toBe(404);
    });

    it('includes highlight info when provided', async () => {
      const turn = await insertTurn(mockDB, {
        projectId: testProjectId,
        conversationId: testConversationId,
        role: 'user',
        content: 'Highlight test content',
      });

      const res = await app.request(
        `/v1/turns/${encodeURIComponent(turn.turnHash)}/context?highlight_start=0&highlight_end=9`
      );
      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.data.target_turn.highlight).toEqual({ start: 0, end: 9 });
    });
  });
});
