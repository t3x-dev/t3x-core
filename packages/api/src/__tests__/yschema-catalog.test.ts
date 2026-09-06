import { SchemaCatalogPageSchema } from '@t3x-dev/api-client';
import {
  type AnyDB,
  deleteProject,
  insertProject,
  listYSchemaCatalogReleases,
  updateYSchemaArtifactIdentity,
  upsertYSchemaArtifactVersion,
} from '@t3x-dev/storage';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { yschemaArtifactVersions } from '../../../storage/src/schema';
import { setupTestDB, testData } from './setup';

let db: AnyDB;
let cleanup: () => Promise<void>;
let projectId: string;
let otherProjectId: string;
vi.mock('../lib/db', () => ({ getDB: vi.fn(() => Promise.resolve(db)) }));

import { yschemaCompositionRoutes } from '../routes/yschema-composition.openapi';

const app = new Hono();
app.route('/', yschemaCompositionRoutes);
let sequence = 0;
async function publish(
  name: string,
  options: {
    version?: string;
    status?: 'active' | 'published' | 'draft' | 'deprecated';
    owner?: string;
    visibility?: 'official' | 'community' | 'team' | 'private';
    tags?: string[];
    provides?: string[];
    kind?: 'schema' | 'core' | 'module';
  } = {}
) {
  const version = options.version ?? '1.0.0';
  const result = await upsertYSchemaArtifactVersion(db, {
    artifact_id: `catalog-${name}`,
    artifact_version_id: `catalog-${name}-${version}`,
    canonical_name: `catalog/${name}`,
    display_name: `Display ${name}`,
    description: 'A faithful author description',
    family: 'custom-world',
    kind: options.kind ?? 'schema',
    tags: options.tags ?? ['research', 'ecosystem:custom-tool'],
    visibility: options.visibility ?? 'community',
    owner_project_id: options.owner,
    version,
    status: options.status ?? 'published',
    manifest_json: {
      license: 'Apache-2.0',
      readme: 'PRIVATE_README_NEVER_INDEX',
      resources: [{ base64: 'PRIVATE_RESOURCE_NEVER_INDEX' }],
      starter: { secret: 'PRIVATE_STARTER_NEVER_INDEX' },
    },
    artifact_hash: `sha256:${(++sequence).toString(16).padStart(64, '0')}`,
    path_count: 3,
    provides: options.provides ?? [],
    requires: ['declared.input'],
  });
  // Same timestamps exercise the immutable version-id tiebreaker.
  await db
    .update(yschemaArtifactVersions)
    .set({ createdAt: new Date('2026-01-01T00:00:00Z') })
    .where(eq(yschemaArtifactVersions.artifactVersionId, result.artifactVersionId));
  return result;
}
beforeAll(async () => {
  const setup = await setupTestDB();
  db = setup.db;
  cleanup = setup.cleanup;
  projectId = (
    await insertProject(db, {
      ...testData.project({ name: 'Catalog owner' }),
      ownerId: 'catalog-owner',
    })
  ).projectId;
  otherProjectId = (
    await insertProject(db, {
      ...testData.project({ name: 'Other catalog' }),
      ownerId: 'other-owner',
    })
  ).projectId;
  await publish('public', { provides: ['declared.preview'], kind: 'module' });
  await publish('public', { version: '2.0.0', provides: ['declared.preview'], kind: 'module' });
  await publish('private', { owner: projectId, visibility: 'private' });
  await publish('team', { owner: projectId, visibility: 'team' });
  await publish('other', { owner: otherProjectId, visibility: 'private' });
  await publish('draft', { status: 'draft' });
  await publish('deprecated', { status: 'deprecated' });
  const archived = await publish('archived', { owner: projectId });
  await updateYSchemaArtifactIdentity(db, {
    artifact_id: archived.artifactId,
    project_id: projectId,
    if_revision: 1,
    lifecycle_status: 'archived',
  });
  const deleted = (await insertProject(db, testData.project({ name: 'Deleted catalog' })))
    .projectId;
  await publish('deleted-owner', { owner: deleted });
  await deleteProject(db, deleted);
  await publish('tag-only', { tags: ['declared.preview', 'kubernetes', 'research'] });
  await publish('literal_%', { tags: ['custom-tag'] });
});
afterAll(async () => cleanup?.());

