import {
  type AnyDB,
  findWorkspaceDraft,
  insertBranch,
  insertProject,
  saveYSchemaCompositionSnapshot,
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
import { initializeWorkspaceAuthoring } from '../lib/workspace-authoring';
import { resolveWorkspaceYSchema } from '../lib/workspace-yschema';
import { setupTestDB, testData } from './setup';

let db: AnyDB;
let cleanup: () => Promise<void>;
let target: string;
let source: string;
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
  expect(a.report.layers).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'definition', status: 'passed' }),
      expect.objectContaining({ id: 'workspace', status: 'warning' }),
    ])
  );
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
  expect(invalid.report.layers).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: 'composition', status: 'failed' })])
  );
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
it('previews a Workspace-local contribution on top of the immutable selection', async () => {
  for (const baseId of [coreId, schemaId]) {
    const input = {
      candidateIds: [baseId],
      workspaceId: 'work',
      localContribution: {
        nodes: {
          advantage: {
            required: false,
            slots: { title: { type: 'string', minLength: 1 } },
            requiredSlots: ['title'],
          },
        },
      },
    };
    const first = (await (await request('preview', input)).json()).data;
    const second = (await (await request('preview', input)).json()).data;
    expect(first.report.valid).toBe(true);
    expect(first.schema.nodes.advantage).toEqual(input.localContribution.nodes.advantage);
    expect(first.origins.advantage).toMatchObject({ kind: 'local', revision: 0 });
    expect(first.schemaHash).toBe(second.schemaHash);
    expect(first.reviewHash).toBe(second.reviewHash);
  }
});
it('reports current Workspace candidate content that no longer fits the selected schema', async () => {
  await upsertWorkspaceDraft(db, {
    project_id: target,
    workspace_id: 'content-check',
    target_branch: 'content-check',
    title: 'Content check',
    workspace_state: {
      title: 'Content check',
      targetBranch: 'content-check',
      schemaBindings: [],
      schemaCandidate: {
        summary: 'Existing candidate',
        fields: [
          {
            id: 'problem',
            path: 'summary.problem',
            label: 'Problem',
            type: 'number',
            required: true,
            status: 'type_mismatch',
            value: 42,
          },
        ],
      },
      yopsDraft: { operations: [] },
    },
  });
  const preview = (
    await (
      await request('preview', { candidateIds: [coreId], workspaceId: 'content-check' })
    ).json()
  ).data;
  const workspaceLayer = preview.report.layers.find(
    (layer: { id: string }) => layer.id === 'workspace'
  );
  expect(workspaceLayer).toMatchObject({
    id: 'workspace',
    status: 'failed',
  });
  expect(
    workspaceLayer.issues.some(
      (issue: { code: string; path?: string }) =>
        issue.code.startsWith('WORKSPACE_') && issue.path?.includes('summary')
    )
  ).toBe(true);
});
it('enforces content impact on Apply even when the caller has a current review hash', async () => {
  const schema = normalizeYSchemaObject({
    yschema: '0.1',
    name: 'Impact base',
    strict: false,
    nodes: { product: { slots: { title: { type: 'string' } } } },
  });
  const release = async (name: string, value: typeof schema) =>
    candidate(
      name,
      {
        apiVersion: 't3x.dev/yschema-blueprint/v1',
        schema: value,
        registry: {
          schemaHash: await sha256CompositionValue(value),
          renderPlan: [],
          originsByPath: {},
        },
      },
      'schema'
    );
  await release('impact-base', schema);
  const workspaceId = 'impact-apply';
  const schemaHash = await sha256CompositionValue(schema);
  const compositionId = 'impact-baseline';
  await saveYSchemaCompositionSnapshot(db, {
    snapshot_id: 'impact-baseline-snapshot',
    project_id: target,
    composition_id: compositionId,
    composition_revision: 1,
    composition_hash: schemaHash,
    compiled_schema_hash: schemaHash,
    compiler_version: 'impact-test',
    manifest_json: {},
    schema_json: schema as unknown as Record<string, unknown>,
    render_plan_json: [],
    origins_json: {},
  });
  await upsertWorkspaceDraft(db, {
    project_id: target,
    workspace_id: workspaceId,
    target_branch: workspaceId,
    title: 'Impact apply',
    workspace_state: {
      title: 'Impact apply',
      targetBranch: workspaceId,
      schemaBindings: [
        {
          canonicalName: 'team/impact-base',
          version: '1.0.0',
          rootKey: 'candidate',
          schemaHash,
          compositionId,
          compositionRevision: 1,
          compositionHash: schemaHash,
        },
      ],
      schemaCandidate: { fields: [{ path: 'product.title', value: 'Keep this value' }] },
      yopsDraft: { operations: [] },
    },
  });
  const before = await findWorkspaceDraft(db, target, workspaceId);
  for (const edit of ['remove', 'rename', 'type'] as const) {
    const next = structuredClone(schema);
    if (edit === 'remove') delete next.nodes.product;
    if (edit === 'rename') {
      next.nodes.overview = next.nodes.product!;
      delete next.nodes.product;
    }
    if (edit === 'type') next.nodes.product!.slots!.title.type = 'number';
    const id = await release(`impact-${edit}`, next);
    const response = await request('preview', { candidateIds: [id], workspaceId, sample: {} });
    expect(response.status).toBe(200);
    const preview = (await response.json()).data;
    expect(preview.impact).toMatchObject({
      status: 'needs_mapping',
      canAdopt: false,
      canPublish: false,
    });
    const applied = await request('apply', {
      candidateIds: [id],
      workspaceId,
      ifRevision: preview.workspace.revision,
      reviewHash: preview.reviewHash,
    });
    expect(applied.status).toBe(409);
    expect((await applied.json()).error.code).toBe('REVIEW_REQUIRED');
    expect(await findWorkspaceDraft(db, target, workspaceId)).toEqual(before);
  }
  const base = await release('impact-optional', {
    ...schema,
    nodes: { ...schema.nodes, advantage: { slots: {} } },
  });
  const safe = (await (await request('preview', { candidateIds: [base], workspaceId })).json())
    .data;
  expect(safe.impact).toMatchObject({ status: 'safe', canAdopt: true, canPublish: true });
  expect(
    (
      await request('apply', {
        candidateIds: [base],
        workspaceId,
        ifRevision: safe.workspace.revision,
        reviewHash: safe.reviewHash,
      })
    ).status
  ).toBe(200);
});

