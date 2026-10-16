import { currentComposition } from '@t3x-dev/application';
import type { ApiKey } from '@t3x-dev/core';
import {
  type AnyDB,
  findWorkspaceDraft,
  findYSchemaCompositionSnapshot,
  insertBranch,
  insertProject,
  saveYSchemaCompositionSnapshot,
  upsertWorkspaceDraft,
  upsertYSchemaArtifactVersion,
} from '@t3x-dev/storage';
import { normalizeYSchemaObject, sha256CompositionValue } from '@t3x-dev/yschema';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import {
  initializeWorkspaceAuthoring,
  publishWorkspaceAuthoringAction,
  workspaceAuthoringState,
} from '../lib/workspace-authoring';
import { resolveWorkspaceYSchema } from '../lib/workspace-yschema';
import { setupTestDB } from './setup';

const runtime = vi.hoisted(() => ({
  failSnapshot: false,
  movedHead: false,
  failedSnapshot: null as null | { compositionId: string; hash: string },
}));
let db: AnyDB;
let cleanup: () => Promise<void>;
let projectId: string;
let sourceId: string;
const denied = new Set<string>();
vi.mock('../lib/db', () => ({ getDB: async () => db }));
vi.mock('../lib/project-access', () => ({
  getProjectAccessPrincipal: () => undefined,
  assertProjectAccess: async (_c: unknown, _db: unknown, id: string, action: string) =>
    denied.has(`${id}:${action}`) ? new Response('denied', { status: 403 }) : { projectId: id },
}));
vi.mock('@t3x-dev/storage', async (original) => {
  const actual = await original<typeof import('@t3x-dev/storage')>();
  return {
    ...actual,
    saveYSchemaCompositionSnapshot: async (
      ...args: Parameters<typeof actual.saveYSchemaCompositionSnapshot>
    ) => {
      const saved = await actual.saveYSchemaCompositionSnapshot(...args);
      if (runtime.failSnapshot) {
        runtime.failedSnapshot = {
          compositionId: args[1].composition_id,
          hash: args[1].compiled_schema_hash,
        };
        throw new TypeError('Injected failure after snapshot persistence');
      }
      return saved;
    },
    getTransitionRefHead: async (...args: Parameters<typeof actual.getTransitionRefHead>) => {
      const head = await actual.getTransitionRefHead(...args);
      return runtime.movedHead ? { ...head, head: `sha256:${'f'.repeat(64)}` } : head;
    },
  };
});

import { schemaStudioRoutes } from '../routes/schema-studio.openapi';
import { yschemaCompositionRoutes } from '../routes/yschema-composition.openapi';

const app = new Hono().route('/', schemaStudioRoutes);
app.route('/', yschemaCompositionRoutes);
const baseSchema = normalizeYSchemaObject({
  yschema: '0.1',
  name: 'base',
  strict: false,
  nodes: { requirements: { slots: { title: { type: 'string' } } } },
});
const migratedSchema = normalizeYSchemaObject({
  yschema: '0.1',
  name: 'target',
  strict: false,
  nodes: {
    features: {
      required: true,
      requiredSlots: ['title'],
      slots: { title: { type: 'string', minLength: 1 } },
    },
  },
});
let renameId: string;
let inputId: string;
const post = (path: string, body: unknown, instance = app) =>
  instance.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
const studio = (action: string, body: unknown) =>
  post(`/v1/projects/${projectId}/schema-studio/${action}`, body);
const preparationPath = (workspaceId: string) =>
  `/v1/projects/${projectId}/schema-studio/preparation/${workspaceId}`;
