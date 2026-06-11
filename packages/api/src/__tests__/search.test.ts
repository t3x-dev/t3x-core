import type { AnyDB } from '@t3x-dev/storage';
import { insertKnowledgeNode, insertProject } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { searchRoutes } from '../routes/search.openapi';
import { setupTestDB, testData } from './setup';

let mockDB: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
}));

describe('Search Route', () => {
  const app = new Hono();
  app.route('/', searchRoutes);
  let cleanup: () => Promise<void>;
  let projectId: string;

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;
    const project = await insertProject(mockDB, testData.project({ name: 'Search Route Test' }));
    projectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  it('returns tree-based state index matches', async () => {
    await insertKnowledgeNode(mockDB, {
      project_id: projectId,
      label: 'refund policy',
      member_count: 3,
    });

    const res = await app.request('/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        query: 'refund policy',
        mode: 'hybrid',
      }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: {
        mode: 'hybrid',
        nodes: [
          expect.objectContaining({
            project_id: projectId,
            label: 'refund policy',
          }),
        ],
        count: 1,
      },
    });
  });
});