it('requires source redistribution and target edit authority and rejects stale review hashes', async () => {
  denied.add(`${source}:project:edit`);
  const preview = (
    await (await request('preview', { candidateIds: [coreId], workspaceId: 'work' })).json()
  ).data;
  expect(preview.adoption.allowed).toBe(false);
  expect(preview.report.layers).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: 'provenance', status: 'failed' })])
  );
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
it('adopts once with CAS, preserves all effective state, and retains pending intent after withdrawal', async () => {
  const before = (await findWorkspaceDraft(db, target, 'work'))!;
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
  expect(saved.workspace_state.schemaPending).toMatchObject({
    workspaceId: 'work',
    schemaHash: preview.schemaHash,
    workspaceRevision: saved.revision,
    source: { kind: 'studio', candidateIds: [schemaId] },
  });
  const { schemaPending: _pending, updatedAt: _updatedAt, ...unchanged } = saved.workspace_state;
  const { updatedAt: _oldUpdatedAt, ...original } = before.workspace_state;
  expect(unchanged).toEqual(original);
  const pendingUrl = `/v1/projects/${target}/schema-studio/pending/work`;
  expect((await (await app.request(pendingUrl)).json()).data.status).toBe('pending_preparation');
  const readRevision = saved.revision;
  denied.add(`${source}:project:edit`);
  expect((await (await app.request(pendingUrl)).json()).data).toMatchObject({
    status: 'unavailable',
    pending: null,
  });
  denied.clear();
  expect((await findWorkspaceDraft(db, target, 'work'))?.revision).toBe(readRevision);
  await updateYSchemaArtifactIdentity(db, {
    artifact_id: 'apply-whole',
    project_id: source,
    if_revision: 1,
    lifecycle_status: 'archived',
  });
  expect((await request('preview', { candidateIds: [schemaId] })).status).toBe(404);
  expect((await (await app.request(pendingUrl)).json()).data).toMatchObject({
    status: 'unavailable',
    pending: null,
  });
  expect((await findWorkspaceDraft(db, target, 'work'))?.workspace_state.schemaPending).toEqual(
    saved.workspace_state.schemaPending
  );
  denied.add(`${source}:project:read`);
  expect((await request('preview', { candidateIds: [coreId] })).status).toBe(404);
  denied.clear();
});

