import type { AnyDB } from '@t3x-dev/storage';
import { insertConversation, insertProject } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

let mockDB: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
}));

// Stub the actual extraction work — we only care about resolution here.
vi.mock('../lib/extraction-pipeline', () => ({
  runExtractionPipeline: vi.fn(async function* () {
    yield { type: 'done', data: { snapshot: { trees: [] }, yops_log_id: 'yops_test' } };
  }),
}));

import { treeExtractRoutes } from '../routes/tree-extract.openapi';

describe('POST /v1/extract/trees — alias resolution', () => {
  let cleanup: () => Promise<void>;
  let projectId: string;
  let conversationId: string;
  const app = new Hono();
  app.route('/', treeExtractRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;
    const project = await insertProject(mockDB, testData.project({ name: 'Alias Resolve' }));
    projectId = project.projectId;
    const conv = await insertConversation(mockDB, { projectId });
    conversationId = conv.conversationId;
    // Set an alias directly
    await mockDB.execute(
      `UPDATE conversations SET alias = 'tokyo_trip' WHERE conversation_id = '${conversationId}'`
    );
  });

  afterAll(async () => {
    await cleanup();
  });

  it('resolves a conv_ id without project_id', async () => {
    const res = await app.request('/v1/extract/trees', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ conversation_id: conversationId }),
    });
    expect(res.status).toBe(200);
  });

  it('resolves an alias when project_id is supplied', async () => {
    const res = await app.request('/v1/extract/trees', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ conversation_id: 'tokyo_trip', project_id: projectId }),
    });
    expect(res.status).toBe(200);
  });

  it('returns 400 MISSING_PROJECT_FOR_ALIAS when alias is given without project_id', async () => {
    const res = await app.request('/v1/extract/trees', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ conversation_id: 'tokyo_trip' }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('MISSING_PROJECT_FOR_ALIAS');
  });

  it('returns 404 when alias does not exist in the given project', async () => {
    const res = await app.request('/v1/extract/trees', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ conversation_id: 'nonexistent', project_id: projectId }),
    });
    expect(res.status).toBe(404);
  });
});
