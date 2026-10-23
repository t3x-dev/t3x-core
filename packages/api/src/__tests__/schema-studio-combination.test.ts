import {
  type AnyDB,
  findWorkspaceDraft,
  insertProject,
  upsertWorkspaceDraft,
  upsertYSchemaArtifactVersion,
} from '@t3x-dev/storage';
import { normalizeYSchemaObject, sha256CompositionValue } from '@t3x-dev/yschema';
import { Hono } from 'hono';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

let db: AnyDB, cleanup: () => Promise<void>, project: string;
vi.mock('../lib/db', () => ({ getDB: () => Promise.resolve(db) }));
vi.mock('../lib/project-access', () => ({
  getProjectAccessPrincipal: () => undefined,
  assertProjectAccess: async () => ({ projectId: project }),
}));

import { schemaStudioRoutes } from '../routes/schema-studio.openapi';

const app = new Hono().route('/', schemaStudioRoutes);
const base = () => `/v1/projects/${project}/schema-studio`;
async function request(path: string, input?: unknown, method = input ? 'POST' : 'GET') {
  const response = await app.request(`${base()}/${path}`, {
    method,
    ...(input
      ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }
      : {}),
  });
  return { status: response.status, body: await response.json() };
}
let a: string, b: string, c: string;
async function source(id: string, nodes: Record<string, unknown>, strict = false) {
  const schema = normalizeYSchemaObject({ yschema: '0.1', name: id, strict, nodes });
  const manifest = {
    apiVersion: 't3x.dev/yschema-blueprint/v1',
    canonicalName: `team/${id}`,
    version: '1.0.0',
    schema,
    license: 'MIT',
    registry: { schemaHash: await sha256CompositionValue(schema) },
  };
  await upsertYSchemaArtifactVersion(db, {
    artifact_id: id,
    artifact_version_id: `${id}-v1`,
    canonical_name: `team/${id}`,
    version: '1.0.0',
    family: 'general',
    kind: 'schema',
    visibility: 'private',
    owner_project_id: project,
    status: 'published',
    manifest_json: manifest,
    artifact_hash: await sha256CompositionValue(manifest),
    path_count: 1,
    provides: [],
    requires: [],
  });
  const added = await request('candidates', {
    sourceProjectId: project,
    canonicalName: `team/${id}`,
    version: '1.0.0',
  });
  expect(added.status).toBe(200);
  return added.body.data.id as string;
}
beforeAll(async () => {
  const setup = await setupTestDB();
  db = setup.db;
  cleanup = setup.cleanup;
  project = (await insertProject(db, testData.project({ name: 'Schema combinations' }))).projectId;
  a = await source('combine_a', { checklist: { slots: { title: { type: 'string' } } } }, true);
  b = await source('combine_b', { owner: { slots: { name: { type: 'string' } } } });
  c = await source('combine_c', { checklist: { slots: { title: { type: 'number' } } } });
  await upsertWorkspaceDraft(db, {
    project_id: project,
    workspace_id: 'main',
    target_branch: 'main',
    title: 'Main',
    workspace_state: {
      title: 'Main',
      targetBranch: 'main',
      schemaBindings: [],
      yopsDraft: { operations: [] },
    },
  });
});
afterAll(async () => cleanup?.());
it('requires explicit root ownership, combines intact definitions, saves and recovers exact provenance', async () => {
  const unresolved = await request('preview', { candidateIds: [a, b] });
  expect(unresolved.status).toBe(200);
  expect(unresolved.body.data.report.valid).toBe(false);
  expect(unresolved.body.data.compositionConflicts).toContainEqual(
    expect.objectContaining({ path: '$metadata', candidates: [a, b], selected: null })
  );
  const composition = { $metadata: a };
  const preview = await request('preview', { candidateIds: [a, b], composition });
  expect(preview.status).toBe(200);
  expect(preview.body.data.report.valid).toBe(true);
  expect(preview.body.data.schema).toMatchObject({
    strict: true,
    nodes: { checklist: {}, owner: {} },
  });
  const definition = structuredClone(preview.body.data.schema);
  definition.nodes.checklist.slots.due_date = { type: 'string' };
  definition.nodes.checklist.requiredSlots = ['due_date'];
  const saved = await request(
    'edit-candidates/main',
    {
      workspaceId: 'main',
      candidateIds: [a, b],
      ifRevision: 0,
      retryKey: 'combine-first',
      intent: 'Combine sources',
      origin: 'studio',
      localContribution: {},
      schemaDefinition: definition,
      baseSchemaHash: preview.body.data.schemaHash,
      composition,
      rebase: true,
    },
    'PUT'
  );
  expect(saved.status, JSON.stringify(saved.body)).toBe(200);
  const recovered = await request('edit-candidates/main');
  expect(recovered.body.data.composition).toEqual(composition);
  expect(recovered.body.data.baseSources).toHaveLength(2);
  const checked = await request('preview', {
    candidateIds: [a, b],
    workspaceId: 'main',
    schemaEditCandidate: {
      candidateId: recovered.body.data.candidateId,
      revision: recovered.body.data.revision,
    },
  });
  expect(checked.status, JSON.stringify(checked.body)).toBe(200);
  expect(checked.body.data.schema).toEqual(definition);
  expect(checked.body.data.report.valid).toBe(true);
});
it('resolves duplicate nodes explicitly and rebases while guarding stale writes', async () => {
  const unresolved = await request('preview', {
    candidateIds: [a, c],
    composition: { $metadata: a },
  });
  expect(unresolved.body.data.report.valid).toBe(false);
  expect(unresolved.body.data.compositionConflicts).toContainEqual(
    expect.objectContaining({ path: 'nodes/checklist', candidates: [a, c] })
  );
  const composition = { $metadata: a, 'nodes/checklist': c };
  const combined = await request('preview', { candidateIds: [a, c], composition });
  expect(combined.body.data.report.valid).toBe(true);
  expect(combined.body.data.schema.nodes.checklist.slots.title.type).toBe('number');
  const definition = structuredClone(combined.body.data.schema);
  definition.nodes.checklist.slots.due_date = { type: 'string' };
  const input = {
    workspaceId: 'main',
    candidateIds: [a, c],
    ifRevision: 1,
    retryKey: 'combine-rebase',
    intent: 'Rebase preserved edit',
    origin: 'studio',
    localContribution: {},
    schemaDefinition: definition,
    baseSchemaHash: combined.body.data.schemaHash,
    composition,
    rebase: true,
  };
  const saved = await request('edit-candidates/main', input, 'PUT');
  expect(saved.status, JSON.stringify(saved.body)).toBe(200);
  expect(saved.body.data.candidate.revision).toBe(2);
  const stale = await request('edit-candidates/main', { ...input, retryKey: 'stale-write' }, 'PUT');
  expect(stale.status).toBe(409);
  const checked = await request('preview', {
    workspaceId: 'main',
    candidateIds: [a, c],
    schemaEditCandidate: { candidateId: saved.body.data.candidate.candidateId, revision: 2 },
  });
  expect(checked.status, JSON.stringify(checked.body)).toBe(200);
  expect(checked.body.data.schema.nodes.checklist.slots.due_date.type).toBe('string');
});
it('rejects a foreign owner decision and unresolved definitions without replacing the saved candidate', async () => {
  expect(
    (await request('preview', { candidateIds: [a, b], composition: { $metadata: 'not-selected' } }))
      .status
  ).toBe(400);
  const invalid = await request(
    'edit-candidates/main',
    {
      workspaceId: 'main',
      candidateIds: [a, c],
      ifRevision: 2,
      retryKey: 'unresolved',
      intent: 'Unresolved',
      origin: 'studio',
      localContribution: {},
      rebase: true,
    },
    'PUT'
  );
  expect(invalid.status).toBe(400);
  expect((await request('edit-candidates/main')).body.data.revision).toBe(2);
});

