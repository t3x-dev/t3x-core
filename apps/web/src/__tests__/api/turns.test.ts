/**
 * Turns API Route Tests
 *
 * Tests GET /api/v1/turns and POST /api/v1/turns endpoints.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { setupTestDB, testData } from '../setup';
import type { AnyDB } from '@t3x/storage';
import { insertProject, insertConversation, insertTurn, findTurnsByConversation, findTurnByHash } from '@t3x/storage';
import { computeTurnHash } from '@t3x/core';

// Mock the database module before importing routes
let mockDB: AnyDB;
let testProjectId: string;
let testConversationId: string;

vi.mock('@/lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
}));

// Import routes after mocking
import { GET, POST } from '@/app/api/v1/turns/route';

describe('Turns API Routes', () => {
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    // Create test project and conversation
    const project = await insertProject(mockDB, testData.project({ name: 'Turns Test Project' }));
    testProjectId = project.projectId;

    const conv = await insertConversation(mockDB, testData.conversation(testProjectId, { title: 'Turns Test Chat' }));
    testConversationId = conv.conversationId;

    // Create some test turns
    await insertTurn(mockDB, testData.turn(testProjectId, testConversationId, { role: 'user', content: 'Hello' }));
    await insertTurn(mockDB, testData.turn(testProjectId, testConversationId, { role: 'assistant', content: 'Hi there!' }));
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('GET /api/v1/turns', () => {
    it('returns 400 when conversation_id is missing', async () => {
      const request = new NextRequest('http://localhost/api/v1/turns');

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_REQUEST');
    });

    it('returns list of turns for a conversation', async () => {
      const request = new NextRequest(`http://localhost/api/v1/turns?conversation_id=${testConversationId}`);

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.turns).toBeDefined();
      expect(Array.isArray(data.data.turns)).toBe(true);
      expect(data.data.turns.length).toBe(2);
    });

    it('returns turns with correct field names (snake_case)', async () => {
      const request = new NextRequest(`http://localhost/api/v1/turns?conversation_id=${testConversationId}`);

      const response = await GET(request);
      const data = await response.json();

      const turn = data.data.turns[0];
      expect(turn.turn_hash).toBeDefined();
      expect(turn.conversation_id).toBe(testConversationId);
      expect(turn.project_id).toBe(testProjectId);
      expect(turn.created_at).toBeDefined();
    });

    it('respects order parameter (asc)', async () => {
      const request = new NextRequest(`http://localhost/api/v1/turns?conversation_id=${testConversationId}&order=asc`);

      const response = await GET(request);
      const data = await response.json();

      expect(data.data.order).toBe('asc');
      expect(data.data.turns[0].content).toBe('Hello'); // User message first
    });

    it('respects order parameter (desc)', async () => {
      const request = new NextRequest(`http://localhost/api/v1/turns?conversation_id=${testConversationId}&order=desc`);

      const response = await GET(request);
      const data = await response.json();

      expect(data.data.order).toBe('desc');
      expect(data.data.turns[0].content).toBe('Hi there!'); // Assistant message first
    });

    it('respects limit parameter', async () => {
      const request = new NextRequest(`http://localhost/api/v1/turns?conversation_id=${testConversationId}&limit=1`);

      const response = await GET(request);
      const data = await response.json();

      expect(data.data.turns.length).toBe(1);
      expect(data.data.limit).toBe(1);
    });
  });

  describe('POST /api/v1/turns', () => {
    it('creates a new turn', async () => {
      const request = new NextRequest('http://localhost/api/v1/turns', {
        method: 'POST',
        body: JSON.stringify({
          project_id: testProjectId,
          conversation_id: testConversationId,
          role: 'user',
          content: 'New message',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.content).toBe('New message');
      expect(data.data.role).toBe('user');
      expect(data.data.turn_hash).toMatch(/^sha256:[a-f0-9]+$/);
    });

    it('creates turn with language', async () => {
      const request = new NextRequest('http://localhost/api/v1/turns', {
        method: 'POST',
        body: JSON.stringify({
          project_id: testProjectId,
          conversation_id: testConversationId,
          role: 'user',
          content: 'Bonjour!',
          language: 'fr',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.data.language).toBe('fr');
    });

    it('creates turn with rings', async () => {
      const rings = { ring1: { keywords: ['test'] } };
      const request = new NextRequest('http://localhost/api/v1/turns', {
        method: 'POST',
        body: JSON.stringify({
          project_id: testProjectId,
          conversation_id: testConversationId,
          role: 'assistant',
          content: 'Response with rings',
          rings,
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.data.rings).toEqual(rings);
    });

    it('returns 400 when required fields are missing', async () => {
      const request = new NextRequest('http://localhost/api/v1/turns', {
        method: 'POST',
        body: JSON.stringify({ role: 'user', content: 'Missing ids' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_REQUEST');
    });

    it('returns 400 for invalid role', async () => {
      const request = new NextRequest('http://localhost/api/v1/turns', {
        method: 'POST',
        body: JSON.stringify({
          project_id: testProjectId,
          conversation_id: testConversationId,
          role: 'invalid',
          content: 'Test',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('INVALID_REQUEST');
    });

    it('returns 404 when conversation does not exist', async () => {
      const request = new NextRequest('http://localhost/api/v1/turns', {
        method: 'POST',
        body: JSON.stringify({
          project_id: testProjectId,
          conversation_id: 'conv_nonexistent',
          role: 'user',
          content: 'Test',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error.code).toBe('NOT_FOUND');
    });

    it('returns 400 when project does not match conversation', async () => {
      const otherProject = await insertProject(mockDB, testData.project({ name: 'Other Project' }));

      const request = new NextRequest('http://localhost/api/v1/turns', {
        method: 'POST',
        body: JSON.stringify({
          project_id: otherProject.projectId,
          conversation_id: testConversationId,
          role: 'user',
          content: 'Mismatched',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('INVALID_REQUEST');
    });

    it('stores turn in database with parent hash chain', async () => {
      // Get current turns count
      const before = await findTurnsByConversation(mockDB, { conversationId: testConversationId });

      const request = new NextRequest('http://localhost/api/v1/turns', {
        method: 'POST',
        body: JSON.stringify({
          project_id: testProjectId,
          conversation_id: testConversationId,
          role: 'user',
          content: 'Chain test',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      // Verify in database
      const after = await findTurnsByConversation(mockDB, { conversationId: testConversationId });
      expect(after.length).toBe(before.length + 1);

      // Verify parent hash points to previous turn
      expect(data.data.parent_turn_hash).toBeDefined();
    });

    it('verifies hash consistency between API response, core computation, and database', async () => {
      // Create a new turn via API
      const content = 'Hash consistency test message';
      const request = new NextRequest('http://localhost/api/v1/turns', {
        method: 'POST',
        body: JSON.stringify({
          project_id: testProjectId,
          conversation_id: testConversationId,
          role: 'user',
          content,
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();
      expect(response.status).toBe(201);

      const apiTurnHash = data.data.turn_hash;

      // Verify hash exists in database
      const dbTurn = await findTurnByHash(mockDB, apiTurnHash);
      expect(dbTurn).not.toBeNull();
      expect(dbTurn!.turnHash).toBe(apiTurnHash);

      // Recompute hash using @t3x/core and verify consistency
      const recomputedHash = computeTurnHash({
        parent_turn_hash: data.data.parent_turn_hash,
        project_id: data.data.project_id,
        conversation_id: data.data.conversation_id,
        role: data.data.role,
        content: data.data.content,
        language: data.data.language,
        rings_json: data.data.rings ? JSON.stringify(data.data.rings) : null,
        created_at: data.data.created_at,
      });

      // All three should match: API response == DB record == Core recomputation
      expect(apiTurnHash).toBe(recomputedHash);
      expect(dbTurn!.turnHash).toBe(recomputedHash);
    });
  });
});
