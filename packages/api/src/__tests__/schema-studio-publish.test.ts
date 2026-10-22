import type { StudioPreview, StudioPublishInput } from '@t3x-dev/api-client';
import {
  type AnyDB,
  deleteProject,
  findProjectById,
  findWorkspaceDraft,
  findYSchemaArtifactVersion,
  insertBranch,
  insertProject,
  listProjectYSchemaVersionHistory,
  listYSchemaArtifactVersions,
  permanentDeleteProject,
  updateYSchemaArtifactIdentity,
  upsertWorkspaceDraft,
  upsertYSchemaArtifactVersion,
} from '@t3x-dev/storage';
import {
  builtInPrdCoreArtifact,
  normalizeYSchemaObject,
  sha256CompositionValue,
} from '@t3x-dev/yschema';
import { Hono } from 'hono';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

let db: AnyDB;
let cleanup: () => Promise<void>;
let target: string;
let source: string;
let foreign: string;
let baseId: string;
let baseHash: string;
let baseManifest: Record<string, unknown>;
const denied = new Set<string>();
vi.mock('../lib/db', () => ({ getDB: () => Promise.resolve(db) }));
vi.mock('../lib/project-access', () => ({
  getProjectAccessPrincipal: () => undefined,
  assertProjectAccess: async (
    c: { req: { method: string } },
    _db: unknown,
    id: string,
    action = c.req.method === 'GET' ? 'project:read' : 'project:edit'
  ) =>
    denied.has(`${id}:${action}`) ? new Response('denied', { status: 403 }) : { projectId: id },
}));

import { schemaStudioRoutes } from '../routes/schema-studio.openapi';
import { yschemaCompositionRoutes } from '../routes/yschema-composition.openapi';

