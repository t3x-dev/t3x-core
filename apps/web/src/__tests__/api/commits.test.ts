/**
 * Commits API Route Tests
 *
 * Tests GET/POST /api/v1/commits endpoints.
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
import { GET, POST } from '@/app/api/v1/commits/route';

describe('Commits API Routes', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  let testConversationId: string;
  let turn1Hash: string;
  let turn2Hash: string;

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    // Create test project
    const project = await insertProject(mockDB, testData.project({ name: 'Test Project' }));
    testProjectId = project.projectId;

    // Create conversation and turns
    const conv = await insertConversation(mockDB, {
      projectId: testProjectId,
      title: 'Test Conversation',
    });
    testConversationId = conv.conversationId;

    const t1 = await insertTurn(mockDB, {
      projectId: testProjectId,
      conversationId: testConversationId,
      role: 'user',
      content: 'Hello',
    });
    turn1Hash = t1.turnHash;

    const t2 = await insertTurn(mockDB, {
      projectId: testProjectId,
      conversationId: testConversationId,
      role: 'assistant',
      content: 'Hi there!',
    });
    turn2Hash = t2.turnHash;

    // Create a branch
    await insertBranch(mockDB, {
      projectId: testProjectId,
      name: 'main',
    });

    // Create a commit
    await insertCommit(mockDB, {
      projectId: testProjectId,
      branch: 'main',
      message: 'Initial commit',
      turnWindow: {
        startTurnHash: turn1Hash,
        endTurnHash: turn2Hash,
      },
      facetSnapshot: [],
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('GET /api/v1/commits', () => {
    it('returns commits for a project', async () => {
      const request = new NextRequest(`http://localhost/api/v1/commits?project_id=${testProjectId}`);

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.commits.length).toBeGreaterThanOrEqual(1);
      expect(data.data.project_id).toBe(testProjectId);
    });

    it('filters by branch', async () => {
      const request = new NextRequest(`http://localhost/api/v1/commits?project_id=${testProjectId}&branch=main`);

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.branch).toBe('main');
      expect(data.data.commits.every((c: { branch: string }) => c.branch === 'main')).toBe(true);
    });

    it('returns 400 when project_id is missing', async () => {
      const request = new NextRequest('http://localhost/api/v1/commits');

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('INVALID_REQUEST');
    });

    it('respects limit and offset parameters', async () => {
      const request = new NextRequest(`http://localhost/api/v1/commits?project_id=${testProjectId}&limit=1`);

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.commits.length).toBeLessThanOrEqual(1);
      expect(data.data.limit).toBe(1);
    });
  });

  describe('POST /api/v1/commits', () => {
    it('creates a commit with turn_window', async () => {
      const request = new NextRequest('http://localhost/api/v1/commits', {
        method: 'POST',
        body: JSON.stringify({
          project_id: testProjectId,
          branch: 'main',
          message: 'New commit',
          turn_window: {
            start_turn_hash: turn1Hash,
            end_turn_hash: turn2Hash,
          },
          facet_snapshot: [{ facet: 'test' }],
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.commit_hash).toMatch(/^sha256:[a-f0-9]+$/);
      expect(data.data.branch).toBe('main');
      expect(data.data.message).toBe('New commit');
    });

    it('creates a merge commit with merge_parents', async () => {
      // First create another branch with a commit
      await insertBranch(mockDB, {
        projectId: testProjectId,
        name: 'feature',
      });
      const featureCommit = await insertCommit(mockDB, {
        projectId: testProjectId,
        branch: 'feature',
        message: 'Feature commit',
        turnWindow: {
          startTurnHash: turn1Hash,
          endTurnHash: turn1Hash,
        },
        facetSnapshot: [],
      });

      const mainCommit = await insertCommit(mockDB, {
        projectId: testProjectId,
        branch: 'main',
        message: 'Main commit',
        turnWindow: {
          startTurnHash: turn2Hash,
          endTurnHash: turn2Hash,
        },
        facetSnapshot: [],
      });

      const request = new NextRequest('http://localhost/api/v1/commits', {
        method: 'POST',
        body: JSON.stringify({
          project_id: testProjectId,
          branch: 'main',
          message: 'Merge feature into main',
          merge_parents: [mainCommit.commitHash, featureCommit.commitHash],
          facet_snapshot: [],
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
    });

    it('returns 400 when project_id is missing', async () => {
      const request = new NextRequest('http://localhost/api/v1/commits', {
        method: 'POST',
        body: JSON.stringify({
          turn_window: { start_turn_hash: turn1Hash, end_turn_hash: turn2Hash },
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('INVALID_REQUEST');
    });

    it('returns 400 when neither turn_window nor merge_parents is provided', async () => {
      const request = new NextRequest('http://localhost/api/v1/commits', {
        method: 'POST',
        body: JSON.stringify({
          project_id: testProjectId,
          branch: 'main',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.message).toContain('turn_window or merge_parents');
    });

    it('returns 400 when both turn_window and merge_parents are provided', async () => {
      const request = new NextRequest('http://localhost/api/v1/commits', {
        method: 'POST',
        body: JSON.stringify({
          project_id: testProjectId,
          branch: 'main',
          turn_window: { start_turn_hash: turn1Hash, end_turn_hash: turn2Hash },
          merge_parents: ['sha256:abc', 'sha256:def'],
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.message).toContain('Cannot specify both');
    });

    it('returns 404 when project does not exist', async () => {
      const request = new NextRequest('http://localhost/api/v1/commits', {
        method: 'POST',
        body: JSON.stringify({
          project_id: 'proj_nonexistent',
          turn_window: { start_turn_hash: turn1Hash, end_turn_hash: turn2Hash },
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error.code).toBe('NOT_FOUND');
    });

    it('returns 400 for invalid JSON', async () => {
      const request = new NextRequest('http://localhost/api/v1/commits', {
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
});
