import { createYOpsState } from '@t3x-dev/core';
import {
  type AnyDB,
  deleteProject,
  ensureMainBranch,
  findProjectById,
  findStatePresentation,
  insertProject,
  restoreProject,
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
let sidecarDigest: string;
const input = {
  description: 'First version',
  readme: '# Usage\n\n![Mark](images/mark.png)',
  avatarPath: 'images/mark.png',
  tags: ['custom-tool'],
  resources: [
    {
      path: 'images/mark.png',
      mediaType: 'image/png',
      alt: 'Tool mark',
      base64:
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0uoAAAAASUVORK5CYII=',
    },
  ],
};
beforeAll(async () => {
  const setup = await setupTestDB();
  mockDB = setup.db;
  cleanup = setup.cleanup;
  projectId = (
    await insertProject(mockDB, {
      ...testData.project({ name: 'Presentation' }),
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
      target: createYOpsState({ service: 'app:v1' }),
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
      target: createYOpsState({ service: 'app:v2' }),
      actor: { kind: 'human', id: 'test' },
      intent: 'Second',
    })
  ).commitDigest;
});
afterAll(async () => cleanup?.());
const path = (hash = first, project = projectId) =>
  `/v1/projects/${project}/commits/${hash}/presentation`;
const publish = (body: unknown = input, hash = first, project = projectId) =>
  app.request(path(hash, project), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
it('reports missing optional presentation without following HEAD', async () => {
  const response = await app.request(path());
  expect(response.status).toBe(200);
  expect((await response.json()).data).toMatchObject({ commitDigest: first, presentation: null });
});
it('publishes once, atomically deduplicates repeats and refuses replacement', async () => {
  const replies = await Promise.all([publish(), publish()]);
  expect(replies.map((r) => r.status)).toEqual([200, 200]);
  const [a, b] = await Promise.all(replies.map((r) => r.json()));
  sidecarDigest = a.data.presentation.digest;
  expect(a.data).toEqual(b.data);
  expect(a.data.createdBy).toBe('local');
  expect((await publish({ ...input, description: 'Overwrite' })).status).toBe(409);
});
it('keeps releases and bundled image bytes exact when HEAD advances or author text changes', async () => {
  expect((await publish({ description: 'Second version' }, second)).status).toBe(200);
  const old = await app.request(`${path()}?presentation_digest=${sidecarDigest}`);
  expect((await old.json()).data.presentation.document).toMatchObject({
    description: 'First version',
    resources: [expect.objectContaining({ base64: input.resources[0].base64 })],
  });
  expect((await app.request(`${path()}?presentation_digest=sha256:${'0'.repeat(64)}`)).status).toBe(
    409
  );
  const businessExport = await app.request(
    `/v1/commits/${first}/export?project_id=${projectId}&format=json`
  );
  expect(JSON.parse((await businessExport.json()).data.content)).toEqual({ service: 'app:v1' });
});
it('rejects unsafe resource references and wrong content types', async () => {
  expect(
    (await publish({ ...input, resources: [{ ...input.resources[0], path: '../secret.png' }] }))
      .status
  ).toBe(400);
  expect(
    (
      await publish({
        description: '',
        resources: [{ path: 'x.svg', mediaType: 'image/svg+xml', alt: 'x', base64: 'bad' }],
      })
    ).status
  ).toBe(400);
  expect((await publish({ description: '', purpose: 'not supported' })).status).toBe(400);
});
it('denies foreign commit membership and viewers writing author content', async () => {
  const other = (await insertProject(mockDB, testData.project({ name: 'Other' }))).projectId;
  expect((await publish(input, first, other)).status).toBe(404);
  expect((await app.request(path(first, other))).status).toBe(404);
  const project = await findProjectById(mockDB, projectId);
  await mockDB.insert(projectGrants).values({
    grantId: 'presentation-viewer',
    projectId,
    namespaceId: project!.namespaceId!,
    principalKind: 'human',
    principalId: 'presentation-viewer',
    role: 'viewer',
    status: 'active',
  });
  const viewer = new Hono();
  viewer.use('*', async (c, next) => {
    // biome-ignore lint/suspicious/noExplicitAny: authentication middleware fixture
    (c as any).set('apiKey', {
      id: 'viewer-key',
      user_id: 'presentation-viewer',
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
    expect(
      (
        await viewer.request(path(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        })
      ).status
    ).toBe(403);
    expect((await app.request(path())).status).toBe(403);
  } finally {
    if (prior === undefined) delete process.env.AUTH_DISABLED;
    else process.env.AUTH_DISABLED = prior;
  }
});

it('fails closed when stored content has a mismatched digest', async () => {
  const original = await findStatePresentation(mockDB, projectId, first);
  await mockDB
    .update(statePresentations)
    .set({ document: { ...original!.document, description: 'tampered' } })
    .where(eq(statePresentations.commitDigest, first));
  try {
    expect((await app.request(path())).status).toBe(409);
  } finally {
    await mockDB
      .update(statePresentations)
      .set({ document: original!.document })
      .where(eq(statePresentations.commitDigest, first));
  }
});
it('enforces request size before decoding resources', async () => {
  expect((await publish({ description: 'x'.repeat(4 * 1024 * 1024) })).status).toBe(413);
});

it('retains exact author resources across project soft deletion and restoration', async () => {
  await deleteProject(mockDB, projectId);
  expect((await app.request(path())).status).toBe(404);
  await restoreProject(mockDB, projectId);
  const response = await app.request(`${path()}?presentation_digest=${sidecarDigest}`);
  expect(response.status).toBe(200);
  expect((await response.json()).data.presentation.document.resources[0].base64).toBe(
    input.resources[0].base64
  );
});

it('allows a new author publication on a new commit without changing business configuration', async () => {
  const next = await commitRepositoryYOpsState({
    db: mockDB,
    projectId,
    refName: 'main',
    expectedHead: second,
    target: createYOpsState({ service: 'app:v2' }),
    actor: { kind: 'human', id: 'test' },
    intent: 'Document the existing configuration',
  });
  expect(next.commitDigest).not.toBe(second);
  expect((await publish({ description: 'Documentation update' }, next.commitDigest)).status).toBe(
    200
  );
  const exported = await app.request(
    `/v1/commits/${next.commitDigest}/export?project_id=${projectId}&format=json`
  );
  expect(JSON.parse((await exported.json()).data.content)).toEqual({ service: 'app:v2' });
});
