import type { AnyDB } from '@t3x-dev/storage';
import { insertProject } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { recipesRoutes } from '../routes/recipes.openapi';
import { setupTestDB, testData } from './setup';

let db: AnyDB;
vi.mock('../lib/db', () => ({ getDB: vi.fn(() => Promise.resolve(db)) }));

describe('Recipe webhook target', () => {
  const app = new Hono();
  app.route('/', recipesRoutes);
  let cleanup: () => Promise<void>;
  let projectId: string;

  beforeAll(async () => {
    const setup = await setupTestDB();
    db = setup.db;
    cleanup = setup.cleanup;
    projectId = (await insertProject(db, testData.project({ name: 'Recipe target' }))).projectId;
  });
  afterAll(async () => cleanup());

  it('requires a valid URL before creating an enabled webhook recipe', async () => {
    const path = `/v1/projects/${projectId}/recipes`;
    const request = (url?: string) =>
      app.request(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Notify',
          trigger: { event: 'commit.created' },
          steps: [{ action: 'send_webhook', config: url ? { url } : {} }],
          enabled: true,
        }),
      });
    expect((await request()).status).toBe(400);
    expect((await request('file:///tmp/target')).status).toBe(400);
    expect((await request('https://example.com/hook')).status).toBe(201);
  });
});
