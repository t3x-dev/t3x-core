import {
  type AnyDB,
  findWorkspaceDraft,
  insertProject,
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
import { resolveWorkspaceYSchema } from '../lib/workspace-yschema';
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
let coreId: string;
let schemaId: string;
let moduleId: string;
async function request(action: string, body: unknown) {
  return app.request(`/v1/projects/${target}/schema-studio/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
async function candidate(
  name: string,
  manifest: Record<string, unknown>,
  kind: 'core' | 'module' | 'schema'
) {
  const hash = await sha256CompositionValue(manifest);
  await upsertYSchemaArtifactVersion(db, {
    artifact_id: `apply-${name}`,
    artifact_version_id: `apply-${name}-v1`,
    canonical_name: `team/${name}`,
    version: '1.0.0',
    family: 'open',
    kind,
    visibility: 'private',
    owner_project_id: source,
    status: 'published',
    manifest_json: manifest,
    artifact_hash: hash,
    path_count: 11,
    provides: [],
    requires: [],
  });
  const response = await request('candidates', {
    sourceProjectId: source,
    canonicalName: `team/${name}`,
    version: '1.0.0',
    expectedHash: hash,
  });
  expect(response.status).toBe(200);
  return (await response.json()).data.id as string;
}
beforeAll(async () => {
  const setup = await setupTestDB();
  db = setup.db;
  cleanup = setup.cleanup;
  target = (await insertProject(db, testData.project({ name: 'Apply target' }))).projectId;
  source = (await insertProject(db, testData.project({ name: 'Apply source' }))).projectId;
  await upsertWorkspaceDraft(db, {
    project_id: target,
    workspace_id: 'work',
    title: 'Work',
    workspace_state: {
      title: 'Work',
      targetBranch: 'main',
      schemaBindings: [],
      yopsDraft: { id: 'old', operations: [{ op: 'set' }] },
      commitOverride: { reason: 'stale' },
      extractionProposal: { stale: true },
    },
  });
  coreId = await candidate(
    'core',
    { ...builtInPrdCoreArtifact, canonicalName: 'team/core', version: '1.0.0' },
    'core'
  );
  const schema = normalizeYSchemaObject(builtInPrdCoreArtifact.schema);
  schemaId = await candidate(
    'whole',
    {
      apiVersion: 't3x.dev/yschema-blueprint/v1',
      schema,
      registry: {
        compiledSchemaHash: await sha256CompositionValue({ ...schema, name: 'compiler-input' }),
        schemaHash: await sha256CompositionValue(schema),
        renderPlan: [],
        originsByPath: {},
      },
    },
    'schema'
  );
  moduleId = await candidate(
    'dependent',
    {
      apiVersion: 't3x.dev/yschema-module/v2',
      canonicalName: 'team/dependent',
      version: '1.0.0',
      title: 'Dependent',
      description: '',
      status: 'active',
      source: 'team',
      tags: [],
      compatibility: { yschema: ['0.1'] },
      provides: [],
      imports: [{ capability: 'missing-provider', version: 1, mode: 'required' }],
      contribution: { nodes: { dependent: { slots: {} } } },
    },
    'module'
  );
});
afterAll(async () => cleanup?.());
it('compiles deterministically, compares definitions, and keeps preview read-only', async () => {
  const input = { candidateIds: [coreId], workspaceId: 'work', compareToCandidateIds: [schemaId] };
  const before = await findWorkspaceDraft(db, target, 'work');
  const a = (await (await request('preview', input)).json()).data;
  const b = (await (await request('preview', input)).json()).data;
  expect(a.reviewHash).toBe(b.reviewHash);
  expect(a.schemaHash).toBe(b.schemaHash);
  expect(a.report.valid).toBe(true);
  expect(a.workspace.changes.length).toBeGreaterThan(0);
  expect(a.comparison.changes).toEqual([]);
  expect((await findWorkspaceDraft(db, target, 'work'))?.revision).toBe(before?.revision);
  expect((await request('preview', { candidateIds: [schemaId, coreId] })).status).toBe(400);
  expect((await request('preview', { candidateIds: ['foreign-candidate'] })).status).toBe(404);
  const invalid = (
    await (await request('preview', { candidateIds: [moduleId], workspaceId: 'work' })).json()
  ).data;
  expect(invalid.report.valid).toBe(false);
  expect(
    invalid.report.issues.some(
      (issue: { code: string }) => issue.code === 'REQUIRED_IMPORT_MISSING'
    )
  ).toBe(true);
  expect(
    (
      await request('apply', {
        candidateIds: [moduleId],
        workspaceId: 'work',
        ifRevision: invalid.workspace.revision,
        reviewHash: invalid.reviewHash,
      })
    ).status
  ).toBe(409);
});
it('requires source redistribution and target edit authority and rejects stale review hashes', async () => {
  denied.add(`${source}:project:edit`);
  const preview = (
    await (await request('preview', { candidateIds: [coreId], workspaceId: 'work' })).json()
  ).data;
  expect(preview.adoption.allowed).toBe(false);
  expect(
    (
      await request('apply', {
        candidateIds: [coreId],
        workspaceId: 'work',
        ifRevision: preview.workspace.revision,
        reviewHash: preview.reviewHash,
      })
    ).status
  ).toBe(403);
  denied.clear();
  denied.add(`${target}:project:edit`);
  expect(
    (
      await request('apply', {
        candidateIds: [coreId],
        workspaceId: 'work',
        ifRevision: preview.workspace.revision,
        reviewHash: preview.reviewHash,
      })
    ).status
  ).toBe(403);
  denied.clear();
  expect(
    (
      await request('apply', {
        candidateIds: [coreId],
        workspaceId: 'work',
        ifRevision: preview.workspace.revision,
        reviewHash: `sha256:${'0'.repeat(64)}`,
      })
    ).status
  ).toBe(409);
});
it('applies once with CAS, invalidates stale diagnostics and retains exact adopted schema after withdrawal', async () => {
  const preview = (
    await (await request('preview', { candidateIds: [schemaId], workspaceId: 'work' })).json()
  ).data;
  const body = {
    candidateIds: [schemaId],
    workspaceId: 'work',
    ifRevision: preview.workspace.revision,
    reviewHash: preview.reviewHash,
  };
  const responses = await Promise.all([request('apply', body), request('apply', body)]);
  expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
  const saved = (await findWorkspaceDraft(db, target, 'work'))!;
  expect(saved.workspace_state.schemaBindings[0]).toMatchObject({
    mode: 'pinned',
    rootKey: 'candidate',
    schemaHash: preview.schemaHash,
  });
  expect(saved.workspace_state.schemaReview.verdict).toBe('needs_review');
  expect(saved.workspace_state.yopsDraft.operations).toEqual([]);
  expect(saved.workspace_state.commitOverride).toBeUndefined();
  expect(saved.workspace_state.extractionProposal).toBeUndefined();
  expect((await resolveWorkspaceYSchema(saved.workspace_state, db, target)).schema).not.toBeNull();
  await updateYSchemaArtifactIdentity(db, {
    artifact_id: 'apply-whole',
    project_id: source,
    if_revision: 1,
    lifecycle_status: 'archived',
  });
  expect((await request('preview', { candidateIds: [schemaId] })).status).toBe(404);
  expect((await resolveWorkspaceYSchema(saved.workspace_state, db, target)).schema).not.toBeNull();
  denied.add(`${source}:project:read`);
  expect((await request('preview', { candidateIds: [coreId] })).status).toBe(404);
  denied.clear();
});

it('projects locks only for declared required imports, not legacy suggestions', async () => {
  const base = {
    apiVersion: 't3x.dev/yschema-module/v2',
    version: '1.0.0',
    title: 'Lock test',
    description: '',
    status: 'active',
    source: 'team',
    tags: [],
    compatibility: { yschema: ['0.1'] },
    contribution: { nodes: {} },
  };
  const provider = await candidate(
    'lock-provider',
    {
      ...base,
      canonicalName: 'team/lock-provider',
      provides: [{ capability: 'lock-base', version: 1 }],
      imports: [],
    },
    'module'
  );
  const consumer = await candidate(
    'lock-consumer',
    {
      ...base,
      canonicalName: 'team/lock-consumer',
      provides: [],
      imports: [{ capability: 'lock-base', version: 1, mode: 'required' }],
    },
    'module'
  );
  const response = await request('preview', { candidateIds: [provider, consumer] });
  expect(response.status).toBe(200);
  const preview = (await response.json()).data;
  expect(preview.report.valid).toBe(true);
  expect(preview.modules).toEqual([
    { candidateId: provider, requiredBy: ['team/lock-consumer'] },
    { candidateId: consumer, requiredBy: [] },
  ]);
  const missing = (await (await request('preview', { candidateIds: [consumer] })).json()).data;
  expect(missing.report.valid).toBe(false);
  const legacy = await request('candidates', {
    canonicalName: 't3x/prd-system-architecture',
    version: '1.0.0',
  });
  const legacyId = (await legacy.json()).data.id;
  const open = (await (await request('preview', { candidateIds: [legacyId] })).json()).data;
  expect(open.report.valid).toBe(true);
  expect(open.modules).toEqual([{ candidateId: legacyId, requiredBy: [] }]);
});

it('rejects a published schema with an incorrect or missing published-schema digest', async () => {
  const schema = normalizeYSchemaObject(builtInPrdCoreArtifact.schema);
  for (const [name, registry] of [
    ['wrong-digest', { schemaHash: `sha256:${'0'.repeat(64)}` }],
    ['missing-digest', {}],
  ] as const) {
    const id = await candidate(
      name,
      {
        apiVersion: 't3x.dev/yschema-blueprint/v1',
        schema,
        registry: { ...registry, compiledSchemaHash: await sha256CompositionValue(schema) },
      },
      'schema'
    );
    expect((await request('preview', { candidateIds: [id] })).status).toBe(409);
  }
});
