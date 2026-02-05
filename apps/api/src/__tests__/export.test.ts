/**
 * Export Routes Tests
 */

import {
  deleteProject,
  findProjects,
  insertConversation,
  insertProject,
  insertTurn,
} from '@t3x/storage';
import type { PGLiteDB } from '@t3x/storage/pglite';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

type ApiResponse = Record<string, unknown>;

let mockDB: PGLiteDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

import { exportRoutes } from '../routes/export';

describe('Export Routes', () => {
  let cleanup: () => Promise<void>;
  let projectId: string;
  const app = new Hono();
  app.route('/', exportRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    const existing = await findProjects(mockDB, {});
    for (const p of existing) {
      await deleteProject(mockDB, p.projectId);
    }
    // Create fresh project with data
    const proj = await insertProject(mockDB, testData.project({ name: 'Export Test' }));
    projectId = proj.projectId;
    const conv = await insertConversation(mockDB, testData.conversation(projectId));
    await insertTurn(
      mockDB,
      testData.turn(projectId, conv.conversationId, {
        role: 'user',
        content: 'Hello, budget is $3000',
      })
    );
  });

  describe('GET /v1/export/cfpack', () => {
    it('returns 400 without project_id', async () => {
      const res = await app.request('/v1/export/cfpack');
      expect(res.status).toBe(400);
    });

    it('returns 404 for non-existent project', async () => {
      const res = await app.request('/v1/export/cfpack?project_id=proj_nonexistent');
      expect(res.status).toBe(404);
    });

    it('exports cfpack with correct structure', async () => {
      const res = await app.request(`/v1/export/cfpack?project_id=${projectId}`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/vnd.t3x.cfpack+json');
      expect(res.headers.get('content-disposition')).toContain('.cfpack');

      const data = await res.json();
      expect(data.version).toBe('1.0.0');
      expect(data.project.project_id).toBe(projectId);
      expect(data.project.name).toBe('Export Test');
      expect(data.turns).toBeInstanceOf(Array);
      expect(data.turns.length).toBeGreaterThanOrEqual(1);
      expect(data.findings).toBeDefined();
      expect(data.hash).toBeDefined();
      expect(data.hash.algorithm).toBe('sha256-jcs-v1');
      expect(data.meta.exported_by).toContain('t3x-api');
    });

    it('includes turn data', async () => {
      const res = await app.request(`/v1/export/cfpack?project_id=${projectId}`);
      const data = await res.json();
      const turn = data.turns[0];
      expect(turn.turn_hash).toBeDefined();
      expect(turn.role).toBe('user');
      expect(turn.content).toContain('$3000');
    });
  });

  describe('GET /v1/export/ledger', () => {
    it('returns 400 without project_id', async () => {
      const res = await app.request('/v1/export/ledger');
      expect(res.status).toBe(400);
    });

    it('returns 404 for non-existent project', async () => {
      const res = await app.request('/v1/export/ledger?project_id=proj_nonexistent');
      expect(res.status).toBe(404);
    });

    it('exports ledger as JSONL', async () => {
      const res = await app.request(`/v1/export/ledger?project_id=${projectId}`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/x-ndjson');
      expect(res.headers.get('content-disposition')).toContain('.jsonl');

      const text = await res.text();
      const lines = text.trim().split('\n');
      expect(lines.length).toBeGreaterThanOrEqual(2); // project + at least 1 turn

      const projectLine = JSON.parse(lines[0]);
      expect(projectLine.type).toBe('project');
      expect(projectLine.project_id).toBe(projectId);

      // Should have conversation and turn lines
      const types = lines.map((l: string) => JSON.parse(l).type);
      expect(types).toContain('project');
      expect(types).toContain('conversation');
      expect(types).toContain('turn');
    });
  });
});
