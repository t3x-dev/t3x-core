import type { AnyDB } from '@t3x-dev/storage';
import { createCommit, insertProject, listCommitHistory } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

let mockDB: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

vi.mock('@t3x-dev/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@t3x-dev/storage')>();
  return { ...actual, listCommitHistory: vi.fn(actual.listCommitHistory) };
});

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

describe('mixed commit history route', () => {
  const app = new Hono();
  app.route('/', commitRoutes);
  let cleanup: () => Promise<void>;
  let projectId: string;

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;
    const project = await insertProject(mockDB, testData.project({ name: 'History API' }));
    projectId = project.projectId;
  });

  afterAll(async () => cleanup());

  it('returns explicit legacy and transition projections without fabricating assurance', async () => {
    vi.mocked(listCommitHistory).mockResolvedValueOnce([
      {
        format: 'legacy_v1',
        id: `sha256:${'a'.repeat(64)}`,
        schema: 't3x/commit',
        parents: [],
        recordedAt: '2026-01-01T00:00:00.000Z',
        result: { mode: 'legacy_content', content: { trees: [], relations: [] } },
        assurance: {
          mode: 'legacy_unavailable',
          unavailable: ['proposal', 'evidence', 'replay', 'validation', 'decision'],
        },
      },
      {
        format: 'transition_v2',
        id: `sha256:${'b'.repeat(64)}`,
        schema: 't3x/commit/v2',
        parents: [],
        recordedAt: '2026-07-28T00:00:00.000Z',
        result: {
          mode: 'state_descriptor',
          descriptor: {
            kind: 'state',
            schema: 't3x/state/v1',
            digest: `sha256:${'c'.repeat(64)}`,
          },
        },
        assurance: {
          mode: 'decision_bound',
          decision: {
            kind: 'statement',
            schema: 't3x/statement/v1',
            digest: `sha256:${'d'.repeat(64)}`,
          },
        },
      },
    ]);

    const response = await app.request(`/v1/projects/${projectId}/commit-history`);
    const body = (await response.json()) as {
      success: boolean;
      data: { history: Array<Record<string, unknown>> };
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.history.map((entry) => entry.format)).toEqual(['legacy_v1', 'transition_v2']);
    expect(body.data.history[0]).not.toHaveProperty('decision');
  });
});
