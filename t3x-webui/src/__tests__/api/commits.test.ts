/**
 * Commits API Route Tests
 *
 * Tests GET /api/v1/commits and POST /api/v1/commits endpoints.
 * Verifies commit creation, database storage, and branch head updates.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { setupTestDB, testData } from '../setup';
import type { AnyDB } from '@t3x/storage';
import {
  insertProject,
  insertConversation,
  insertTurn,
  findCommitByHash,
  findBranchByName,
} from '@t3x/storage';

// Mock the database module before importing routes
let mockDB: AnyDB;
let testProjectId: string;
let testConversationId: string;
let startTurnHash: string;
let endTurnHash: string;

vi.mock('@/lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
}));

// Import routes after mocking
import { GET, POST } from '@/app/api/v1/commits/route';

describe('Commits API Routes', () => {
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    // Create test project
    const project = await insertProject(mockDB, testData.project({ name: 'Commits Test Project' }));
    testProjectId = project.projectId;

    // Create test conversation
    const conv = await insertConversation(mockDB, testData.conversation(testProjectId, { title: 'Commits Test Chat' }));
    testConversationId = conv.conversationId;

    // Create test turns for turn_window
    const turn1 = await insertTurn(mockDB, testData.turn(testProjectId, testConversationId, { role: 'user', content: 'First message' }));
    startTurnHash = turn1.turnHash;

    const turn2 = await insertTurn(mockDB, testData.turn(testProjectId, testConversationId, { role: 'assistant', content: 'Response message' }));
    endTurnHash = turn2.turnHash;
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('GET /api/v1/commits', () => {
    it('returns 400 when project_id is missing', async () => {
      const request = new NextRequest('http://localhost/api/v1/commits');

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_REQUEST');
    });

    it('returns empty list for project with no commits', async () => {
      const request = new NextRequest(`http://localhost/api/v1/commits?project_id=${testProjectId}`);

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.commits).toEqual([]);
    });
  });

  describe('POST /api/v1/commits', () => {
    it('returns 400 when project_id is missing', async () => {
      const request = new NextRequest('http://localhost/api/v1/commits', {
        method: 'POST',
        body: JSON.stringify({
          turn_window: { start_turn_hash: startTurnHash, end_turn_hash: endTurnHash },
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('INVALID_REQUEST');
    });

    it('returns 400 when neither turn_window nor merge_parents provided', async () => {
      const request = new NextRequest('http://localhost/api/v1/commits', {
        method: 'POST',
        body: JSON.stringify({
          project_id: testProjectId,
          message: 'Test commit',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('INVALID_REQUEST');
      expect(data.error.message).toContain('turn_window or merge_parents');
    });

    it('returns 404 when project does not exist', async () => {
      const request = new NextRequest('http://localhost/api/v1/commits', {
        method: 'POST',
        body: JSON.stringify({
          project_id: 'proj_nonexistent',
          turn_window: { start_turn_hash: startTurnHash, end_turn_hash: endTurnHash },
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error.code).toBe('NOT_FOUND');
    });

    it('creates commit with turn_window', async () => {
      const request = new NextRequest('http://localhost/api/v1/commits', {
        method: 'POST',
        body: JSON.stringify({
          project_id: testProjectId,
          branch: 'main',
          message: 'Test commit with turn window',
          turn_window: {
            start_turn_hash: startTurnHash,
            end_turn_hash: endTurnHash,
          },
          facet_snapshot: [{ type: 'preference', value: 'test' }],
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.commit_hash).toMatch(/^sha256:[a-f0-9]+$/);
      expect(data.data.branch).toBe('main');
      expect(data.data.message).toBe('Test commit with turn window');
    });

    it('stores commit in database', async () => {
      const request = new NextRequest('http://localhost/api/v1/commits', {
        method: 'POST',
        body: JSON.stringify({
          project_id: testProjectId,
          message: 'DB verification commit',
          turn_window: {
            start_turn_hash: startTurnHash,
            end_turn_hash: endTurnHash,
          },
          facet_snapshot: [],
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);

      // Verify commit exists in database
      const dbCommit = await findCommitByHash(mockDB, data.data.commit_hash);
      expect(dbCommit).not.toBeNull();
      expect(dbCommit!.commitHash).toBe(data.data.commit_hash);
      expect(dbCommit!.message).toBe('DB verification commit');
    });

    it('updates branch head after commit', async () => {
      const request = new NextRequest('http://localhost/api/v1/commits', {
        method: 'POST',
        body: JSON.stringify({
          project_id: testProjectId,
          branch: 'main',
          message: 'Branch head update commit',
          turn_window: {
            start_turn_hash: startTurnHash,
            end_turn_hash: endTurnHash,
          },
          facet_snapshot: [],
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);

      // Verify branch head is updated
      const branch = await findBranchByName(mockDB, testProjectId, 'main');
      expect(branch).not.toBeNull();
      expect(branch!.headCommitHash).toBe(data.data.commit_hash);
    });

    it('returns commits list after creation', async () => {
      const listRequest = new NextRequest(`http://localhost/api/v1/commits?project_id=${testProjectId}`);

      const response = await GET(listRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.commits.length).toBeGreaterThan(0);
      expect(data.data.commits[0].commit_hash).toMatch(/^sha256:[a-f0-9]+$/);
    });
  });
});