const app = new Hono();
app.route('/', schemaStudioRoutes);
app.route('/', yschemaCompositionRoutes);
function request(action: string, body: unknown, method = 'POST', projectId = target) {
  return app.request(`/v1/projects/${projectId}/schema-studio/${action}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
const contribution = { nodes: { advantage: { slots: { title: { type: 'string' } } } } };
async function prepare(
  workspaceId: string,
  localContribution: unknown = contribution,
  candidateId = baseId,
  projectId = target
) {
  await insertBranch(db, { projectId, name: workspaceId });
  await upsertWorkspaceDraft(db, {
    project_id: projectId,
    workspace_id: workspaceId,
    target_branch: workspaceId,
    title: workspaceId,
    workspace_state: {
      title: workspaceId,
      targetBranch: workspaceId,
      schemaBindings: [],
      yopsDraft: { operations: [] },
      extractionProposal: { preserved: true },
    },
  });
  const savedResponse = await request(
    `edit-candidates/${workspaceId}`,
    {
      workspaceId,
      candidateIds: [candidateId],
      ifRevision: 0,
      retryKey: `save-${workspaceId}`,
      intent: 'Add local advantage',
      origin: 'studio',
      localContribution,
    },
    'PUT',
    projectId
  );
  expect(savedResponse.status).toBe(200);
  const saved = (await savedResponse.json()).data;
  const previewResponse = await request(
    'preview',
    {
      workspaceId,
      candidateIds: [candidateId],
      schemaEditCandidate: {
        candidateId: saved.candidate.candidateId,
        revision: saved.candidate.revision,
      },
    },
    'POST',
    projectId
  );
  expect(previewResponse.status).toBe(200);
  const preview: StudioPreview = (await previewResponse.json()).data;
  const input: StudioPublishInput = {
    visibility: 'community',
    candidateIds: [candidateId],
    schemaEditCandidate: {
      candidateId: saved.candidate.candidateId,
      revision: saved.candidate.revision,
    },
    ifRevision: preview.workspace!.revision,
    reviewHash: preview.reviewHash,
    canonicalName: `projects/${projectId}/${workspaceId}`,
    version: '1.0.0',
    title: 'Derived Schema',
    description: 'Local advantage',
    releaseNotes: 'First release',
    tags: [],
  };
  return { input, preview };
}
beforeAll(async () => {
  const setup = await setupTestDB();
  db = setup.db;
  cleanup = setup.cleanup;
  target = (
    await insertProject(db, {
      ...testData.project({ name: 'Publish target' }),
      ownerId: 'schema-publisher',
    })
  ).projectId;
  source = (await insertProject(db, testData.project({ name: 'Publish source' }))).projectId;
  foreign = (await insertProject(db, testData.project({ name: 'Foreign project' }))).projectId;
  const schema = normalizeYSchemaObject({
    yschema: '0.1',
    name: 'team/base',
    strict: true,
    version: '1.0.0',
    nodes: { product: { slots: { title: { type: 'string' } } } },
    rules: [],
  });
  baseManifest = {
    apiVersion: 't3x.dev/yschema-blueprint/v1',
    canonicalName: 'team/publish-base',
    version: '1.0.0',
    schema,
    registry: {
      schemaHash: await sha256CompositionValue(schema),
      renderPlan: [],
      originsByPath: {},
    },
  };
  baseHash = await sha256CompositionValue(baseManifest);
  await upsertYSchemaArtifactVersion(db, {
    artifact_id: 'publish-base',
    artifact_version_id: 'publish-base-v1',
    canonical_name: 'team/publish-base',
    version: '1.0.0',
    family: 'open',
    kind: 'schema',
    visibility: 'private',
    owner_project_id: source,
    status: 'published',
    manifest_json: baseManifest,
    artifact_hash: baseHash,
    path_count: 2,
    provides: [],
    requires: [],
  });
  const added = await request('candidates', {
    sourceProjectId: source,
    canonicalName: 'team/publish-base',
    version: '1.0.0',
    expectedHash: baseHash,
  });
  expect(added.status).toBe(200);
  baseId = (await added.json()).data.id;
});
afterAll(async () => cleanup?.());

it('publishes a public namespace-owned Schema without mutating Workspace or upstream', async () => {
  const { input, preview } = await prepare('private-release');
  expect(preview.impact?.canPublish).toBe(true);
  const before = await findWorkspaceDraft(db, target, 'private-release');
  const result = await request('publish/private-release', input);
  expect(result.status).toBe(200);
  const release = (await result.json()).data;
  const stored = await findYSchemaArtifactVersion(db, {
    canonical_name: input.canonicalName,
    version: input.version,
    project_id: target,
  });
  expect(stored).toMatchObject({
    kind: 'schema',
    visibility: 'community',
    ownerProjectId: null,
    publisherNamespaceId: (await findProjectById(db, target))!.namespaceId,
    status: 'published',
    artifactHash: release.source.hash,
  });
  expect(stored!.manifest).toMatchObject({
    schema: {
      strict: true,
      name: input.canonicalName,
      version: input.version,
      nodes: { product: {}, advantage: contribution.nodes.advantage },
    },
    blueprint: {
      modules: [],
      baseSources: [{ hash: baseHash, projectId: source }],
      authoring: { workspaceId: 'private-release', revision: 1 },
    },
    registry: { schemaHash: release.schemaHash, compiledSchemaHash: preview.schemaHash },
  });
  expect(await sha256CompositionValue(stored!.manifest)).toBe(release.source.hash);
  expect(stored!.manifest.blueprint).not.toHaveProperty('authoringDraft');
  expect(stored!.manifest.blueprint).not.toHaveProperty('localContribution');
  expect(stored!.manifest.blueprint).not.toHaveProperty('authoring.intent');
  expect(stored!.manifest.blueprint).not.toHaveProperty('authoring.origin');
  expect(await sha256CompositionValue(stored!.manifest.schema)).toBe(release.schemaHash);
  expect(await findWorkspaceDraft(db, target, 'private-release')).toEqual(before);
  expect(
    (await findYSchemaArtifactVersion(db, {
      canonical_name: 'team/publish-base',
      version: '1.0.0',
      project_id: source,
    }))!.manifest
  ).toEqual(baseManifest);
  expect(
    await listProjectYSchemaVersionHistory(db, { project_id: target, kind: 'module' })
  ).toEqual([]);
  for (const project_id of [undefined, foreign]) {
    const page = await listYSchemaArtifactVersions(db, {
      ...(project_id ? { project_id } : {}),
      limit: 100,
    });
    // Legacy module picker lists active versions only; published Schemas use the catalog below.
    expect(page.items.some((item) => item.canonicalName === input.canonicalName)).toBe(false);
  }
  const retries = await Promise.all([
    request('publish/private-release', input),
    request('publish/private-release', input),
  ]);
  expect(retries.map((response) => response.status)).toEqual([200, 200]);
  for (const retry of retries) expect((await retry.json()).data).toEqual(release);
  expect(
    (await request('publish/private-release', { ...input, title: 'Changed bytes, same version' }))
      .status
  ).toBe(409);
  const second = await request('publish/private-release', {
    ...input,
    version: '1.1.0',
    releaseNotes: 'New version',
  });
  expect(second.status).toBe(200);
  const history = await listProjectYSchemaVersionHistory(db, {
    project_id: target,
    kind: 'schema',
  });
  expect(
    history
      .filter((item) => item.canonicalName === input.canonicalName)
      .map((item) => [item.version, item.status])
  ).toEqual([
    ['1.1.0', 'published'],
    ['1.0.0', 'published'],
  ]);
  const filter = new URLSearchParams({ canonical_name: input.canonicalName });
  const catalogResponse = await app.request(`/v1/projects/${target}/yschema/catalog?${filter}`);
  expect(catalogResponse.status).toBe(200);
  const catalog = (await catalogResponse.json()).data;
  expect(catalog.items).toHaveLength(2);
  expect(catalog.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        identity: expect.objectContaining({ canonicalName: input.canonicalName }),
        release: expect.objectContaining({
          kind: 'schema',
          version: '1.0.0',
          hash: release.source.hash,
        }),
      }),
    ])
  );
  for (const prefix of ['/v1', `/v1/projects/${foreign}`]) {
    const response = await app.request(`${prefix}/yschema/catalog?${filter}`);
    expect(response.status).toBe(200);
    expect((await response.json()).data.items).toHaveLength(2);
  }
  // Public releases are self-contained and independent of upstream access.
  denied.add(`${source}:project:read`);
  const query = new URLSearchParams({
    canonicalName: input.canonicalName,
    version: input.version,
    expectedHash: release.source.hash,
  });
  const historical = await app.request(`/v1/projects/${target}/schema-studio/source?${query}`);
  expect(historical.status).toBe(200);
  expect((await historical.json()).data.manifest).toEqual(stored!.manifest);
  query.set('expectedHash', `sha256:${'0'.repeat(64)}`);
  expect((await app.request(`/v1/projects/${target}/schema-studio/source?${query}`)).status).toBe(
    404
  );
  denied.delete(`${source}:project:read`);
  const addRelease = await request('candidates', {
    canonicalName: input.canonicalName,
    version: input.version,
    expectedHash: release.source.hash,
  });
  expect(addRelease.status).toBe(200);
  const roundtrip = await request('preview', { candidateIds: [(await addRelease.json()).data.id] });
  expect(roundtrip.status).toBe(200);
  expect((await roundtrip.json()).data.schemaHash).toBe(release.schemaHash);
});

it('keeps a public release discoverable and reusable after deleting its origin and revoking source access', async () => {
  const origin = await insertProject(db, {
    name: 'Disposable-schema-origin',
    ownerId: 'schema-publisher',
  });
  const added = await request(
    'candidates',
    {
      sourceProjectId: source,
      canonicalName: 'team/publish-base',
      version: '1.0.0',
      expectedHash: baseHash,
    },
    'POST',
    origin.projectId
  );
  expect(added.status).toBe(200);
  const candidateId = (await added.json()).data.id;
  const { input } = await prepare('retained-release', contribution, candidateId, origin.projectId);
  const published = await request('publish/retained-release', input, 'POST', origin.projectId);
  expect(published.status).toBe(200);
  const release = (await published.json()).data;
  expect(release).toMatchObject({ source: { projectId: null }, visibility: 'community' });
  await deleteProject(db, origin.projectId);
  const filter = new URLSearchParams({ canonical_name: input.canonicalName });
  expect(
    (await (await app.request(`/v1/yschema/catalog?${filter}`)).json()).data.items
  ).toHaveLength(1);
  await permanentDeleteProject(db, origin.projectId);
  denied.add(`${origin.projectId}:project:read`);
  denied.add(`${source}:project:read`);
  try {
    expect(await findWorkspaceDraft(db, origin.projectId, 'retained-release')).toBeNull();
    const read = await app.request(
      `/v1/projects/${foreign}/schema-studio/source?${new URLSearchParams({
        canonicalName: input.canonicalName,
        version: input.version,
        expectedHash: release.source.hash,
      })}`
    );
    expect(read.status).toBe(200);
    expect((await read.json()).data.manifest).toMatchObject({
      source: 'community',
      license: 'Apache-2.0',
      schema: { nodes: { advantage: contribution.nodes.advantage } },
    });
    const imported = await request(
      'candidates',
      {
        canonicalName: input.canonicalName,
        version: input.version,
        expectedHash: release.source.hash,
      },
      'POST',
      foreign
    );
    expect(imported.status).toBe(200);
    const candidate = (await imported.json()).data;
    expect(candidate.source.projectId).toBeNull();
    const preview = await request('preview', { candidateIds: [candidate.id] }, 'POST', foreign);
    expect(preview.status).toBe(200);
    expect((await preview.json()).data).toMatchObject({
      schemaHash: release.schemaHash,
      adoption: { allowed: true },
    });
  } finally {
    denied.delete(`${origin.projectId}:project:read`);
    denied.delete(`${source}:project:read`);
  }
});

it('rechecks authority, candidate/review/workspace freshness and refuses client supplied publication bytes', async () => {
  const { input } = await prepare('guarded-release');
  const { visibility: _visibility, ...legacyPrivateRequest } = input;
  expect((await request('publish/guarded-release', legacyPrivateRequest)).status).toBe(400);
  expect(
    (await request('publish/guarded-release', { ...input, visibility: 'private' })).status
  ).toBe(400);
  const outsider = new Hono();
  outsider.use('*', async (c, next) => {
    c.set('apiKey' as never, { user_id: 'unrelated-publisher', principal_kind: 'human' } as never);
    await next();
  });
  outsider.route('/', schemaStudioRoutes);
  expect(
    (
      await outsider.request(`/v1/projects/${target}/schema-studio/publish/guarded-release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
    ).status
  ).toBe(403);
  for (const patch of [
    { ifRevision: input.ifRevision + 1 },
    { reviewHash: `sha256:${'0'.repeat(64)}` },
    { schemaEditCandidate: { ...input.schemaEditCandidate, revision: 2 } },
  ]) {
    expect((await request('publish/guarded-release', { ...input, ...patch })).status).toBe(409);
  }
  for (const extra of [
    { schema: {} },
    { localContribution: { nodes: {} } },
    { visibility: 'official' },
    { kind: 'module' },
  ]) {
    expect((await request('publish/guarded-release', { ...input, ...extra })).status).toBe(400);
  }
  denied.add(`${target}:project:edit`);
  expect((await request('publish/guarded-release', input)).status).toBe(403);
  denied.delete(`${target}:project:edit`);
  denied.add(`${source}:project:edit`);
  expect((await request('publish/guarded-release', input)).status).toBe(403);
  denied.delete(`${source}:project:edit`);
  denied.add(`${source}:project:read`);
  expect((await request('publish/guarded-release', input)).status).toBe(404);
  denied.delete(`${source}:project:read`);
  expect(
    await findYSchemaArtifactVersion(db, {
      canonical_name: input.canonicalName,
      version: input.version,
      project_id: target,
    })
  ).toBeNull();
});

