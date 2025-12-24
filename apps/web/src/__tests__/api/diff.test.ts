/**
 * Diff API Route Tests
 *
 * Tests POST /api/v1/diff/two-way endpoint.
 * Note: Tests requiring embeddings are skipped as they need GOOGLE_AI_STUDIO_KEY.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { setupTestDB, testData } from '../setup';
import type { AnyDB } from '@t3x/storage';
import { insertProject, insertConversation, insertTurn, insertBranch, insertCommit } from '@t3x/storage';

// Mock the database module before importing routes
let mockDB: AnyDB;

vi.mock('@/lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
}));

// Import routes after mocking
import { POST as twoWayDiff } from '@/app/api/v1/diff/two-way/route';

describe('Diff API Routes', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  let testConversationId: string;
  let turn1Hash: string;
  let turn2Hash: string;
  let commit1Hash: string;
  let commit2Hash: string;

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

    // Create turns with rings data
    const t1 = await insertTurn(mockDB, {
      projectId: testProjectId,
      conversationId: testConversationId,
      role: 'user',
      content: 'Hello world',
      rings: {
        ring1: { keywords: [] },
        ring2: { facets: [] },
        ring3: { segments: [{ segmentId: 'seg1', text: 'Hello world' }] },
      },
    });
    turn1Hash = t1.turnHash;

    const t2 = await insertTurn(mockDB, {
      projectId: testProjectId,
      conversationId: testConversationId,
      role: 'assistant',
      content: 'Hi there',
      rings: {
        ring1: { keywords: [] },
        ring2: { facets: [] },
        ring3: { segments: [{ segmentId: 'seg2', text: 'Hi there' }] },
      },
    });
    turn2Hash = t2.turnHash;

    // Create branch and commits
    await insertBranch(mockDB, {
      projectId: testProjectId,
      name: 'main',
    });

    const c1 = await insertCommit(mockDB, {
      projectId: testProjectId,
      branch: 'main',
      message: 'Commit 1',
      turnWindow: {
        startTurnHash: turn1Hash,
        endTurnHash: turn1Hash,
      },
      facetSnapshot: [],
    });
    commit1Hash = c1.commitHash;

    const c2 = await insertCommit(mockDB, {
      projectId: testProjectId,
      branch: 'main',
      message: 'Commit 2',
      turnWindow: {
        startTurnHash: turn2Hash,
        endTurnHash: turn2Hash,
      },
      facetSnapshot: [],
    });
    commit2Hash = c2.commitHash;
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('POST /api/v1/diff/two-way - Validation', () => {
    it('returns 400 when no mode is specified', async () => {
      const request = new NextRequest('http://localhost/api/v1/diff/two-way', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await twoWayDiff(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('INVALID_REQUEST');
    });

    it('returns 400 for invalid JSON', async () => {
      const request = new NextRequest('http://localhost/api/v1/diff/two-way', {
        method: 'POST',
        body: 'not valid json',
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await twoWayDiff(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('INVALID_JSON');
    });

    it('returns 404 when base commit does not exist', async () => {
      const request = new NextRequest('http://localhost/api/v1/diff/two-way', {
        method: 'POST',
        body: JSON.stringify({
          base_commit_hash: 'sha256:nonexistent',
          target_commit_hash: commit2Hash,
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await twoWayDiff(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 when target commit does not exist', async () => {
      const request = new NextRequest('http://localhost/api/v1/diff/two-way', {
        method: 'POST',
        body: JSON.stringify({
          base_commit_hash: commit1Hash,
          target_commit_hash: 'sha256:nonexistent',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await twoWayDiff(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 when base turn does not exist', async () => {
      const request = new NextRequest('http://localhost/api/v1/diff/two-way', {
        method: 'POST',
        body: JSON.stringify({
          baseTurnHash: 'sha256:nonexistent',
          targetTurnHash: turn2Hash,
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await twoWayDiff(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 when target turn does not exist', async () => {
      const request = new NextRequest('http://localhost/api/v1/diff/two-way', {
        method: 'POST',
        body: JSON.stringify({
          baseTurnHash: turn1Hash,
          targetTurnHash: 'sha256:nonexistent',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await twoWayDiff(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error.code).toBe('NOT_FOUND');
    });

    it('returns 503 when GOOGLE_AI_STUDIO_KEY is not configured', async () => {
      // Clear env var to test missing key
      const originalKey = process.env.GOOGLE_AI_STUDIO_KEY;
      delete process.env.GOOGLE_AI_STUDIO_KEY;

      const request = new NextRequest('http://localhost/api/v1/diff/two-way', {
        method: 'POST',
        body: JSON.stringify({
          baseTurnHash: turn1Hash,
          targetTurnHash: turn2Hash,
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await twoWayDiff(request);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.error.code).toBe('EMBEDDING_UNAVAILABLE');

      // Restore env var
      if (originalKey) {
        process.env.GOOGLE_AI_STUDIO_KEY = originalKey;
      }
    });

    it('accepts legacy mode with direct segments', async () => {
      // Clear env var to test (will fail at embedding step)
      const originalKey = process.env.GOOGLE_AI_STUDIO_KEY;
      delete process.env.GOOGLE_AI_STUDIO_KEY;

      const request = new NextRequest('http://localhost/api/v1/diff/two-way', {
        method: 'POST',
        body: JSON.stringify({
          baseId: 'base',
          baseSegments: [{ segmentId: 's1', text: 'Hello' }],
          targetId: 'target',
          targetSegments: [{ segmentId: 's2', text: 'World' }],
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await twoWayDiff(request);
      const data = await response.json();

      // Should fail at embedding step since key not configured
      expect(response.status).toBe(503);
      expect(data.error.code).toBe('EMBEDDING_UNAVAILABLE');

      // Restore env var
      if (originalKey) {
        process.env.GOOGLE_AI_STUDIO_KEY = originalKey;
      }
    });
  });
});
