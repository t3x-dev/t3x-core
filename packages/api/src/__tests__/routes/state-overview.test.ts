import { StateOverviewSchema } from '@t3x-dev/api-client';
import { createYOpsState } from '@t3x-dev/core';
import {
  type AnyDB,
  ensureMainBranch,
  findStatePresentation,
  insertProject,
} from '@t3x-dev/storage';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { statePresentations } from '../../../../storage/src/schema-presentations';
import { projectGrants } from '../../../../storage/src/schema-trees';
import { commitRepositoryYOpsState } from '../../lib/repository-state-transition';
import { setupTestDB, testData } from '../setup';

let mockDB: AnyDB;
vi.mock('../../lib/db', () => ({ getDB: vi.fn(() => Promise.resolve(mockDB)) }));

import { commitRoutes } from '../../routes/commits.openapi';

const app = new Hono();
app.route('/', commitRoutes);
let cleanup: () => Promise<void>;
let projectId: string;
let first: string;
let second: string;
beforeAll(async () => {
  const setup = await setupTestDB();
  mockDB = setup.db;
  cleanup = setup.cleanup;
  projectId = (
    await insertProject(mockDB, {
      ...testData.project({ name: 'Overview' }),
      namespaceId: 'ns_t3x_dev',
    })
  ).projectId;
  await ensureMainBranch(mockDB, projectId);
  first = (
    await commitRepositoryYOpsState({
      db: mockDB,
      projectId,
      refName: 'main',
      expectedHead: null,
      target: createYOpsState({ service: { image: 'app:v1' } }),
      actor: { kind: 'human', id: 'test' },
      intent: 'First',
    })
  ).commitDigest;
  second = (
    await commitRepositoryYOpsState({
      db: mockDB,
      projectId,
      refName: 'main',
      expectedHead: first,
      target: createYOpsState({ service: { image: 'app:v2' } }),
      actor: { kind: 'human', id: 'test' },
      intent: 'Second',
    })
  ).commitDigest;
});
afterAll(async () => cleanup?.());
const path = (hash = first, project = projectId) =>
  `/v1/projects/${project}/commits/${hash}/overview`;
it('returns a schema-checked historical Overview after HEAD advances', async () => {
  const response = await app.request(path());
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  const data = StateOverviewSchema.parse((await response.json()).data);
  expect(data.author).toBeNull();
  expect(data.render.model.value).toEqual({ service: { image: 'app:v1' } });
  expect(data.summary.items).toEqual([
    { key: 'service', pointer: '/service', type: 'object', childCount: 1 },
  ]);
  expect(data.revision.commitDigest).toBe(first);
});
it('includes the exact author sidecar without injecting it into business State', async () => {
  const publication = await app.request(path().replace('/overview', '/presentation'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description: 'Author text', readme: '# Guide', tags: ['anything'] }),
  });
  expect(publication.status).toBe(200);
  const digest = (await publication.json()).data.presentation.digest;
  const response = await app.request(`${path()}?presentation_digest=${digest}`);
  const data = StateOverviewSchema.parse((await response.json()).data);
  expect(data.author?.document.description).toBe('Author text');
  expect(data.revision.presentationDigest).toBe(digest);
  expect(JSON.parse(data.render.recovery.json)).toEqual({ service: { image: 'app:v1' } });
  expect((await (await app.request(path(second))).json()).data.author).toBeNull();
});
it('rejects wrong State and presentation pins', async () => {
  const wrong = `sha256:${'f'.repeat(64)}`;
  expect((await app.request(`${path()}?state_digest=${wrong}`)).status).toBe(409);
  expect((await app.request(`${path()}?presentation_digest=${wrong}`)).status).toBe(409);
});
it('rejects foreign-project commits and invalid digests', async () => {
  const project = await insertProject(mockDB, {
    ...testData.project({ name: 'Foreign' }),
    namespaceId: 'ns_t3x_dev',
  });
  expect((await app.request(path(first, project.projectId))).status).toBe(404);
  expect((await app.request(path('latest'))).status).toBe(400);
});
it('fails closed for a corrupted stored author document', async () => {
  const row = await findStatePresentation(mockDB, projectId, first);
  expect(row).toBeTruthy();
  await mockDB
    .update(statePresentations)
    .set({ document: { ...row!.document, description: 'Corrupted' } })
    .where(eq(statePresentations.projectId, projectId));
  try {
    expect((await app.request(path())).status).toBe(409);
  } finally {
    await mockDB
      .update(statePresentations)
      .set({ document: row!.document })
      .where(eq(statePresentations.projectId, projectId));
  }
});

it('allows a project viewer but denies an unauthorised reader', async () => {
  await mockDB.insert(projectGrants).values({
    grantId: 'overview-viewer-grant',
    projectId,
    namespaceId: 'ns_t3x_dev',
    principalKind: 'human',
    principalId: 'overview-viewer',
    role: 'viewer',
    status: 'active',
  });
  const viewer = new Hono();
  viewer.use('*', async (c, next) => {
    // biome-ignore lint/suspicious/noExplicitAny: authentication middleware fixture
    (c as any).set('apiKey', {
      id: 'viewer-key',
      user_id: 'overview-viewer',
      principal_kind: 'human',
      project_id: null,
    });
    await next();
  });
  viewer.route('/', commitRoutes);
  const prior = process.env.AUTH_DISABLED;
  process.env.AUTH_DISABLED = 'false';
  try {
    expect((await viewer.request(path())).status).toBe(200);
    expect((await app.request(path())).status).toBe(403);
  } finally {
    if (prior === undefined) delete process.env.AUTH_DISABLED;
    else process.env.AUTH_DISABLED = prior;
  }
});