it('blocks invalid composition and unmet required content before writing a release', async () => {
  const { input, preview } = await prepare('required-release', {
    nodes: {
      advantage: { required: true, slots: { title: { type: 'string' } }, requiredSlots: ['title'] },
    },
  });
  expect(preview.impact?.canPublish).toBe(false);
  const before = await findWorkspaceDraft(db, target, 'required-release');
  const response = await request('publish/required-release', input);
  expect(response.status).toBe(409);
  expect((await response.json()).error.code).toBe('REVIEW_REQUIRED');
  expect(
    await findYSchemaArtifactVersion(db, {
      canonical_name: input.canonicalName,
      version: input.version,
      project_id: target,
    })
  ).toBeNull();
  expect(await findWorkspaceDraft(db, target, 'required-release')).toEqual(before);
});

it('publishes Module composition and local contribution through the same path, but rejects unresolved imports', async () => {
  async function addModule(name: string, imports: unknown[]) {
    const manifest = {
      apiVersion: 't3x.dev/yschema-module/v2',
      canonicalName: `team/${name}`,
      version: '1.0.0',
      title: name,
      description: '',
      status: 'active',
      source: 'team',
      tags: [],
      compatibility: { yschema: ['0.1'] },
      provides: [],
      imports,
      contribution: { nodes: { product: { slots: { title: { type: 'string' } } } } },
    };
    const hash = await sha256CompositionValue(manifest);
    await upsertYSchemaArtifactVersion(db, {
      artifact_id: name,
      artifact_version_id: `${name}-v1`,
      canonical_name: manifest.canonicalName,
      version: '1.0.0',
      family: 'open',
      kind: 'module',
      owner_project_id: source,
      visibility: 'private',
      status: 'published',
      manifest_json: manifest,
      artifact_hash: hash,
      path_count: 2,
      provides: [],
      requires: [],
    });
    const response = await request('candidates', {
      sourceProjectId: source,
      canonicalName: manifest.canonicalName,
      version: '1.0.0',
      expectedHash: hash,
    });
    expect(response.status).toBe(200);
    return { id: (await response.json()).data.id, hash, manifest };
  }
  const module = await addModule('publish-module', []);
  const { input } = await prepare('module-release', contribution, module.id);
  const response = await request('publish/module-release', input);
  expect(response.status).toBe(200);
  const stored = await findYSchemaArtifactVersion(db, {
    canonical_name: input.canonicalName,
    version: input.version,
    project_id: target,
  });
  expect(stored!.manifest).toMatchObject({
    blueprint: {
      modules: [
        { canonicalName: module.manifest.canonicalName, version: '1.0.0', hash: module.hash },
      ],
    },
    schema: { nodes: { product: {}, advantage: {} } },
  });
  const editing = await prepare('module-edited', {}, module.id);
  const definition = structuredClone(editing.preview.schema);
  (definition.nodes as typeof module.manifest.contribution.nodes).product.slots.title.type =
    'number';
  const editedResponse = await request(
    'edit-candidates/module-edited',
    {
      workspaceId: 'module-edited',
      candidateIds: [module.id],
      ifRevision: 1,
      retryKey: 'edit-module-field',
      intent: 'Change an existing Module field locally',
      origin: 'studio',
      localContribution: {},
      schemaDefinition: definition,
      baseSchemaHash: editing.preview.schemaHash,
    },
    'PUT'
  );
  expect(editedResponse.status).toBe(200);
  const edited = (await editedResponse.json()).data.candidate;
  expect(edited.authoringDraft.base.kind).toBe('composition');
  const editedRef = { candidateId: edited.candidateId, revision: edited.revision };
  const editedPreviewResponse = await request('preview', {
    workspaceId: 'module-edited',
    candidateIds: [module.id],
    schemaEditCandidate: editedRef,
  });
  expect(editedPreviewResponse.status).toBe(200);
  const editedPreview = (await editedPreviewResponse.json()).data;
  expect(editedPreview.schema.nodes.product.slots.title.type).toBe('number');
  expect(
    (
      await request('publish/module-edited', {
        ...editing.input,
        schemaEditCandidate: editedRef,
        ifRevision: editedPreview.workspace.revision,
        reviewHash: editedPreview.reviewHash,
      })
    ).status
  ).toBe(200);
  const originalModule = await findYSchemaArtifactVersion(db, {
    canonical_name: module.manifest.canonicalName,
    version: '1.0.0',
    project_id: source,
  });
  expect(originalModule!.manifest).toEqual(module.manifest);
  const invalid = await addModule('missing-import', [
    { capability: 'missing-provider', version: 1, mode: 'required' },
  ]);
  const bad = await prepare('invalid-release', contribution, invalid.id);
  expect(bad.preview.report.valid).toBe(false);
  const deniedPublication = await request('publish/invalid-release', bad.input);
  expect(deniedPublication.status).toBe(409);
  expect(
    await findYSchemaArtifactVersion(db, {
      canonical_name: bad.input.canonicalName,
      version: bad.input.version,
      project_id: target,
    })
  ).toBeNull();
});

