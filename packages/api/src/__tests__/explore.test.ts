import {
  type AnyDB,
  deleteProject,
  insertProject,
  namespaceMemberships,
  projectGrants,
  projects,
  updateYSchemaArtifactIdentity,
  upsertYSchemaArtifactVersion,
  yschemaArtifactVersions,
} from '@t3x-dev/storage';
import { sha256CompositionValue } from '@t3x-dev/yschema';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { setupTestDB } from './setup';

let db: AnyDB;
let cleanup: () => Promise<void>;
vi.mock('../lib/db', () => ({ getDB: () => Promise.resolve(db) }));

import { exploreRoutes } from '../routes/explore.openapi';
import { schemaStudioRoutes } from '../routes/schema-studio.openapi';

const app = new Hono<{ Variables: { apiKey: unknown } }>();
app.use('*', async (c, next) => {
  c.set('apiKey', {
    id: 'explorer',
    user_id: 'explorer',
    principal_kind: 'human',
    project_id: null,
    transition_scopes: [],
  });
  return next();
});
app.route('/', exploreRoutes);
app.route('/', schemaStudioRoutes);
let publicId: string;
let ownId: string;
let sourceId: string;
let hash: string;
const sourceManifest = {
  apiVersion: 'test/v1',
  canonicalName: 'explore-test/example',
  version: '1.0.0',
  license: 'MIT',
  readme: '# Published definition',
  contribution: { nodes: {} },
};
const requestRelease = (overrides: Record<string, string> = {}) =>
  app.request(
    `/v1/explore/schema-release?${new URLSearchParams({ canonicalName: sourceManifest.canonicalName, version: '1.0.0', expectedHash: hash, sourceProjectId: sourceId, ...overrides })}`
  );
