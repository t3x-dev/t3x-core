import { createStatePresentation } from '@t3x-dev/application';
import { createYOpsState } from '@t3x-dev/core';
import {
  type AnyDB,
  ensureMainBranch,
  findProjectById,
  insertProject,
  insertStatePresentation,
  listProjectYSchemaVersionHistory,
  upsertWorkspaceDraft,
} from '@t3x-dev/storage';
import {
  builtInPrdCoreArtifact,
  compileYSchemaComposition,
  sha256CompositionValue,
} from '@t3x-dev/yschema';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { yschemaArtifacts } from '../../../storage/src/schema';
import { statePresentations } from '../../../storage/src/schema-presentations';
import { projectGrants } from '../../../storage/src/schema-trees';
import { commitRepositoryYOpsState } from '../lib/repository-state-transition';
import { setupTestDB, testData } from './setup';

let db: AnyDB;
let cleanup: () => Promise<void>;
let projectId: string;
let commitDigest: string;
let foreignCommit: string;
let compositionHash: string;
vi.mock('../lib/db', () => ({ getDB: vi.fn(() => Promise.resolve(db)) }));

import { yschemaCompositionRoutes } from '../routes/yschema-composition.openapi';

const app = new Hono();
app.route('/', yschemaCompositionRoutes);
const image = {
  path: 'images/cover.png',
  alt: 'Author cover',
  mediaType: 'image/png' as const,
  base64:
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0uoAAAAASUVORK5CYII=',
};
const presentation = createStatePresentation({
  description: 'Pinned author introduction',
  readme: '# Guide',
  avatarPath: image.path,
  resources: [image],
});
const composition = {
  apiVersion: 't3x.dev/yschema-composition/v1' as const,
  id: 'presentation-composition',
  revision: 1,
  family: 'prd' as const,
  status: 'draft' as const,
  core: {
    canonicalName: builtInPrdCoreArtifact.canonicalName,
    version: builtInPrdCoreArtifact.version,
  },
  modules: [],
};
beforeAll(async () => {
  const setup = await setupTestDB();
  db = setup.db;
  cleanup = setup.cleanup;
  projectId = (
    await insertProject(db, {
      ...testData.project({ name: 'Release introduction' }),
      ownerId: 'release-editor',
    })
  ).projectId;
  const foreign = (await insertProject(db, testData.project({ name: 'Foreign' }))).projectId;
  for (const id of [projectId, foreign]) {
    await ensureMainBranch(db, id);
    const saved = await commitRepositoryYOpsState({
      db,
      projectId: id,
      refName: 'main',
      expectedHead: null,
      target: createYOpsState({ definition: 'example' }),
      actor: { kind: 'human', id: 'fixture' },
      intent: 'Introduction source',
    });
    if (id === projectId) commitDigest = saved.commitDigest;
    else foreignCommit = saved.commitDigest;
  }
  await insertStatePresentation(db, {
    projectId,
    commitDigest,
    presentationDigest: presentation.digest,
    document: presentation.document,
    createdBy: 'fixture',
  });
  await upsertWorkspaceDraft(db, {
    project_id: projectId,
    workspace_id: 'studio',
    title: 'Studio',
    workspace_state: { schemaComposition: composition },
  });
  compositionHash = (
    await compileYSchemaComposition({ composition, core: builtInPrdCoreArtifact, modules: [] })
  ).compositionHash;
});
afterAll(async () => cleanup?.());
const reference = () => ({
  commitDigest,
  presentationDigest: presentation.digest,
  coverPath: image.path,
});
const input = (version = '1.0.0') => ({
  composition_revision: 1,
  composition_hash: compositionHash,
  canonical_name: 'release/demo',
  version,
  title: 'Release demo',
  presentation_ref: reference(),
});
const path = () => `/v1/projects/${projectId}/workspaces/studio/schema-composition/publish`;
const publish = (body: unknown, target = app) =>
  target.request(path(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
it('pins a verified introduction in the immutable release hash and catalog reference', async () => {
  const response = await publish(input());
  expect(response.status).toBe(200);
  const manifest = (await response.json()).data;
  expect(manifest.registry.presentationRef).toEqual({ projectId, ...reference() });
  const versions = await listProjectYSchemaVersionHistory(db, { project_id: projectId });
  expect(versions[0].artifactHash).toBe(await sha256CompositionValue(versions[0].manifest));
  const scoped = await app.request(`/v1/projects/${projectId}/yschema/catalog?publisher=release`);
  expect((await scoped.json()).data.items[0].presentationRef).toEqual({
    projectId,
    ...reference(),
  });
  // Advancing HEAD never changes the pinned introduction.
  await commitRepositoryYOpsState({
    db,
    projectId,
    refName: 'main',
    expectedHead: commitDigest,
    target: createYOpsState({ definition: 'next' }),
    actor: { kind: 'human', id: 'fixture' },
    intent: 'Next State',
  });
  const again = await app.request(`/v1/projects/${projectId}/yschema/catalog?publisher=release`);
  expect((await again.json()).data.items[0].presentationRef.commitDigest).toBe(commitDigest);
});
it('rejects foreign commits, mismatched digests and unbundled covers before publishing', async () => {
  const before = await listProjectYSchemaVersionHistory(db, { project_id: projectId });
  expect(
    (
      await publish({
        ...input('2.0.0'),
        presentation_ref: { ...reference(), commitDigest: foreignCommit },
      })
    ).status
  ).toBe(404);
  expect(
    (
      await publish({
        ...input('2.0.0'),
        presentation_ref: { ...reference(), presentationDigest: `sha256:${'0'.repeat(64)}` },
      })
    ).status
  ).toBe(409);
  expect(
    (
      await publish({
        ...input('2.0.0'),
        presentation_ref: { ...reference(), coverPath: 'https://other/image.png' },
      })
    ).status
  ).toBe(400);
  expect(
    (await publish({ ...input('2.0.0'), presentation_ref: { ...reference(), projectId: 'other' } }))
      .status
  ).toBe(400);
  expect(await listProjectYSchemaVersionHistory(db, { project_id: projectId })).toEqual(before);
});
it('fails closed on corrupted author content', async () => {
  await db
    .update(statePresentations)
    .set({ document: { ...presentation.document, readme: 'tampered' } })
    .where(eq(statePresentations.commitDigest, commitDigest));
  try {
    expect((await publish(input('2.0.0'))).status).toBe(409);
  } finally {
    await db
      .update(statePresentations)
      .set({ document: presentation.document })
      .where(eq(statePresentations.commitDigest, commitDigest));
  }
});
it('preserves publishing without an introduction, and rejects repinning an existing version', async () => {
  const { presentation_ref: _, ...body } = input('3.0.0');
  expect((await publish(body)).status).toBe(200);
  expect(
    (
      await publish({
        ...input(),
        presentation_ref: { commitDigest, presentationDigest: presentation.digest },
      })
    ).status
  ).toBe(409);
});
it('allows viewers to read but denies schema publish, identity edits and archive', async () => {
  const project = await findProjectById(db, projectId);
  await db.insert(projectGrants).values({
    grantId: 'release-viewer',
    projectId,
    namespaceId: project!.namespaceId!,
    principalKind: 'human',
    principalId: 'release-viewer',
    role: 'viewer',
    status: 'active',
  });
  const viewer = new Hono();
  viewer.use('*', async (c, next) => {
    // biome-ignore lint/suspicious/noExplicitAny: authentication middleware fixture
    (c as any).set('apiKey', {
      id: 'viewer',
      user_id: 'release-viewer',
      principal_kind: 'human',
      project_id: null,
    });
    await next();
  });
  viewer.route('/', yschemaCompositionRoutes);
  const prior = process.env.AUTH_DISABLED;
  process.env.AUTH_DISABLED = 'false';
  try {
    expect((await viewer.request(`/v1/projects/${projectId}/yschema/catalog`)).status).toBe(200);
    expect((await publish(input('4.0.0'), viewer)).status).toBe(403);
    const workspacePath = `/v1/projects/${projectId}/workspaces/studio/schema-composition`;
    expect(
      (
        await viewer.request(workspacePath, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ composition, if_revision: 1 }),
        })
      ).status
    ).toBe(403);
    expect(
      (
        await viewer.request(`${workspacePath}/apply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            if_revision: 1,
            composition_revision: 1,
            composition_hash: compositionHash,
          }),
        })
      ).status
    ).toBe(403);
    const versions = await listProjectYSchemaVersionHistory(db, { project_id: projectId });
    const base = `/v1/projects/${projectId}/yschemas/${versions[0].artifactId}`;
    expect(
      (
        await viewer.request(base, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ if_revision: 1, display_name: 'Changed' }),
        })
      ).status
    ).toBe(403);
    expect(
      (
        await viewer.request(`${base}/archive`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ if_revision: 1 }),
        })
      ).status
    ).toBe(403);
  } finally {
    if (prior === undefined) delete process.env.AUTH_DISABLED;
    else process.env.AUTH_DISABLED = prior;
  }
});

it('does not expose a private introduction reference through public or another project catalog', async () => {
  const versions = await listProjectYSchemaVersionHistory(db, { project_id: projectId });
  const artifactId = versions[0].artifactId;
  await db
    .update(yschemaArtifacts)
    .set({ visibility: 'community' })
    .where(eq(yschemaArtifacts.artifactId, artifactId));
  try {
    for (const route of [
      '/v1/yschema/catalog?publisher=release',
      `/v1/projects/${projectId}/yschema/catalog?publisher=release`,
    ]) {
      const response = await app.request(route);
      const items = (await response.json()).data.items;
      expect(items.length).toBeGreaterThan(0);
      if (route.startsWith('/v1/yschema/'))
        expect(
          items.every((item: { presentationRef: unknown }) => item.presentationRef === null)
        ).toBe(true);
      else
        expect(
          items.some((item: { presentationRef: unknown }) => item.presentationRef !== null)
        ).toBe(true);
    }
    const other = (await insertProject(db, testData.project({ name: 'Catalog reader' }))).projectId;
    const response = await app.request(`/v1/projects/${other}/yschema/catalog?publisher=release`);
    expect(
      (await response.json()).data.items.every(
        (item: { presentationRef: unknown }) => item.presentationRef === null
      )
    ).toBe(true);
  } finally {
    await db
      .update(yschemaArtifacts)
      .set({ visibility: 'private' })
      .where(eq(yschemaArtifacts.artifactId, artifactId));
  }
});

it('also pins the introduction in an open v2 Blueprint release', async () => {
  await upsertWorkspaceDraft(db, {
    project_id: projectId,
    workspace_id: 'studio-v2',
    target_branch: 'studio-v2',
    title: 'Open Studio',
    workspace_state: { targetBranch: 'studio-v2', title: 'Open Studio' },
  });
  const base = `/v1/projects/${projectId}/workspaces/studio-v2/schema-composition`;
  const saved = await app.request(base, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      if_revision: 1,
      composition: {
        apiVersion: 't3x.dev/yschema-composition/v2',
        id: 'open-introduction',
        revision: 0,
        status: 'draft',
        modules: [
          {
            canonicalName: builtInPrdCoreArtifact.canonicalName,
            version: builtInPrdCoreArtifact.version,
            presentationOrder: 10,
          },
        ],
      },
    }),
  });
  expect(saved.status).toBe(200);
  const result = (await saved.json()).data;
  const response = await app.request(`${base}/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...input(),
      canonical_name: 'release/open',
      composition_revision: result.composition.revision,
      composition_hash: result.preview.compositionHash,
    }),
  });
  expect(response.status).toBe(200);
  const manifest = (await response.json()).data;
  expect(manifest.apiVersion).toBe('t3x.dev/yschema-blueprint/v1');
  expect(manifest.registry.presentationRef).toEqual({ projectId, ...reference() });
});
