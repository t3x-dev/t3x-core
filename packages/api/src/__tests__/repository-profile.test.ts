import { createStatePresentation } from '@t3x-dev/application';
import { createYOpsState } from '@t3x-dev/core';
import {
  type AnyDB,
  branches,
  findProjectById,
  findStatePresentation,
  insertPersonalNamespace,
  insertStatePresentation,
  transitionCommits,
  users,
} from '@t3x-dev/storage';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { projectGrants } from '../../../storage/src/schema-trees';
import { commitRepositoryYOpsState } from '../lib/repository-state-transition';
import { commitRoutes } from '../routes/commits.openapi';
import { projectRoutes } from '../routes/projects.openapi';
import { setupTestDB } from './setup';

let db: AnyDB;
vi.mock('../lib/db', () => ({ getDB: () => Promise.resolve(db) }));
function appFor(userId = 'profile-owner') {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('apiKey', {
      id: `key_${userId}`,
      user_id: userId,
      principal_kind: 'human',
      project_id: null,
    });
    await next();
  });
  app.route('/', projectRoutes);
  app.route('/', commitRoutes);
  return app;
}
const request = (method: string, body: unknown) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const put = (id: string, body: unknown, app = appFor()) =>
  app.request(`/v1/projects/${id}`, request('PUT', body));
async function read(id: string, app = appFor()) {
  const response = await app.request(`/v1/projects/${id}`);
  expect(response.status).toBe(200);
  return (await response.json()).data;
}
async function create(body: Record<string, unknown> = {}) {
  const response = await appFor().request(
    '/v1/projects',
    request('POST', { name: 'Profile-repo', namespace: 'profile-tests', ...body })
  );
  expect(response.status).toBe(201);
  return (await response.json()).data;
}
async function businessSnapshot(id: string) {
  return {
    branches: await db.select().from(branches).where(eq(branches.projectId, id)),
    commits: await db.select().from(transitionCommits).where(eq(transitionCommits.projectId, id)),
  };
}