it('adopts a Module composition without activating a draft override and invalidates it on later edits', async () => {
  const workspaceId = 'composition-binding';
  await upsertWorkspaceDraft(db, {
    project_id: target,
    workspace_id: workspaceId,
    target_branch: workspaceId,
    title: 'Composition binding',
    workspace_state: {
      title: 'Composition binding',
      targetBranch: workspaceId,
      schemaBindings: [],
      yopsDraft: { operations: [] },
    },
  });
  const preview = (await (await request('preview', { candidateIds: [coreId], workspaceId })).json())
    .data;
  const response = await request('apply', {
    candidateIds: [coreId],
    workspaceId,
    ifRevision: preview.workspace.revision,
    reviewHash: preview.reviewHash,
  });
  expect(response.status).toBe(200);
  const adopted = (await response.json()).data;
  expect(adopted.outcome).toBe('pending_preparation');
  const saved = (await findWorkspaceDraft(db, target, workspaceId))!;
  expect(saved.workspace_state.schemaBindings).toEqual([]);
  const pendingUrl = `/v1/projects/${target}/schema-studio/pending/${workspaceId}`;
  expect((await (await app.request(pendingUrl)).json()).data.status).toBe('pending_preparation');
  await upsertWorkspaceDraft(
    db,
    {
      project_id: target,
      workspace_id: workspaceId,
      target_branch: workspaceId,
      title: 'Concurrent edit',
      workspace_state: { ...saved.workspace_state, title: 'Concurrent edit' },
    },
    saved.revision
  );
  expect((await (await app.request(pendingUrl)).json()).data).toMatchObject({
    status: 'stale',
    pending: adopted.pending,
  });
});

it('adopts a saved local candidate on an Authoring Ledger Workspace without mutating authoring facts', async () => {
  const workspaceId = 'ledger-pending';
  await insertBranch(db, { projectId: target, name: workspaceId });
  const draft = await upsertWorkspaceDraft(db, {
    project_id: target,
    workspace_id: workspaceId,
    target_branch: workspaceId,
    title: workspaceId,
    workspace_state: {
      targetBranch: workspaceId,
      schemaBindings: [],
      yopsDraft: { operations: [] },
    },
  });
  await initializeWorkspaceAuthoring(db, {
    projectId: target,
    workspaceId,
    expectedWorkspaceRevision: draft.revision,
    expectedRefHead: null,
    actionId: 'initialize:ledger-pending',
    actor: { kind: 'human', id: 'human:test' },
  });
  const editUrl = `/v1/projects/${target}/schema-studio/edit-candidates/${workspaceId}`;
  const save = async (revision: number) =>
    app.request(editUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId,
        candidateIds: [coreId],
        ifRevision: revision,
        retryKey: `ledger-edit:${revision}`,
        intent: 'Add an optional advantage node',
        origin: 'studio',
        localContribution: { nodes: { advantage: { slots: { title: { type: 'string' } } } } },
      }),
    });
  const edited = await save(0);
  expect(edited.status).toBe(200);
  const edit = (await edited.json()).data.candidate;
  const schemaEditCandidate = { candidateId: edit.candidateId, revision: edit.revision };
  const previewResponse = await request('preview', {
    candidateIds: [coreId],
    workspaceId,
    schemaEditCandidate,
  });
  expect(previewResponse.status).toBe(200);
  const preview = (await previewResponse.json()).data;
  expect(preview.schema.nodes.advantage).toBeDefined();
  const before = (await findWorkspaceDraft(db, target, workspaceId))!;
  const response = await request('apply', {
    candidateIds: [coreId],
    workspaceId,
    schemaEditCandidate,
    ifRevision: before.revision,
    reviewHash: preview.reviewHash,
  });
  expect(response.status).toBe(200);
  const saved = (await findWorkspaceDraft(db, target, workspaceId))!;
  const { schemaPending: _pending, updatedAt: _at, ...unchanged } = saved.workspace_state;
  const { updatedAt: _oldAt, ...original } = before.workspace_state;
  expect(unchanged).toEqual(original);
  expect(saved.workspace_state.authoringLedger).toBeDefined();
  const pendingUrl = `/v1/projects/${target}/schema-studio/pending/${workspaceId}`;
  expect((await (await app.request(pendingUrl)).json()).data.status).toBe('pending_preparation');
  expect((await save(edit.revision)).status).toBe(200);
  expect((await (await app.request(pendingUrl)).json()).data.status).toBe('stale');
  expect(
    (await findWorkspaceDraft(db, target, workspaceId))?.workspace_state.schemaPending
  ).toEqual(saved.workspace_state.schemaPending);
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

