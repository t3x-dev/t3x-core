/**
 * Individual Turn API Route Tests
 *
 * Tests GET /api/v1/turns/:hash and GET /api/v1/turns/:hash/chain endpoints.
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
import { GET as getTurn } from '@/app/api/v1/turns/[hash]/route';
import { GET as getTurnChain } from '@/app/api/v1/turns/[hash]/chain/route';

describe('Turns [hash] API Routes', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  let testConversationId: string;
  let turn1Hash: string;
  let turn2Hash: string;
  let turn3Hash: string;

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

    // Create a chain of turns
    const t1 = await insertTurn(mockDB, {
      projectId: testProjectId,
      conversationId: testConversationId,
      role: 'user',
      content: 'First message',
    });
    turn1Hash = t1.turnHash;

    const t2 = await insertTurn(mockDB, {
      projectId: testProjectId,
      conversationId: testConversationId,
      role: 'assistant',
      content: 'Second message',
    });
    turn2Hash = t2.turnHash;

    const t3 = await insertTurn(mockDB, {
      projectId: testProjectId,
      conversationId: testConversationId,
      role: 'user',
      content: 'Third message',
    });
    turn3Hash = t3.turnHash;
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('GET /api/v1/turns/:hash', () => {
    it('returns turn by hash', async () => {
      const request = new NextRequest(`http://localhost/api/v1/turns/${encodeURIComponent(turn1Hash)}`);
      const params = Promise.resolve({ hash: turn1Hash });

      const response = await getTurn(request, { params });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.turn_hash).toBe(turn1Hash);
      expect(data.data.content).toBe('First message');
      expect(data.data.role).toBe('user');
      expect(data.data.project_id).toBe(testProjectId);
      expect(data.data.conversation_id).toBe(testConversationId);
    });

    it('returns turn with null parent for first turn', async () => {
      const request = new NextRequest(`http://localhost/api/v1/turns/${encodeURIComponent(turn1Hash)}`);
      const params = Promise.resolve({ hash: turn1Hash });

      const response = await getTurn(request, { params });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.parent_turn_hash).toBeNull();
    });

    it('returns turn with parent hash for subsequent turn', async () => {
      const request = new NextRequest(`http://localhost/api/v1/turns/${encodeURIComponent(turn2Hash)}`);
      const params = Promise.resolve({ hash: turn2Hash });

      const response = await getTurn(request, { params });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.parent_turn_hash).toBe(turn1Hash);
    });

    it('returns 404 for non-existent turn', async () => {
      const fakeHash = 'sha256:0000000000000000000000000000000000000000000000000000000000000000';
      const request = new NextRequest(`http://localhost/api/v1/turns/${encodeURIComponent(fakeHash)}`);
      const params = Promise.resolve({ hash: fakeHash });

      const response = await getTurn(request, { params });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('NOT_FOUND');
    });

    it('handles URL-encoded hash correctly', async () => {
      // The hash contains colons which might be encoded
      const encodedHash = encodeURIComponent(turn1Hash);
      const request = new NextRequest(`http://localhost/api/v1/turns/${encodedHash}`);
      const params = Promise.resolve({ hash: encodedHash });

      const response = await getTurn(request, { params });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.turn_hash).toBe(turn1Hash);
    });
  });

  describe('GET /api/v1/turns/:hash/chain', () => {
    it('returns full chain ending at the given turn', async () => {
      const request = new NextRequest(`http://localhost/api/v1/turns/${encodeURIComponent(turn3Hash)}/chain`);
      const params = Promise.resolve({ hash: turn3Hash });

      const response = await getTurnChain(request, { params });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.chain).toHaveLength(3);
      expect(data.data.end_turn_hash).toBe(turn3Hash);

      // Chain should be in chronological order (oldest first)
      expect(data.data.chain[0].turn_hash).toBe(turn1Hash);
      expect(data.data.chain[1].turn_hash).toBe(turn2Hash);
      expect(data.data.chain[2].turn_hash).toBe(turn3Hash);
    });

    it('returns single-item chain for first turn', async () => {
      const request = new NextRequest(`http://localhost/api/v1/turns/${encodeURIComponent(turn1Hash)}/chain`);
      const params = Promise.resolve({ hash: turn1Hash });

      const response = await getTurnChain(request, { params });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.chain).toHaveLength(1);
      expect(data.data.chain[0].turn_hash).toBe(turn1Hash);
    });

    it('respects limit parameter', async () => {
      const request = new NextRequest(`http://localhost/api/v1/turns/${encodeURIComponent(turn3Hash)}/chain?limit=2`);
      const params = Promise.resolve({ hash: turn3Hash });

      const response = await getTurnChain(request, { params });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.chain.length).toBeLessThanOrEqual(2);
    });

    it('returns chain with all turn fields', async () => {
      const request = new NextRequest(`http://localhost/api/v1/turns/${encodeURIComponent(turn1Hash)}/chain`);
      const params = Promise.resolve({ hash: turn1Hash });

      const response = await getTurnChain(request, { params });
      const data = await response.json();

      const turn = data.data.chain[0];
      expect(turn.turn_hash).toBeDefined();
      expect(turn.project_id).toBeDefined();
      expect(turn.conversation_id).toBeDefined();
      expect(turn.role).toBeDefined();
      expect(turn.content).toBeDefined();
      expect(turn.created_at).toBeDefined();
    });
  });
});
