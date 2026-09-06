import {
  type AnyDB,
  findWorkspaceDraft,
  insertProject,
  listSchemaStudioCandidates,
  updateYSchemaArtifactIdentity,
  upsertYSchemaArtifactVersion,
} from '@t3x-dev/storage';
import { builtInPrdCoreArtifact, sha256CompositionValue } from '@t3x-dev/yschema';
import { Hono } from 'hono';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

let db: AnyDB;
let cleanup: () => Promise<void>;
let target: string;
let source: string;
const denied = new Set<string>();
vi.mock('../lib/db', () => ({ getDB: () => Promise.resolve(db) }));
vi.mock('../lib/project-access', () => ({
  assertProjectAccess: async (
    c: { req: { method: string } },
    _db: unknown,
    id: string,
    action = c.req.method === 'GET' ? 'project:read' : 'project:edit'
  ) =>
    denied.has(`${id}:${action}`) ? new Response('denied', { status: 403 }) : { projectId: id },
}));

import { schemaStudioRoutes } from '../routes/schema-studio.openapi';

const app = new Hono();
app.route('/', schemaStudioRoutes);
let hash: string;
let artifactId: string;
async function publish(version: string) {
  const manifest = {
    ...builtInPrdCoreArtifact,
    canonicalName: 'team/candidate',
    version,
    source: 'team',
    license: 'MIT',
  };
  hash = await sha256CompositionValue(manifest);
  const view = await upsertYSchemaArtifactVersion(db, {
    artifact_id: 'studio-source',
    artifact_version_id: `studio-source-${version}`,
    canonical_name: manifest.canonicalName,
    version,
    family: 'prd',
    kind: 'core',
    visibility: 'private',
    owner_project_id: source,
    status: 'published',
    manifest_json: manifest,
    artifact_hash: hash,
    path_count: 11,
    provides: [],
    requires: [],
  });
  artifactId = view.artifactId;
}
beforeAll(async () => {
  const setup = await setupTestDB();
  db = setup.db;
  cleanup = setup.cleanup;
  target = (await insertProject(db, testData.project({ name: 'Studio target' }))).projectId;
  source = (await insertProject(db, testData.project({ name: 'Studio source' }))).projectId;
  await publish('1.0.0');
});
afterAll(async () => cleanup?.());
const path = () => `/v1/projects/${target}/schema-studio/candidates`;
const add = (body: unknown) =>
  app.request(path(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
it('pins and deduplicates exact references without mutating Workspace or copying private content', async () => {
  const body = {
    sourceProjectId: source,
    canonicalName: 'team/candidate',
    version: '1.0.0',
    expectedHash: hash,
  };
  const [a, b] = await Promise.all([add(body), add(body)]);
  expect(a.status).toBe(200);
  expect(b.status).toBe(200);
  const first = (await a.json()).data;
  expect((await b.json()).data.id).toBe(first.id);
  expect(first.source.hash).toBe(hash);
  expect(await listSchemaStudioCandidates(db, target)).toHaveLength(1);
  expect(await findWorkspaceDraft(db, target, 'main')).toBeNull();
  const saved = JSON.stringify(await listSchemaStudioCandidates(db, target));
  expect(saved).not.toContain('manifest');
  expect(saved).not.toContain('resources');
  expect((await add({ ...body, expectedHash: `sha256:${'0'.repeat(64)}` })).status).toBe(409);
});
it('checks target write and source read authority; revoked source is redacted on list', async () => {
  denied.add(`${target}:project:edit`);
  expect(
    (await add({ sourceProjectId: source, canonicalName: 'team/candidate', version: '1.0.0' }))
      .status
  ).toBe(403);
  denied.clear();
  denied.add(`${source}:project:edit`);
  expect(
    (await add({ sourceProjectId: source, canonicalName: 'team/candidate', version: '1.0.0' }))
      .status
  ).toBe(200);
  denied.clear();
  denied.add(`${source}:project:read`);
  expect(
    (await add({ sourceProjectId: source, canonicalName: 'team/candidate', version: '1.0.0' }))
      .status
  ).toBe(404);
  const list = (await (await app.request(path())).json()).data.items;
  expect(list[0]).toMatchObject({ available: false, source: null, title: null });
  denied.clear();
  expect((await add({ canonicalName: 'team/candidate', version: '1.0.0' })).status).toBe(404);
});
it('resolves latest once, retains old pins, and scoped removal never deletes the source', async () => {
  await publish('2.0.0');
  const added = (
    await (
      await add({ sourceProjectId: source, canonicalName: 'team/candidate', version: 'latest' })
    ).json()
  ).data;
  expect(added.source.version).toBe('2.0.0');
  expect(await listSchemaStudioCandidates(db, target)).toHaveLength(2);
  await app.request(`${path()}/${added.id}`, { method: 'DELETE' });
  expect(await listSchemaStudioCandidates(db, target)).toHaveLength(1);
  expect(
    (await add({ sourceProjectId: source, canonicalName: 'team/candidate', version: '2.0.0' }))
      .status
  ).toBe(200);
  await updateYSchemaArtifactIdentity(db, {
    artifact_id: artifactId,
    project_id: source,
    if_revision: 1,
    lifecycle_status: 'archived',
  });
  const list = (await (await app.request(path())).json()).data.items;
  expect(list.every((item: { available: boolean }) => !item.available)).toBe(true);
});