it('validates exact author and local samples against the selection without writing the Workspace', async () => {
  const response = await request('candidates', {
    canonicalName: 't3x/care-checklist',
    version: '1.0.0',
  });
  expect(response.status).toBe(200);
  const id = (await response.json()).data.id;
  const before = await findWorkspaceDraft(db, target, 'work');
  const input = { candidateIds: [id], workspaceId: 'work' };
  const author = (await (await request('preview', input)).json()).data;
  expect(author.samples).toHaveLength(1);
  expect(author.samples[0]).toMatchObject({
    ready: true,
    valid: true,
    source: { canonicalName: 't3x/care-checklist', version: '1.0.0' },
  });
  expect(author.samples[0].source.hash).toBe(author.sources[0].hash);
  expect(author.samples[0].value.checklist.title).toBe('Daily dog care');
  const broken = { checklist: { title: 'Local routine' }, items: { water: { done: false } } };
  const local = (await (await request('preview', { ...input, sample: broken })).json()).data;
  expect(local.localSample.ready).toBe(false);
  expect(
    local.localSample.issues.some((issue: { path: string }) => issue.path.includes('task'))
  ).toBe(true);
  expect(local.reviewHash).toBe(author.reviewHash);
  expect(local.samples).toEqual(author.samples);
  const fixed = (
    await (
      await request('preview', {
        ...input,
        sample: { ...broken, items: { water: { task: 'Refresh water', done: false } } },
      })
    ).json()
  ).data;
  expect(fixed.localSample.ready).toBe(true);
  const combined = (await (await request('preview', { candidateIds: [id, coreId] })).json()).data;
  expect(combined.samples[0].ready).toBe(false);
  expect(combined.selectionHash).not.toBe(author.selectionHash);
  expect(await findWorkspaceDraft(db, target, 'work')).toEqual(before);
  expect(
    (await request('preview', { ...input, sample: { content: 'x'.repeat(65537) } })).status
  ).toBe(400);
  let nested: Record<string, unknown> = {};
  for (let i = 0; i < 30; i++) nested = { child: nested };
  expect((await request('preview', { ...input, sample: nested })).status).toBe(400);
});

it('imports an initial YAML definition, resolves its immutable binding, and safely retries', async () => {
  const draft = await upsertWorkspaceDraft(db, {
    project_id: target,
    workspace_id: 'initial-upload',
    target_branch: 'initial-upload',
    title: 'Initial',
    workspace_state: {
      title: 'Initial',
      targetBranch: 'initial-upload',
      schemaBindings: [],
      yopsDraft: { operations: [] },
    },
  });
  const input = {
    workspaceId: 'initial-upload',
    ifRevision: draft.revision,
    filename: 'schema.yaml',
    yaml: JSON.stringify(normalizeYSchemaObject(builtInPrdCoreArtifact.schema)),
  };
  const response = await request('initial-schema', input);
  expect(response.status).toBe(200);
  const saved = await findWorkspaceDraft(db, target, 'initial-upload');
  expect(saved?.workspace_state?.schemaBindings[0]).toMatchObject({ mode: 'draft_override' });
  const resolved = await resolveWorkspaceYSchema(saved!.workspace_state!, db, target);
  expect(resolved.schema).toEqual(normalizeYSchemaObject(builtInPrdCoreArtifact.schema));
  expect((await request('initial-schema', input)).status).toBe(200);
  expect((await findWorkspaceDraft(db, target, 'initial-upload'))!.revision).toBe(saved!.revision);
});

it('rejects invalid YAML, denied writes, and importing over an existing proposal', async () => {
  const input = {
    workspaceId: 'work',
    ifRevision: 1,
    filename: 'schema.yaml',
    yaml: 'not: [valid',
  };
  expect((await request('initial-schema', input)).status).toBe(400);
  denied.add(`${target}:project:edit`);
  expect((await request('initial-schema', input)).status).toBe(403);
  denied.delete(`${target}:project:edit`);
  const draft = await findWorkspaceDraft(db, target, 'work');
  expect(
    (
      await request('initial-schema', {
        ...input,
        ifRevision: draft!.revision,
        yaml: JSON.stringify(normalizeYSchemaObject(builtInPrdCoreArtifact.schema)),
      })
    ).status
  ).toBe(409);
});
