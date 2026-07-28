import type { AnyDB } from '@t3x-dev/storage';
import { insertProject, listCommitHistory } from '@t3x-dev/storage';
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
