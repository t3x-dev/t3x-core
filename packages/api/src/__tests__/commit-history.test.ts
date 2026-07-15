import type { AnyDB } from '@t3x-dev/storage';
import { createCommit, insertProject } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

let mockDB: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

import { commitRoutes } from '../routes/commits.openapi';

describe('Commit history route', () => {
  let cleanup: () => Promise<void>;
  let projectId: string;
  const app = new Hono();
  app.route('/', commitRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;
    const project = await insertProject(mockDB, testData.project({ name: 'Commit History Test' }));
    projectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  async function createHistoryCommit(label: string, parents: string[] = []) {
    return createCommit(mockDB, {
      project_id: projectId,
      parents,
      author: { type: 'human', name: 'History Test User' },
      message: label,
      branch: 'main',
      content: {
        trees: [{ key: `node_${label}`, slots: { label }, children: [] }],
        relations: [],
      },
    });
  }

  async function getHistory(hash: string, limit: number) {
    const response = await app.request(
      `/v1/commits/${encodeURIComponent(hash)}/history?limit=${limit}`
    );
    expect(response.status).toBe(200);
    return response.json() as Promise<{
      success: true;
      data: { commits: Array<{ hash: string }>; truncated: boolean };
    }>;
  }

  it('does not report truncation when the root exactly fills the limit', async () => {
    const root = await createHistoryCommit('root_exact_limit');

    const body = await getHistory(root.hash, 1);

    expect(body.data.commits.map((commit) => commit.hash)).toEqual([root.hash]);
    expect(body.data.truncated).toBe(false);
  });

  it('reports truncation only while a linear ancestor remains', async () => {
    const root = await createHistoryCommit('linear_root');
    const child = await createHistoryCommit('linear_child', [root.hash]);

    expect((await getHistory(child.hash, 1)).data.truncated).toBe(true);

    const complete = await getHistory(child.hash, 2);
    expect(complete.data.commits.map((commit) => commit.hash)).toEqual([child.hash, root.hash]);
    expect(complete.data.truncated).toBe(false);
  });

  it('queues a shared merge ancestor once at an exact page boundary', async () => {
    const root = await createHistoryCommit('diamond_root');
    const left = await createHistoryCommit('diamond_left', [root.hash]);
    const right = await createHistoryCommit('diamond_right', [root.hash]);
    const merge = await createHistoryCommit('diamond_merge', [left.hash, right.hash]);

    const body = await getHistory(merge.hash, 4);

    expect(body.data.commits.map((commit) => commit.hash)).toEqual([
      merge.hash,
      left.hash,
      right.hash,
      root.hash,
    ]);
    expect(body.data.truncated).toBe(false);
  });

  it('returns 404 for an unknown starting commit', async () => {
    const response = await app.request('/v1/commits/sha256%3Amissing_history/history?limit=1');

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: 'COMMIT_NOT_FOUND' },
    });
  });
});