beforeAll(async () => {
  const setup = await setupTestDB();
  db = setup.db;
  cleanup = setup.cleanup;
  const publicProject = await insertProject(db, {
    name: 'public-explore-project',
    ownerId: 'publisher',
    metadata: { description: 'A garden project', secret: 'NEVER_PUBLIC' },
    repositoryProfile: { readme: '# Garden', tags: ['plants'] },
  });
  publicId = publicProject.projectId;
  await db.update(projects).set({ visibility: 'public' }).where(eq(projects.projectId, publicId));
  ownId = (await insertProject(db, { name: 'editable-project', ownerId: 'explorer' })).projectId;
  sourceId = (await insertProject(db, { name: 'schema-source', ownerId: 'explorer' })).projectId;
  const readOnly = await insertProject(db, { name: 'readonly-project', ownerId: 'someone-else' });
  await db.insert(projectGrants).values({
    grantId: 'explore-readonly',
    projectId: readOnly.projectId,
    namespaceId: readOnly.namespaceId!,
    principalKind: 'human',
    principalId: 'explorer',
    role: 'viewer',
    status: 'active',
  });
  const hidden = await insertProject(db, { name: 'not-public-project', ownerId: 'someone-else' });
  await db
    .update(projects)
    .set({ visibility: 'unlisted' })
    .where(eq(projects.projectId, hidden.projectId));
  const deleted = await insertProject(db, { name: 'deleted-public', ownerId: 'publisher' });
  await db
    .update(projects)
    .set({ visibility: 'public' })
    .where(eq(projects.projectId, deleted.projectId));
  await deleteProject(db, deleted.projectId);
  hash = await sha256CompositionValue(sourceManifest);
  await upsertYSchemaArtifactVersion(db, {
    artifact_id: 'explore-source',
    artifact_version_id: 'explore-source-1',
    canonical_name: sourceManifest.canonicalName,
    version: '1.0.0',
    family: 'custom',
    kind: 'schema',
    visibility: 'community',
    owner_project_id: sourceId,
    status: 'published',
    manifest_json: sourceManifest,
    artifact_hash: hash,
    path_count: 0,
    provides: [],
    requires: [],
  });
});
afterAll(async () => cleanup?.());
it('exposes only public nondeleted introductions, filters before paging, and never grants State access', async () => {
  const response = await app.request('/v1/explore/projects?tag=plants&q=garden&limit=1');
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  const page = (await response.json()).data;
  expect(page.items).toHaveLength(1);
  expect(page.items[0]).toMatchObject({
    projectId: publicId,
    tags: ['plants'],
    repositoryPath: null,
  });
  expect(JSON.stringify(page)).not.toMatch(/NEVER_PUBLIC|readme|metadata/);
  const detail = await app.request(`/v1/explore/projects/${publicId}`);
  expect((await detail.json()).data).toMatchObject({ readme: '# Garden', repositoryPath: null });
  const all = (await (await app.request('/v1/explore/projects')).json()).data;
  expect(all.items.map((p: { projectId: string }) => p.projectId)).toEqual([publicId]);
  expect((await app.request(`/v1/explore/projects/${ownId}`)).status).toBe(404);
  expect((await app.request('/v1/explore/projects?cursor=not-valid')).status).toBe(400);
});
it('pages editable destinations without selecting readonly projects and rechecks write authority', async () => {
  const first = (await (await app.request('/v1/explore/schema-targets?limit=1')).json()).data;
  expect(first.items).toHaveLength(1);
  expect(first.has_more).toBe(true);
  const second = (
    await (
      await app.request(
        `/v1/explore/schema-targets?limit=1&cursor=${encodeURIComponent(first.next_cursor)}`
      )
    ).json()
  ).data;
  expect(
    new Set([...first.items, ...second.items].map((p: { projectId: string }) => p.projectId))
  ).toEqual(new Set([ownId, sourceId]));
  const searched = (await (await app.request('/v1/explore/schema-targets?q=readonly')).json()).data;
  expect(searched.items).toEqual([]);
  const body = {
    canonicalName: sourceManifest.canonicalName,
    version: '1.0.0',
    expectedHash: hash,
    sourceProjectId: sourceId,
  };
  const add = () =>
    app.request(`/v1/projects/${ownId}/schema-studio/candidates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const one = (await (await add()).json()).data;
  const two = (await (await add()).json()).data;
  expect(one).toBeDefined();
  expect(two).toEqual(one);
  const membership = await db
    .select()
    .from(namespaceMemberships)
    .where(eq(namespaceMemberships.principalId, 'explorer'));
  await db
    .update(namespaceMemberships)
    .set({ role: 'viewer' })
    .where(eq(namespaceMemberships.membershipId, membership[0].membershipId));
  expect((await add()).status).toBe(403);
  expect((await (await app.request('/v1/explore/schema-targets')).json()).data.items).toEqual([]);
  await db
    .update(namespaceMemberships)
    .set({ role: 'owner' })
    .where(eq(namespaceMemberships.membershipId, membership[0].membershipId));
});
it('reads exact releases without a destination and rejects mismatches, revocation and archival', async () => {
  const response = await requestRelease();
  expect(response.status).toBe(200);
  expect((await response.json()).data).toMatchObject({
    artifactHash: hash,
    readme: '# Published definition',
  });
  expect((await requestRelease({ expectedHash: `sha256:${'0'.repeat(64)}` })).status).toBe(404);
  expect((await requestRelease({ version: 'latest' })).status).toBe(400);
  expect((await requestRelease({ sourceProjectId: publicId })).status).toBe(404);
  await db
    .update(namespaceMemberships)
    .set({ status: 'revoked', revokedAt: new Date() })
    .where(eq(namespaceMemberships.principalId, 'explorer'));
  expect((await requestRelease()).status).toBe(404);
  await db
    .update(namespaceMemberships)
    .set({ status: 'active', revokedAt: null })
    .where(eq(namespaceMemberships.principalId, 'explorer'));
  await db
    .update(yschemaArtifactVersions)
    .set({ manifestJson: { ...sourceManifest, readme: 'Tampered content' } })
    .where(eq(yschemaArtifactVersions.artifactVersionId, 'explore-source-1'));
  expect((await requestRelease()).status).toBe(404);
  await db
    .update(yschemaArtifactVersions)
    .set({ manifestJson: sourceManifest })
    .where(eq(yschemaArtifactVersions.artifactVersionId, 'explore-source-1'));
  await updateYSchemaArtifactIdentity(db, {
    artifact_id: 'explore-source',
    project_id: sourceId,
    if_revision: 1,
    lifecycle_status: 'archived',
  });
  expect((await requestRelease()).status).toBe(404);
});
it('withdraws the public detail and directory as soon as visibility changes', async () => {
  await db.update(projects).set({ visibility: 'private' }).where(eq(projects.projectId, publicId));
  expect((await app.request(`/v1/explore/projects/${publicId}`)).status).toBe(404);
  expect((await (await app.request('/v1/explore/projects')).json()).data.items).toEqual([]);
});