it('recovers composition ownership from a bound snapshot and edits it in a fresh Workspace', async () => {
  const candidate = (await request('edit-candidates/main')).body.data;
  const schemaEditCandidate = { candidateId: candidate.candidateId, revision: candidate.revision };
  const preview = (
    await request('preview', {
      workspaceId: 'main',
      candidateIds: [a, c],
      schemaEditCandidate,
    })
  ).body.data;
  const applied = await request('apply', {
    workspaceId: 'main',
    candidateIds: [a, c],
    schemaEditCandidate,
    ifRevision: preview.workspace.revision,
    reviewHash: preview.reviewHash,
  });
  expect(applied.status, JSON.stringify(applied.body)).toBe(200);
  const bound = (await findWorkspaceDraft(db, project, 'main'))!;
  await upsertWorkspaceDraft(db, {
    project_id: project,
    workspace_id: 'bound-copy',
    target_branch: 'bound-copy',
    title: 'Bound copy',
    workspace_state: {
      title: 'Bound copy',
      targetBranch: 'bound-copy',
      schemaBindings: bound.workspace_state.schemaBindings,
      yopsDraft: { operations: [] },
    },
  });
  const restored = await request('preview', { workspaceId: 'bound-copy', candidateIds: [a, c] });
  expect(restored.status, JSON.stringify(restored.body)).toBe(200);
  expect(restored.body.data.composition).toEqual(candidate.composition);
  expect(restored.body.data.schema).toEqual(preview.schema);
  expect(restored.body.data.report.valid).toBe(true);
  const definition = structuredClone(restored.body.data.schema);
  definition.nodes.checklist.slots.priority = { type: 'number' };
  const saved = await request(
    'edit-candidates/bound-copy',
    {
      workspaceId: 'bound-copy',
      candidateIds: [a, c],
      ifRevision: 0,
      retryKey: 'edit-bound-combination',
      intent: 'Edit bound combination',
      origin: 'studio',
      localContribution: {},
      schemaDefinition: definition,
      baseSchemaHash: restored.body.data.schemaHash,
    },
    'PUT'
  );
  expect(saved.status, JSON.stringify(saved.body)).toBe(200);
  const recovered = await request('preview', {
    workspaceId: 'bound-copy',
    candidateIds: [a, c],
    schemaEditCandidate: { candidateId: saved.body.data.candidate.candidateId, revision: 1 },
  });
  expect(recovered.status, JSON.stringify(recovered.body)).toBe(200);
  expect(recovered.body.data.schema).toEqual(definition);
});