async function addSchema(name: string, schema: ReturnType<typeof normalizeYSchemaObject>) {
  const manifest = {
    apiVersion: 't3x.dev/yschema-blueprint/v1',
    schema,
    registry: {
      compiledSchemaHash: await sha256CompositionValue({ ...schema, name: 'compiler-input' }),
      schemaHash: await sha256CompositionValue(schema),
      renderPlan: [],
      originsByPath: {},
    },
  };
  const hash = await sha256CompositionValue(manifest);
  await upsertYSchemaArtifactVersion(db, {
    artifact_id: name,
    artifact_version_id: `${name}-v1`,
    canonical_name: `test/${name}`,
    version: '1.0.0',
    kind: 'schema',
    family: 'open',
    visibility: 'private',
    owner_project_id: sourceId,
    status: 'published',
    artifact_hash: hash,
    manifest_json: manifest,
    path_count: 1,
    provides: [],
    requires: [],
  });
  const response = await studio('candidates', {
    sourceProjectId: sourceId,
    canonicalName: `test/${name}`,
    version: '1.0.0',
    expectedHash: hash,
  });
  expect(response.status).toBe(200);
  return (await response.json()).data.id as string;
}
async function seed(workspaceId: string, semantic = false) {
  await insertBranch(db, { projectId, name: workspaceId });
  const hash = await sha256CompositionValue(baseSchema);
  const compositionHash = await sha256CompositionValue({ workspaceId, schema: baseSchema });
  await saveYSchemaCompositionSnapshot(db, {
    snapshot_id: `base:${workspaceId}`,
    project_id: projectId,
    composition_id: `base:${workspaceId}`,
    composition_revision: 1,
    composition_hash: compositionHash,
    compiled_schema_hash: hash,
    compiler_version: 'test',
    manifest_json: {},
    schema_json: { ...baseSchema },
    render_plan_json: [],
    origins_json: {},
  });
  const draft = await upsertWorkspaceDraft(db, {
    project_id: projectId,
    workspace_id: workspaceId,
    target_branch: workspaceId,
    title: workspaceId,
    workspace_state: {
      title: workspaceId,
      targetBranch: workspaceId,
      yopsDraft: { operations: [{ id: 'retained-legacy-op' }] },
      schemaBindings: [
        {
          rootKey: 'candidate',
          canonicalName: `base:${workspaceId}`,
          mode: 'draft_override',
          compositionId: `base:${workspaceId}`,
          compositionRevision: 1,
          compositionHash,
          schemaHash: hash,
        },
      ],
    },
  });
  const document = semantic
    ? {
        domain: 't3x.dev/semantic-content',
        version: 1,
        content: {
          trees: [
            {
              key: 'candidate',
              slots: {},
              children: [{ key: 'requirements', slots: { title: 'Edited content' }, children: [] }],
            },
          ],
          relations: [],
        },
      }
    : { candidate: { requirements: { title: 'Original content' } } };
  const init = await initializeWorkspaceAuthoring(db, {
    projectId,
    workspaceId,
    expectedWorkspaceRevision: draft.revision,
    expectedRefHead: null,
    actionId: `import:${workspaceId}`,
    actor: { kind: 'human', id: 'human:local-user' },
    legacyDocument: document as never,
  });
  if (!semantic)
    await publishWorkspaceAuthoringAction(db, {
      projectId,
      workspaceId,
      actionId: `edit:${workspaceId}`,
      actor: { kind: 'human', id: 'human:local-user' },
      channel: 'manual',
      expectedRevision: init.value.ledger.compositionRevision,
      expectedWorkspaceRevision: init.draft.revision,
      expectedRefHead: null,
      operations: [{ set: { path: 'candidate/requirements/title', value: 'Edited content' } }],
    });
}
async function input(workspaceId: string, id = renameId) {
  const preview = (await (await studio('preview', { candidateIds: [id], workspaceId })).json())
    .data;
  return {
    target: { kind: 'studio' as const, candidateIds: [id], reviewHash: preview.reviewHash },
    ifRevision: preview.workspace.revision,
    commands: [] as unknown[],
    confirmedChanges: [] as string[],
  };
}
async function mapping(workspaceId: string, semantic = false, candidateId = renameId) {
  const body = await input(workspaceId, candidateId);
  const previewResponse = await post(`${preparationPath(workspaceId)}/preview`, body);
  expect(previewResponse.status).toBe(200);
  const initial = (await previewResponse.json()).data;
  expect(initial.canPrepare).toBe(false);
  body.commands = semantic
    ? [
        {
          kind: 'rename_node',
          path: 'content/trees/[key=candidate]/children/[key=requirements]',
          toKey: 'features',
        },
      ]
    : [{ kind: 'move', from: 'candidate/requirements', to: 'candidate/features' }];
  body.confirmedChanges = [
    ...new Set(
      initial.impact.items
        .filter((item: { kind: string }) => item.kind === 'needs_mapping')
        .map((item: { path: string }) => item.path)
    ),
  ] as string[];
  const response = await post(`${preparationPath(workspaceId)}/preview`, body);
  expect(response.status).toBe(200);
  const preview = (await response.json()).data;
  expect(preview.issues).toEqual([]);
  expect(preview.canPrepare).toBe(true);
  return { ...body, previewHash: preview.previewHash, requestId: `prepare:${workspaceId}` };
}
beforeAll(async () => {
  const setup = await setupTestDB();
  db = setup.db;
  cleanup = setup.cleanup;
  projectId = (await insertProject(db, { name: 'Schema preparation' })).projectId;
  sourceId = (await insertProject(db, { name: 'Preparation sources' })).projectId;
  renameId = await addSchema('renamed', migratedSchema);
  inputId = await addSchema(
    'input',
    normalizeYSchemaObject({
      ...baseSchema,
      nodes: {
        ...baseSchema.nodes,
        advantage: {
          required: true,
          requiredSlots: ['title'],
          slots: { title: { type: 'string', minLength: 1 } },
        },
      },
    })
  );
});
afterAll(async () => cleanup?.());
beforeEach(() => {
  runtime.failSnapshot = false;
  runtime.movedHead = false;
  denied.clear();
});