describe('project-scoped repository information', () => {
  let cleanup: () => Promise<void>;
  let namespaceId: string;
  const priorAuth = process.env.AUTH_DISABLED;
  beforeAll(async () => {
    process.env.AUTH_DISABLED = 'false';
    const setup = await setupTestDB();
    db = setup.db;
    cleanup = setup.cleanup;
    await db.insert(users).values(
      ['profile-owner', 'profile-editor', 'profile-viewer', 'profile-outsider'].map((id) => ({
        id,
        emailVerified: true,
      }))
    );
    namespaceId = (
      await insertPersonalNamespace(db, { slug: 'profile-tests', ownerUserId: 'profile-owner' })
    ).namespaceId;
  });
  afterAll(async () => {
    if (priorAuth === undefined) delete process.env.AUTH_DISABLED;
    else process.env.AUTH_DISABLED = priorAuth;
    await cleanup?.();
  });

  it('defaults to empty, persists creation atomically and does not create a business Commit', async () => {
    const empty = await create({ name: 'Empty' });
    expect(empty.repository_profile).toEqual({ readme: '', tags: [] });
    expect((await findProjectById(db, empty.project_id))?.metadataJson).toBeNull();
    const initialized = await create({
      name: '  Final Repo  ',
      initialize_readme: true,
      metadata: { description: 'Actual description', other: { keep: true } },
      tags: [' 中文 ', 'Custom', '', '中文', 'custom'],
    });
    expect(initialized.name).toBe('Final-Repo');
    expect(initialized.repository_profile).toEqual({
      readme: '# Final-Repo\n\nActual description\n',
      tags: ['中文', 'Custom', 'custom'],
    });
    expect((await read(initialized.project_id)).repository_profile).toEqual(
      initialized.repository_profile
    );
    expect((await businessSnapshot(initialized.project_id)).commits).toEqual([]);
    const raw = JSON.parse((await findProjectById(db, initialized.project_id))!.metadataJson!);
    expect(raw.repository_profile).toEqual(initialized.repository_profile);
    expect(initialized.metadata).toEqual({
      description: 'Actual description',
      other: { keep: true },
    });
    const titleOnly = await create({ name: 'Title-only', initialize_readme: true });
    expect(titleOnly.repository_profile.readme).toBe('# Title-only\n');
    const tagsOnly = await create({ name: 'Tags-only', tags: ['分类'] });
    expect(tagsOnly.repository_profile).toEqual({ readme: '', tags: ['分类'] });
    expect((await businessSnapshot(tagsOnly.project_id)).commits).toEqual([]);
  });

  it('edits and clears fields independently with no Commit, retaining all other attributes', async () => {
    const p = await create({
      name: 'Maintain',
      metadata: { description: 'Keep', settings: { a: 1 } },
    });
    const id = p.project_id;
    expect((await put(id, { provider_config: { roles: [] }, extraction_style: null })).status).toBe(
      200
    );
    const before = await businessSnapshot(id);
    expect(
      (await put(id, { repository_profile: { readme: '# Current', tags: ['中文'] } })).status
    ).toBe(200);
    const profileSaved = await findProjectById(db, id);
    expect((await put(id, { repository_profile: { readme: '# Revised' } })).status).toBe(200);
    expect((await read(id)).repository_profile).toEqual({ readme: '# Revised', tags: ['中文'] });
    expect((await put(id, { repository_profile: { tags: [' 新 ', '新'] } })).status).toBe(200);
    expect((await read(id)).repository_profile).toEqual({ readme: '# Revised', tags: ['新'] });
    expect((await put(id, { name: 'Renamed' })).status).toBe(200);
    expect((await read(id)).repository_profile.readme).toBe('# Revised');
    expect((await put(id, { repository_profile: { readme: '' } })).status).toBe(200);
    expect((await read(id)).repository_profile).toEqual({ readme: '', tags: ['新'] });
    expect((await put(id, { repository_profile: { tags: [] } })).status).toBe(200);
    const after = await findProjectById(db, id);
    expect(after).toMatchObject({
      visibility: profileSaved!.visibility,
      providerConfig: profileSaved!.providerConfig,
      defaultProvider: profileSaved!.defaultProvider,
      defaultModel: profileSaved!.defaultModel,
    });
    expect((await read(id)).metadata).toEqual(p.metadata);
    expect((await read(id)).repository_profile).toEqual({ readme: '', tags: [] });
    expect(await businessSnapshot(id)).toEqual(before);
  });

  it('atomically merges concurrent profile fields and metadata without stale round trips', async () => {
    const p = await create({ name: 'Concurrent', metadata: { untouched: 1 } });
    const before = await businessSnapshot(p.project_id);
    const responses = await Promise.all([
      put(p.project_id, { repository_profile: { readme: '# Concurrent' } }),
      put(p.project_id, { repository_profile: { tags: ['并发'] } }),
      put(p.project_id, {
        metadata: { description: 'Concurrent description' },
        name: 'Concurrent-renamed',
      }),
      put(p.project_id, { provider_config: { roles: [] } }),
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200]);
    expect(await read(p.project_id)).toMatchObject({
      name: 'Concurrent-renamed',
      metadata: { description: 'Concurrent description', untouched: 1 },
      repository_profile: { readme: '# Concurrent', tags: ['并发'] },
      provider_config: { roles: [] },
    });
    expect(await businessSnapshot(p.project_id)).toEqual(before);
  });

  it('enforces existing read/edit permissions on direct requests', async () => {
    const p = await create({ name: 'Permissions' });
    for (const role of ['viewer', 'editor'])
      await db.insert(projectGrants).values({
        grantId: `profile-${role}`,
        projectId: p.project_id,
        namespaceId,
        principalKind: 'human',
        principalId: `profile-${role}`,
        role,
        status: 'active',
      });
    expect((await read(p.project_id, appFor('profile-viewer'))).can_edit).toBe(false);
    expect((await read(p.project_id, appFor('profile-editor'))).can_edit).toBe(true);
    expect(
      (
        await put(
          p.project_id,
          { repository_profile: { readme: 'Denied' } },
          appFor('profile-viewer')
        )
      ).status
    ).toBe(403);
    expect(
      (
        await put(
          p.project_id,
          { repository_profile: { tags: ['Allowed'] } },
          appFor('profile-editor')
        )
      ).status
    ).toBe(200);
    expect((await appFor('profile-outsider').request(`/v1/projects/${p.project_id}`)).status).toBe(
      403
    );
    expect(
      (await put(p.project_id, { repository_profile: { tags: [] } }, appFor('profile-outsider')))
        .status
    ).toBe(403);
    expect((await read(p.project_id)).repository_profile).toEqual({
      readme: '',
      tags: ['Allowed'],
    });
  });

  it('rejects oversized, null, unknown and reserved metadata inputs without writing', async () => {
    const p = await create({ name: 'Validation' });
    for (const repository_profile of [
      { readme: '中'.repeat(44_000) },
      { tags: ['x'.repeat(65)] },
      { tags: Array.from({ length: 33 }, (_, n) => String(n)) },
      { tags: null },
      { readme: null },
      { resources: [] },
    ])
      expect((await put(p.project_id, { repository_profile })).status).toBe(400);
    expect(
      (await put(p.project_id, { metadata: { repository_profile: { readme: 'bypass' } } })).status
    ).toBe(400);
    const response = await appFor().request(
      '/v1/projects',
      request('POST', {
        name: 'Too-large',
        namespace: 'profile-tests',
        initialize_readme: true,
        metadata: { description: '中'.repeat(44_000) },
      })
    );
    expect(response.status).toBe(400);
    const list = await appFor().request('/v1/projects');
    expect(
      (await list.json()).data.projects.some(
        (project: { name: string }) => project.name === 'Too-large'
      )
    ).toBe(false);
    expect((await read(p.project_id)).repository_profile).toEqual({ readme: '', tags: [] });
  });

  it('leaves the State graph and exact historical presentation unchanged', async () => {
    const p = await create({ name: 'History' });
    const id = p.project_id;
    const commit = await commitRepositoryYOpsState({
      db,
      projectId: id,
      refName: 'main',
      expectedHead: null,
      target: createYOpsState({ business: 'original' }),
      actor: { kind: 'human', id: 'profile-owner' },
      intent: 'Fixture State',
    });
    const author = createStatePresentation({
      description: 'Historical',
      readme: '# Version',
      tags: ['historic'],
    });
    await insertStatePresentation(db, {
      projectId: id,
      commitDigest: commit.commitDigest,
      presentationDigest: author.digest,
      document: author.document,
      createdBy: 'fixture',
    });
    const before = await businessSnapshot(id);
    const oldPresentation = await findStatePresentation(db, id, commit.commitDigest);
    expect((await read(id)).repository_profile).toEqual({ readme: '', tags: [] });
    expect(
      (await put(id, { repository_profile: { readme: '# Repository', tags: ['current'] } })).status
    ).toBe(200);
    expect(await businessSnapshot(id)).toEqual(before);
    expect(await findStatePresentation(db, id, commit.commitDigest)).toEqual(oldPresentation);
    const historical = await appFor().request(
      `/v1/projects/${id}/commits/${commit.commitDigest}/presentation?presentation_digest=${author.digest}`
    );
    expect(historical.status).toBe(200);
    expect((await historical.json()).data.presentation).toEqual(author);
  });
});
