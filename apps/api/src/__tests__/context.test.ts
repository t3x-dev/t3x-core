/**
 * Context Route Tests
 *
 * Integration tests for GET /v1/projects/:id/context endpoint.
 */

import type { AnyDB } from '@t3x-dev/storage';
import { createCommit, insertProject } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

// biome-ignore lint/suspicious/noExplicitAny: test helper
type ApiResponse = any;

// Mock the database module before importing routes
let mockDB: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

// Import routes after mocking
import { contextRoutes } from '../routes/context.openapi';

describe('Context Routes', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  let emptyProjectId: string;
  const app = new Hono();
  app.route('/', contextRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    // Create test projects
    const project = await insertProject(mockDB, testData.project({ name: 'Context Test Project' }));
    testProjectId = project.projectId;

    const emptyProject = await insertProject(
      mockDB,
      testData.project({ name: 'Empty Context Project' })
    );
    emptyProjectId = emptyProject.projectId;

    // Create commits on main branch
    await createCommit(mockDB, {
      parents: [],
      author: { type: 'human', id: 'user_1', name: 'Test User' },
      content: {
        frames: [
          {
            id: 'f_001',
            type: 'preference',
            slots: { topic: 'cats', sentiment: 'positive' },
            confidence: 0.9,
          },
        ],
        relations: [],
      },
      project_id: testProjectId,
      message: 'First commit',
      branch: 'main',
    });

    // Create a newer commit on main (this should be the latest)
    await createCommit(mockDB, {
      parents: [],
      author: { type: 'human', id: 'user_1', name: 'Test User' },
      content: {
        frames: [
          {
            id: 'f_001',
            type: 'preference',
            slots: { topic: 'cats', sentiment: 'positive' },
            confidence: 0.9,
          },
          {
            id: 'f_002',
            type: 'fact',
            slots: { subject: 'user', predicate: 'lives_in', object: 'Tokyo' },
            confidence: 0.85,
          },
        ],
        relations: [],
      },
      project_id: testProjectId,
      message: 'Second commit on main',
      branch: 'main',
    });

    // Create a commit on a different branch
    await createCommit(mockDB, {
      parents: [],
      author: { type: 'human', id: 'user_1', name: 'Test User' },
      content: {
        frames: [
          {
            id: 'f_010',
            type: 'opinion',
            slots: { topic: 'dogs', stance: 'neutral' },
            confidence: 0.75,
          },
        ],
        relations: [],
      },
      project_id: testProjectId,
      message: 'Commit on dev branch',
      branch: 'dev',
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('GET /v1/projects/:id/context', () => {
    it('returns sentences from latest commit on main branch (happy path)', async () => {
      const res = await app.request(`/v1/projects/${testProjectId}/context`);

      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.branch).toBe('main');
      expect(data.data.commit_hash).toBeTruthy();
      // The latest commit on main has 2 frames
      expect(data.data.sentences).toHaveLength(2);
      expect(data.data.sentences[0].id).toBe('f_001');
      expect(data.data.sentences[0].text).toBeTruthy();
      expect(data.data.sentences[0].confidence).toBe(0.9);
      expect(data.data.sentences[1].id).toBe('f_002');
      expect(data.data.sentences[1].confidence).toBe(0.85);
    });

    it('returns empty when project has no commits', async () => {
      const res = await app.request(`/v1/projects/${emptyProjectId}/context`);

      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.commit_hash).toBeNull();
      expect(data.data.branch).toBe('main');
      expect(data.data.sentences).toEqual([]);
    });

    it('respects branch parameter', async () => {
      const res = await app.request(`/v1/projects/${testProjectId}/context?branch=dev`);

      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.branch).toBe('dev');
      expect(data.data.commit_hash).toBeTruthy();
      expect(data.data.sentences).toHaveLength(1);
      expect(data.data.sentences[0].id).toBe('f_010');
    });

    it('returns yaml format when requested', async () => {
      const res = await app.request(`/v1/projects/${testProjectId}/context?format=yaml`);

      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.yaml).toBeTruthy();
      expect(typeof data.data.yaml).toBe('string');
      expect(data.data.yaml).toContain('sentences:');
      expect(data.data.yaml).toContain('f_001');
      // Sentences array is still returned alongside yaml
      expect(data.data.sentences).toHaveLength(2);
    });
  });
});