it('previews read-only, then atomically appends migration and Schema without losing earlier Draft actions', async () => {
  await seed('rename');
  const before = (await findWorkspaceDraft(db, projectId, 'rename'))!;
  const body = await mapping('rename');
  expect(await findWorkspaceDraft(db, projectId, 'rename')).toEqual(before);
  const response = await post(preparationPath('rename'), body);
  expect(response.status).toBe(200);
  const saved = (await findWorkspaceDraft(db, projectId, 'rename'))!;
  const ledger = workspaceAuthoringState(saved.workspace_state).ledger;
  const oldLedger = workspaceAuthoringState(before.workspace_state).ledger;
  expect(ledger.actions.slice(0, oldLedger.actions.length)).toEqual(oldLedger.actions);
  expect(ledger.actions).toHaveLength(oldLedger.actions.length + 1);
  expect(ledger.actions.at(-1)?.operations[0]).toHaveProperty('assert');
  expect(currentComposition(ledger)).toEqual({
    candidate: { features: { title: 'Edited content' } },
  });
  expect(saved.workspace_state.yopsDraft).toEqual(before.workspace_state.yopsDraft);
  expect(saved.workspace_state.authoringBasis).toEqual(before.workspace_state.authoringBasis);
  expect(saved.workspace_state.schemaBindings[0].mode).toBe('pinned');
  expect(saved.revision).toBe(before.revision + 1);
  expect((await resolveWorkspaceYSchema(saved.workspace_state, db, projectId)).schema).toEqual(
    migratedSchema
  );
  const retry = await post(preparationPath('rename'), body);
  expect(retry.status).toBe(200);
  expect((await retry.json()).data.outcome).toBe('reused');
  expect((await findWorkspaceDraft(db, projectId, 'rename'))?.revision).toBe(saved.revision);
  expect((await post(preparationPath('rename'), { ...body, commands: [] })).status).toBe(409);
});
it('prepares Pending required inputs, removes only the Pending marker and leaves history intact', async () => {
  await seed('inputs');
  const body = await input('inputs', inputId);
  const adopted = await studio('apply', {
    workspaceId: 'inputs',
    candidateIds: [inputId],
    ifRevision: body.ifRevision,
    reviewHash: body.target.reviewHash,
  });
  expect(adopted.status).toBe(200);
  const pending = (await adopted.json()).data;
  const plan = {
    target: { kind: 'pending', pendingId: pending.pending.pendingId },
    ifRevision: pending.workspaceRevision,
    commands: [{ kind: 'set', path: 'candidate/advantage', value: { title: 'Faster' } }],
    confirmedChanges: [],
  };
  const previewResponse = await post(`${preparationPath('inputs')}/preview`, plan);
  expect(previewResponse.status).toBe(200);
  const preview = (await previewResponse.json()).data;
  expect(preview.canPrepare).toBe(true);
  expect(
    (
      await post(preparationPath('inputs'), {
        ...plan,
        previewHash: preview.previewHash,
        requestId: 'fill-required',
      })
    ).status
  ).toBe(200);
  const saved = (await findWorkspaceDraft(db, projectId, 'inputs'))!;
  expect(saved.workspace_state.schemaPending).toBeUndefined();
  expect(currentComposition(workspaceAuthoringState(saved.workspace_state).ledger)).toMatchObject({
    candidate: {
      requirements: { title: 'Edited content' },
      advantage: { title: 'Faster' },
    },
  });
});
it('renames semantic nodes without discarding their stored fields', async () => {
  await seed('semantic', true);
  const body = await mapping('semantic', true);
  const response = await post(preparationPath('semantic'), body);
  expect(response.status).toBe(200);
  const saved = (await findWorkspaceDraft(db, projectId, 'semantic'))!;
  expect(currentComposition(workspaceAuthoringState(saved.workspace_state).ledger)).toMatchObject({
    content: {
      trees: [{ children: [{ key: 'features', slots: { title: 'Edited content' } }] }],
    },
  });
});
it('prepares a Composition Pending candidate through the same authoring transaction', async () => {
  await seed('composition');
  const module = {
    apiVersion: 't3x.dev/yschema-module/v2',
    canonicalName: 'test/preparation-module',
    version: '1.0.0',
    title: 'Preparation module',
    description: '',
    status: 'active',
    source: 'team',
    tags: [],
    compatibility: { yschema: ['0.1'] },
    provides: [],
    imports: [],
    contribution: {
      nodes: {
        ...baseSchema.nodes,
        advantage: {
          required: true,
          requiredSlots: ['title'],
          slots: { title: { type: 'string', minLength: 1 } },
        },
      },
    },
  };
  await upsertYSchemaArtifactVersion(db, {
    artifact_id: 'preparation-module',
    artifact_version_id: 'preparation-module-v1',
    canonical_name: module.canonicalName,
    version: module.version,
    kind: 'module',
    family: 'open',
    visibility: 'private',
    owner_project_id: projectId,
    status: 'published',
    manifest_json: module,
    artifact_hash: await sha256CompositionValue(module),
    path_count: 2,
    provides: [],
    requires: [],
  });
  const draft = (await findWorkspaceDraft(db, projectId, 'composition'))!;
  const path = `/v1/projects/${projectId}/workspaces/composition/schema-composition`;
  const save = await app.request(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      if_revision: draft.revision,
      composition: {
        apiVersion: 't3x.dev/yschema-composition/v2',
        id: 'prepare-composition',
        revision: 0,
        status: 'draft',
        modules: [
          { canonicalName: module.canonicalName, version: module.version, presentationOrder: 10 },
        ],
      },
    }),
  });
  expect(save.status).toBe(200);
  const saved = (await save.json()).data;
  const adopt = await post(`${path}/apply`, {
    if_revision: saved.workspaceRevision,
    composition_revision: saved.composition.revision,
    composition_hash: saved.preview.compositionHash,
  });
  expect(adopt.status).toBe(200);
  const pending = (await adopt.json()).data;
  const input = {
    target: { kind: 'pending', pendingId: pending.pending.pendingId },
    ifRevision: pending.workspaceRevision,
    confirmedChanges: [],
    commands: [{ kind: 'set', path: 'candidate/advantage', value: { title: 'Faster' } }],
  };
  const preview = await post(`${preparationPath('composition')}/preview`, input);
  expect(preview.status).toBe(200);
  const checked = (await preview.json()).data;
  expect(checked.issues).toEqual([]);
  expect(
    (
      await post(preparationPath('composition'), {
        ...input,
        previewHash: checked.previewHash,
        requestId: 'prepare-composition',
      })
    ).status
  ).toBe(200);
  const after = (await findWorkspaceDraft(db, projectId, 'composition'))!;
  expect(after.workspace_state.schemaComposition).toEqual(saved.composition);
  expect(after.workspace_state.schemaBindings[0].mode).toBe('draft_override');
  expect(
    (await resolveWorkspaceYSchema(after.workspace_state, db, projectId)).schema?.nodes.advantage
  ).toBeDefined();
});