async function page(query = '', project?: string) {
  const path = project ? `/v1/projects/${project}/yschema/catalog` : '/v1/yschema/catalog';
  const response = await app.request(`${path}?publisher=catalog&${query}`);
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  return SchemaCatalogPageSchema.parse((await response.json()).data);
}
it('returns only visible, active-identity published releases, without manifests or draft versions', async () => {
  const result = await page();
  expect(result.items.map((item) => item.identity.canonicalName).sort()).toEqual([
    'catalog/literal_%',
    'catalog/public',
    'catalog/public',
    'catalog/tag-only',
  ]);
  expect(JSON.stringify(result)).not.toContain('NEVER_INDEX');
  const releases = result.items.filter((item) => item.identity.canonicalName === 'catalog/public');
  expect(releases.map((item) => item.release.version).sort()).toEqual(['1.0.0', '2.0.0']);
  expect(new Set(releases.map((item) => item.release.hash)).size).toBe(2);
  expect(releases[0]).toMatchObject({
    contentKind: 'definition',
    validation: 'not-run',
    license: 'Apache-2.0',
  });
});
it('includes only this project’s private/team releases and keeps public scope independent', async () => {
  const result = await page('', projectId);
  expect(result.items.map((item) => item.identity.canonicalName)).toEqual(
    expect.arrayContaining(['catalog/private', 'catalog/team'])
  );
  expect(result.items.map((item) => item.identity.canonicalName)).not.toContain('catalog/other');
  expect((await page()).items.every((item) => item.identity.visibility === 'community')).toBe(true);
});
it('applies search, literal wildcard escaping and facets before pagination', async () => {
  expect(
    (
      await page(
        'q=faithful&kind=module&tags=research&ecosystem=custom-tool&family=custom-world&format=yaml&limit=1'
      )
    ).items
  ).toHaveLength(1);
  expect((await page('q=Display%20public')).items).toHaveLength(2);
  expect((await page('q=%25')).items.map((item) => item.identity.canonicalName)).toEqual([
    'catalog/literal_%',
  ]);
  expect((await page('tags=research,ecosystem:custom-tool')).items).toHaveLength(2);
  expect((await page('q=PRIVATE_README_NEVER_INDEX')).items).toHaveLength(0);
  expect((await page('ecosystem=not-declared')).items).toHaveLength(0);
});
it('uses version declarations for capabilities; tags never create runtime claims', async () => {
  const result = await page('capability=declared.preview');
  expect(result.items).toHaveLength(2);
  expect(result.items.every((item) => item.identity.canonicalName === 'catalog/public')).toBe(true);
  const tagOnly = (await page('tags=declared.preview')).items[0];
  expect(tagOnly.definition.provides).toEqual([]);
  expect(tagOnly.validation).toBe('not-run');
  expect('renderer' in tagOnly).toBe(false);
});
it('pages equal timestamps exactly once across versions', async () => {
  const first = await page('limit=1');
  const item = first.items[0];
  const expected = (await page()).items.map((row) => row.release.artifactVersionId);
  let current = first;
  const seen = [...current.items.map((row) => row.release.artifactVersionId)];
  while (current.has_more) {
    current = await page(`limit=1&cursor=${encodeURIComponent(current.next_cursor!)}`);
    seen.push(...current.items.map((row) => row.release.artifactVersionId));
  }
  expect(seen).toEqual(expected);
  expect(new Set(seen).size).toBe(seen.length);
  expect(current.next_cursor).toBeNull();
  expect(item.release.artifactVersionId).toBeTruthy();
});
it('reflects metadata edits immediately without changing immutable release identity', async () => {
  const before = (await page('', projectId)).items.find(
    (item) => item.identity.canonicalName === 'catalog/private'
  )!;
  await updateYSchemaArtifactIdentity(db, {
    artifact_id: before.identity.artifactId,
    project_id: projectId,
    if_revision: before.identity.metadataRevision,
    description: 'Updated catalog wording',
    tags: ['my-new-tag'],
  });
  const after = (await page('q=Updated%20catalog&tags=my-new-tag', projectId)).items[0];
  expect(after.release).toEqual(before.release);
  expect(after.identity.metadataRevision).toBe(before.identity.metadataRevision + 1);
});
it('curated aliases are optional tag filters; arbitrary tags remain searchable', async () => {
  const collections = await app.request('/v1/yschema/catalog/collections');
  expect(
    (await collections.json()).data.items.find((item: { id: string }) => item.id === 'science').tags
  ).toContain('research');
  expect((await page('collection=science')).items).toHaveLength(3);
  expect((await page('tags=custom-tag')).items).toHaveLength(1);
});
it('rejects malformed filters and cursors instead of silently widening the search', async () => {
  for (const query of [
    'cursor=bad',
    'format=exe',
    'limit=0',
    'collection=unknown',
    'project_id=other',
    'tags=' + Array(17).fill('x').join(','),
  ]) {
    expect((await app.request(`/v1/yschema/catalog?${query}`)).status).toBe(400);
  }
  await expect(listYSchemaCatalogReleases(db, { cursor: 'bad' })).rejects.toThrow('Invalid cursor');
});
it('enforces real project authority with auth enabled, including cursor reuse and missing projects', async () => {
  const owner = new Hono();
  owner.use('*', async (c, next) => {
    c.set('apiKey', { user_id: 'catalog-owner', principal_kind: 'human', project_id: null });
    await next();
  });
  owner.route('/', yschemaCompositionRoutes);
  const cursor = (await page('limit=1', projectId)).next_cursor!;
  const prior = process.env.AUTH_DISABLED;
  process.env.AUTH_DISABLED = 'false';
  try {
    expect((await app.request(`/v1/projects/${projectId}/yschema/catalog`)).status).toBe(403);
    expect((await owner.request(`/v1/projects/${projectId}/yschema/catalog`)).status).toBe(200);
    expect(
      (await owner.request(`/v1/projects/${otherProjectId}/yschema/catalog?cursor=${cursor}`))
        .status
    ).toBe(403);
    expect((await owner.request('/v1/projects/missing/yschema/catalog')).status).toBe(404);
    const publicResponse = await owner.request(
      `/v1/yschema/catalog?publisher=catalog&cursor=${cursor}`
    );
    const publicPage = SchemaCatalogPageSchema.parse((await publicResponse.json()).data);
    expect(publicPage.items.every((item) => item.identity.visibility === 'community')).toBe(true);
  } finally {
    if (prior === undefined) delete process.env.AUTH_DISABLED;
    else process.env.AUTH_DISABLED = prior;
  }
});

it('uses declared release titles for legacy built-ins whose registry metadata is absent', async () => {
  const response = await app.request('/v1/yschema/catalog?publisher=t3x&q=PRD%20Core');
  expect(response.status).toBe(200);
  const result = SchemaCatalogPageSchema.parse((await response.json()).data);
  expect(result.items.some((item) => item.identity.displayName === 'PRD Core')).toBe(true);
  expect(result.items.every((item) => item.release.hash.startsWith('sha256:'))).toBe(true);
});

it('filters exact canonical names without broadening private release visibility', async () => {
  await publish('exact-name');
  await publish('exact-name-extra');
  await publish('private-exact', { owner: otherProjectId, visibility: 'private' });
  const response = await app.request('/v1/yschema/catalog?canonical_name=catalog%2Fexact-name');
  expect(response.status).toBe(200);
  expect(
    (await response.json()).data.items.map(
      (item: { identity: { canonicalName: string } }) => item.identity.canonicalName
    )
  ).toEqual(['catalog/exact-name']);
  const hidden = await app.request(
    `/v1/projects/${projectId}/yschema/catalog?canonical_name=catalog%2Fprivate-exact`
  );
  expect(hidden.status).toBe(200);
  expect((await hidden.json()).data.items).toEqual([]);
});