it('uses the same license, immutable hash and lifecycle gates for Studio and legacy Workbench', async () => {
  const manifest = {
    apiVersion: 't3x.dev/yschema-module/v2',
    canonicalName: 'community/unlicensed',
    version: '1.0.0',
    title: 'Unlicensed',
    description: '',
    status: 'active',
    source: 'community',
    tags: [],
    compatibility: { yschema: ['0.1'] },
    provides: [],
    imports: [],
    contribution: { nodes: { product: { slots: {} } } },
  };
  await upsertYSchemaArtifactVersion(db, {
    artifact_id: 'unlicensed',
    artifact_version_id: 'unlicensed-v1',
    canonical_name: manifest.canonicalName,
    version: '1.0.0',
    family: 'open',
    kind: 'module',
    visibility: 'community',
    owner_project_id: source,
    status: 'active',
    manifest_json: manifest,
    artifact_hash: await sha256CompositionValue(manifest),
    path_count: 1,
    provides: [],
    requires: [],
  });
  const added = await request('candidates', {
    sourceProjectId: source,
    canonicalName: manifest.canonicalName,
    version: '1.0.0',
  });
  expect(added.status).toBe(200);
  const candidateId = (await added.json()).data.id;
  const studio = await request('preview', { candidateIds: [candidateId] });
  expect((await studio.json()).data.adoption.allowed).toBe(false);
  const composition = {
    apiVersion: 't3x.dev/yschema-composition/v2',
    id: 'test/source-policy',
    revision: 1,
    status: 'draft',
    modules: [{ canonicalName: manifest.canonicalName, version: '1.0.0', presentationOrder: 0 }],
  };
  const legacyPreview = () =>
    app.request(`/v1/projects/${target}/yschema/compositions/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(composition),
    });
  expect((await legacyPreview()).status).toBe(403);
  const licensed = {
    ...builtInPrdCoreArtifact,
    canonicalName: 'community/licensed-core',
    license: 'MIT',
  };
  const core = await upsertYSchemaArtifactVersion(db, {
    artifact_id: 'licensed-core',
    artifact_version_id: 'licensed-core-v1',
    canonical_name: licensed.canonicalName,
    version: licensed.version,
    family: 'prd',
    kind: 'core',
    visibility: 'community',
    owner_project_id: source,
    status: 'active',
    manifest_json: licensed,
    artifact_hash: await sha256CompositionValue(licensed),
    path_count: 1,
    provides: [],
    requires: [],
  });
  const pinned = await request('candidates', {
    sourceProjectId: source,
    canonicalName: licensed.canonicalName,
    version: licensed.version,
  });
  const licensedCandidateId = (await pinned.json()).data.id;
  composition.modules[0] = {
    canonicalName: licensed.canonicalName,
    version: licensed.version,
    presentationOrder: 0,
  };
  expect((await legacyPreview()).status).toBe(200);
  denied.add(`${source}:project:read`);
  expect((await request('preview', { candidateIds: [licensedCandidateId] })).status).toBe(404);
  expect((await legacyPreview()).status).toBe(403);
  denied.delete(`${source}:project:read`);
  expect(
    (await (await request('preview', { candidateIds: [licensedCandidateId] })).json()).data.adoption
      .allowed
  ).toBe(true);
  const archived = await updateYSchemaArtifactIdentity(db, {
    project_id: source,
    artifact_id: core.artifactId,
    if_revision: 1,
    lifecycle_status: 'archived',
  });
  expect(archived?.lifecycleStatus).toBe('archived');
  expect((await request('preview', { candidateIds: [licensedCandidateId] })).status).toBe(404);
  expect((await legacyPreview()).status).toBe(403);
});

it('rejects invalid edits, altered root constraints and stale Base hashes without replacing the saved candidate', async () => {
  const { input } = await prepare('invalid-effect');
  const before = await findWorkspaceDraft(db, target, 'invalid-effect');
  const base = normalizeYSchemaObject(baseManifest.schema);
  const body = {
    workspaceId: 'invalid-effect',
    candidateIds: [baseId],
    ifRevision: input.schemaEditCandidate.revision,
    retryKey: 'bad-effect',
    intent: 'Invalid edit',
    origin: 'studio',
    localContribution: {},
    baseSchemaHash: await sha256CompositionValue(base),
    schemaDefinition: base,
  };
  for (const schemaDefinition of [
    { ...base, strict: false },
    { ...base, nodes: { product: { slots: { title: { type: 'unsupported' } } } } },
  ]) {
    expect(
      (await request('edit-candidates/invalid-effect', { ...body, schemaDefinition }, 'PUT')).status
    ).toBe(400);
  }
  expect(
    (
      await request(
        'edit-candidates/invalid-effect',
        { ...body, baseSchemaHash: `sha256:${'0'.repeat(64)}` },
        'PUT'
      )
    ).status
  ).toBe(409);
  expect(await findWorkspaceDraft(db, target, 'invalid-effect')).toEqual(before);
});