it('rolls back the entire Draft and immutable snapshot if persistence fails after snapshot insertion', async () => {
  await seed('rollback');
  const uniqueTarget = await addSchema('rollback-target', {
    ...migratedSchema,
    name: 'rollback-target',
  });
  const body = await mapping('rollback', false, uniqueTarget);
  const before = await findWorkspaceDraft(db, projectId, 'rollback');
  runtime.failSnapshot = true;
  expect((await post(preparationPath('rollback'), body)).status).toBe(400);
  expect(await findWorkspaceDraft(db, projectId, 'rollback')).toEqual(before);
  expect(
    await findYSchemaCompositionSnapshot(db, {
      project_id: projectId,
      composition_id: runtime.failedSnapshot!.compositionId,
      composition_revision: 1,
      compiled_schema_hash: runtime.failedSnapshot!.hash,
    })
  ).toBeNull();
});
it('serializes competing preparations and requires propose authority, not inspect-only credentials', async () => {
  await seed('race');
  const body = await mapping('race');
  const key: ApiKey = {
    id: 'reader',
    key_prefix: 'test',
    key_hash: 'test',
    name: 'reader',
    project_id: projectId,
    user_id: null,
    principal_kind: 'agent',
    transition_scopes: ['transition:inspect'],
    created_at: '2026-10-15T00:00:00.000Z',
    last_used_at: null,
    revoked_at: null,
  };
  const reader = new Hono();
  reader.use('*', async (c, next) => {
    c.set('apiKey', key);
    await next();
  });
  reader.route('/', schemaStudioRoutes);
  expect((await post(preparationPath('race'), body, reader as typeof app)).status).toBe(403);
  const before = (await findWorkspaceDraft(db, projectId, 'race'))!;
  const responses = await Promise.all([
    post(preparationPath('race'), body),
    post(preparationPath('race'), { ...body, requestId: 'competing-request' }),
  ]);
  expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
  expect((await findWorkspaceDraft(db, projectId, 'race'))?.revision).toBe(before.revision + 1);
});
it('rejects unmapped content, invalid inputs, stale previews, moved heads and revoked authority without writes', async () => {
  await seed('adversarial');
  const base = await input('adversarial');
  const unchanged = await findWorkspaceDraft(db, projectId, 'adversarial');
  const first = (
    await (
      await post(`${preparationPath('adversarial')}/preview`, {
        ...base,
        confirmedChanges: ['nodes.requirements'],
      })
    ).json()
  ).data;
  expect(first.canPrepare).toBe(false);
  const unmapped = await post(preparationPath('adversarial'), {
    ...base,
    confirmedChanges: ['nodes.requirements'],
    previewHash: first.previewHash,
    requestId: 'unmapped',
  });
  expect(unmapped.status).toBe(409);
  expect((await unmapped.json()).error.code).toBe('REVIEW_REQUIRED');
  expect(
    (
      await post(`${preparationPath('adversarial')}/preview`, {
        ...base,
        commands: [{ kind: 'set', path: 'domain', value: 'bad' }],
      })
    ).status
  ).toBe(400);
  const body = await mapping('adversarial');
  runtime.movedHead = true;
  expect((await post(preparationPath('adversarial'), body)).status).toBe(409);
  runtime.movedHead = false;
  denied.add(`${sourceId}:project:read`);
  expect((await post(preparationPath('adversarial'), body)).status).toBe(404);
  denied.clear();
  expect(
    (
      await post(preparationPath('adversarial'), {
        ...body,
        previewHash: `sha256:${'0'.repeat(64)}`,
      })
    ).status
  ).toBe(409);
  expect(await findWorkspaceDraft(db, projectId, 'adversarial')).toEqual(unchanged);
});
