import { currentComposition } from '@t3x-dev/application';
import type { ApiKey } from '@t3x-dev/core';
import {
  type AnyDB,
  createMaterial,
  findBranchByName,
  findWorkspaceDraft,
  findYSchemaArtifactVersion,
  findYSchemaCompositionSnapshot,
  getLatestTransitionReviewSnapshot,
  getTransitionRefHead,
  insertBranch,
  insertProject,
  resolveTransitionProposalGraph,
  saveYSchemaCompositionSnapshot,
  transactWorkspaceAuthoring,
  upsertWorkspaceDraft,
  upsertYSchemaArtifactVersion,
  yschemaCompositionSnapshots,
} from '@t3x-dev/storage';
import { normalizeYSchemaObject, sha256CompositionValue } from '@t3x-dev/yschema';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { createBranchWorkspace } from '../lib/branch-workspace';
import { commitTransition, decideTransition } from '../lib/transition-control-plane/lifecycle';
import {
  initializeWorkspaceAuthoring,
  publishWorkspaceAuthoringAction,
  readWorkspaceAuthoring,
  workspaceAuthoringState,
} from '../lib/workspace-authoring';
import { prepareWorkspaceAuthoringReview } from '../lib/workspace-authoring-review';
import {
  assertWorkspaceSchemaReview,
  hasSchemaReviewEvidence,
} from '../lib/workspace-schema-review';
import { decideWorkspaceTransition, reviewWorkspaceTransition } from '../lib/workspace-transition';
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
import { workspaceAuthoringRoutes } from '../routes/workspace-authoring.openapi';
import { workspaceRoutes } from '../routes/workspaces.openapi';
import { yschemaCompositionRoutes } from '../routes/yschema-composition.openapi';

const app = new Hono().route('/', schemaStudioRoutes);
app.route('/', yschemaCompositionRoutes);
app.route('/', workspaceAuthoringRoutes);
app.route('/', workspaceRoutes);
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
  `/v1/projects/${projectId}/schema-studio/preparation/${encodeURIComponent(workspaceId)}`;
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
async function seed(
  workspaceId: string,
  semantic = false,
  options?: { document: Record<string, unknown>; schema?: typeof baseSchema }
) {
  await insertBranch(db, { projectId, name: workspaceId });
  const definition = options?.schema ?? baseSchema;
  const hash = await sha256CompositionValue(definition);
  const compositionHash = await sha256CompositionValue({ workspaceId, schema: definition });
  await saveYSchemaCompositionSnapshot(db, {
    snapshot_id: `base:${workspaceId}`,
    project_id: projectId,
    composition_id: `base:${workspaceId}`,
    composition_revision: 1,
    composition_hash: compositionHash,
    compiled_schema_hash: hash,
    compiler_version: 'test',
    manifest_json: {},
    schema_json: { ...definition },
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
  const document =
    options?.document ??
    (semantic
      ? {
          domain: 't3x.dev/semantic-content',
          version: 1,
          content: {
            trees: [
              {
                key: 'candidate',
                slots: {},
                children: [
                  { key: 'requirements', slots: { title: 'Edited content' }, children: [] },
                ],
              },
            ],
            relations: [],
          },
        }
      : { candidate: { requirements: { title: 'Original content' } } });
  const init = await initializeWorkspaceAuthoring(db, {
    projectId,
    workspaceId,
    expectedWorkspaceRevision: draft.revision,
    expectedRefHead: null,
    actionId: `import:${workspaceId}`,
    actor: { kind: 'human', id: 'human:local-user' },
    legacyDocument: document as never,
  });
  if (!semantic && !options)
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
  projectId = (
    await insertProject(db, { name: 'Schema preparation', ownerId: 'schema-preparation-owner' })
  ).projectId;
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

const reviewer = { kind: 'human' as const, id: 'human:local-user' };
it('prepares an equivalent explicit repeated:false with empty migration commands and unchanged content', async () => {
  const id = 'equivalent-repeated-default';
  await seed(id, true);
  const next = normalizeYSchemaObject({
    ...baseSchema,
    nodes: {
      requirements: {
        ...baseSchema.nodes.requirements,
        repeated: false,
        slots: { ...baseSchema.nodes.requirements!.slots, advantage: { type: 'string' } },
      },
    },
  });
  const candidateId = await addSchema('equivalent-repeated-default', next);
  const before = (await findWorkspaceDraft(db, projectId, id))!;
  const contentBefore = currentComposition(workspaceAuthoringState(before.workspace_state).ledger);
  const body = await input(id, candidateId);
  const response = await post(`${preparationPath(id)}/preview`, body);
  expect(response.status).toBe(200);
  const preview = (await response.json()).data;
  expect(preview).toMatchObject({ canPrepare: true, issues: [] });
  expect(preview.after).toEqual(preview.before);
  expect(preview.impact.items.some((item: { kind: string }) => item.kind === 'needs_mapping')).toBe(
    false
  );
  const prepared = await post(preparationPath(id), {
    ...body,
    previewHash: preview.previewHash,
    requestId: 'prepare-equivalent-default',
  });
  expect(prepared.status).toBe(200);
  const after = (await findWorkspaceDraft(db, projectId, id))!;
  expect(after.revision).toBe(before.revision + 1);
  expect(currentComposition(workspaceAuthoringState(after.workspace_state).ledger)).toEqual(
    contentBefore
  );
  expect(after.workspace_state.schemaBindings[0].schemaHash).toBe(preview.schemaHash);
  expect(
    (await resolveWorkspaceYSchema(after.workspace_state, db, projectId)).schema?.nodes.requirements
      ?.repeated
  ).toBe(false);
  // Reading the adopted contract must work even without studioSources, and
  // must not rebind, initialize, migrate content, or change the Draft revision.
  expect(after.workspace_state.schemaBindings[0].compositionId).toMatch(/^prepared:/);
  expect(after.workspace_state.schemaBindings[0].studioSources).toBeUndefined();
  const read = await app.request(`/v1/projects/${projectId}/workspaces/${id}/authoring`);
  expect(read.status).toBe(200);
  expect((await read.json()).data).toMatchObject({
    workspaceRevision: after.revision,
    current: contentBefore,
    currentSchema: {
      status: 'bound',
      schemaHash: preview.schemaHash,
      definition: next,
      bindings: after.workspace_state.schemaBindings,
    },
  });
  expect(await findWorkspaceDraft(db, projectId, id)).toEqual(after);
});

it('reads only the bound composition revision and fails closed on missing or mismatched snapshots without hiding content', async () => {
  const id = 'exact-authoring-schema';
  await seed(id);
  const saved = (await findWorkspaceDraft(db, projectId, id))!;
  const bindings = saved.workspace_state.schemaBindings;
  const newer = normalizeYSchemaObject({ ...baseSchema, name: 'newer-unbound-definition' });
  await saveYSchemaCompositionSnapshot(db, {
    snapshot_id: `newer:${id}`,
    project_id: projectId,
    composition_id: bindings[0].compositionId,
    composition_revision: 2,
    composition_hash: await sha256CompositionValue({ newer }),
    compiled_schema_hash: await sha256CompositionValue(newer),
    compiler_version: 'test',
    manifest_json: {},
    schema_json: { ...newer },
    render_plan_json: [],
    origins_json: {},
  });
  const view = await readWorkspaceAuthoring(db, { projectId, workspaceId: id });
  expect(view.currentSchema).toEqual({
    status: 'bound',
    schemaHash: bindings[0].schemaHash,
    definition: baseSchema,
    bindings,
  });
  const inspected = await readWorkspaceAuthoring(db, {
    projectId,
    workspaceId: id,
    actionId: `import:${id}`,
  });
  expect(inspected.currentSchema).toEqual(view.currentSchema);
  expect(inspected.selected?.after).not.toEqual(inspected.current);
  expect(await findWorkspaceDraft(db, projectId, id)).toEqual(saved);
  for (const drift of [
    { compositionRevision: 99 },
    { compositionHash: `sha256:${'a'.repeat(64)}` },
    { schemaHash: `sha256:${'b'.repeat(64)}` },
  ]) {
    const { draft: changed } = await transactWorkspaceAuthoring(
      db,
      { projectId, workspaceId: id, refName: id },
      async (_tx, current) => ({
        workspace: { ...current.workspace_state, schemaBindings: [{ ...bindings[0], ...drift }] },
        value: null,
      })
    );
    const unresolved = await readWorkspaceAuthoring(db, { projectId, workspaceId: id });
    expect(unresolved.currentSchema).toEqual({
      status: 'unknown',
      schemaHash: null,
      definition: null,
      bindings: [],
    });
    expect(unresolved.current).toEqual(view.current);
    expect(unresolved.actions).toEqual(view.actions);
    expect(await findWorkspaceDraft(db, projectId, id)).toEqual(changed);
  }
});

async function fullReview(workspaceId: string, requestId = `full-review:${workspaceId}`) {
  const draft = (await findWorkspaceDraft(db, projectId, workspaceId))!;
  const { ledger, basis } = workspaceAuthoringState(draft.workspace_state);
  return prepareWorkspaceAuthoringReview({
    db,
    projectId,
    workspaceId,
    actor: reviewer,
    requestId,
    expectedWorkspaceRevision: draft.revision,
    expectedRevision: ledger.compositionRevision,
    expectedRefHead: basis.refHead,
  });
}
async function fullDecision(
  workspaceId: string,
  reviewed: Awaited<ReturnType<typeof fullReview>>,
  outcome: 'accepted' | 'rejected' = 'accepted'
) {
  return decideWorkspaceTransition(db, {
    projectId,
    workspaceId,
    actor: reviewer,
    policyBinding: null,
    transitionId: reviewed.view.transitionId,
    outcome,
    precondition: {
      ...reviewed.view.precondition,
      policyDigest: reviewed.view.precondition.policyDigest!,
    },
  });
}
it('blocks empty and edit-then-revert Reviews and empty snapshot decisions without advancing history', async () => {
  const id = 'empty-review';
  await seed(id, true);
  await fullDecision(id, await fullReview(id));
  const head = await getTransitionRefHead(db, { projectId, refName: id });
  expect((await readWorkspaceAuthoring(db, { projectId, workspaceId: id })).hasChanges).toBe(false);
  await expect(fullReview(id, 'empty-new-review')).rejects.toThrow('No changes to commit');
  for (const [index, title] of ['Temporary edit', 'Edited content'].entries()) {
    const draft = (await findWorkspaceDraft(db, projectId, id))!;
    const { ledger, basis } = workspaceAuthoringState(draft.workspace_state);
    await publishWorkspaceAuthoringAction(db, {
      projectId,
      workspaceId: id,
      actionId: `net-zero:${index}`,
      actor: reviewer,
      channel: 'manual',
      expectedWorkspaceRevision: draft.revision,
      expectedRevision: ledger.compositionRevision,
      expectedRefHead: basis.refHead,
      operations: [
        {
          set: {
            path: 'content/trees/[key=candidate]/children/[key=requirements]/slots/title',
            value: title,
          },
        },
      ],
    });
  }
  const authoring = await readWorkspaceAuthoring(db, { projectId, workspaceId: id });
  expect(authoring.actions).toHaveLength(2);
  expect(authoring.netDiff).toHaveLength(0);
  expect(authoring.hasChanges).toBe(false);
  const response = await post(`/v1/projects/${projectId}/workspaces/${id}/authoring/reviews`, {
    request_id: 'net-zero-review',
    expected_workspace_revision: authoring.workspaceRevision,
    expected_revision: authoring.compositionRevision,
    expected_ref_head: authoring.basis.refHead,
  });
  expect(response.status).toBe(409);
  expect(await response.text()).toContain('No changes to commit');
  // The compatibility route can still expose a historical empty snapshot. Both
  // the Workspace adapter and generic Decision service must refuse publication.
  const content = (authoring.current as { content: unknown }).content;
  const old = await reviewWorkspaceTransition(db, {
    projectId,
    workspaceId: id,
    actor: reviewer,
    expectedRevision: authoring.workspaceRevision,
    content: content as never,
  });
  for (const outcome of ['accepted', 'overridden'] as const) {
    await expect(
      decideWorkspaceTransition(db, {
        projectId,
        workspaceId: id,
        actor: reviewer,
        transitionId: old.transitionId,
        outcome,
        decisionReason: 'No change must not advance history',
        precondition: old.precondition,
      })
    ).rejects.toThrow('No changes to commit');
    await expect(
      decideTransition({
        db,
        projectId,
        transitionId: old.transitionId,
        actor: reviewer,
        requestId: `empty-direct:${outcome}`,
        outcome,
        precondition: { ...old.precondition, refName: id },
        rationale: 'No change must not advance history',
      })
    ).rejects.toThrow('No changes to commit');
  }
  await decideWorkspaceTransition(db, {
    projectId,
    workspaceId: id,
    actor: reviewer,
    transitionId: old.transitionId,
    outcome: 'rejected',
    precondition: old.precondition,
  });
  expect((await getTransitionRefHead(db, { projectId, refName: id })).head).toBe(head.head);
});

it('allows a Schema-only change even when the complete content matches Base', async () => {
  const id = 'schema-only-review';
  await seed(id);
  await fullDecision(id, await fullReview(id));
  const schema = normalizeYSchemaObject({
    ...baseSchema,
    nodes: { ...baseSchema.nodes, optional_note: { slots: { title: { type: 'string' } } } },
  });
  const candidateId = await addSchema('schema-only-review', schema);
  const body = await input(id, candidateId);
  const preview = await post(`${preparationPath(id)}/preview`, body);
  expect(preview.status).toBe(200);
  const plan = (await preview.json()).data;
  expect(plan.canPrepare).toBe(true);
  const prepared = await post(preparationPath(id), {
    ...body,
    previewHash: plan.previewHash,
    requestId: 'schema-only-prepare',
  });
  expect(prepared.status).toBe(200);
  const authoring = await readWorkspaceAuthoring(db, { projectId, workspaceId: id });
  expect(authoring.base).toEqual(authoring.current);
  expect(authoring.hasChanges).toBe(true);
  const review = await fullReview(id, 'schema-only-change');
  expect((await fullDecision(id, review)).commit).toBeDefined();
  expect((await readWorkspaceAuthoring(db, { projectId, workspaceId: id })).hasChanges).toBe(false);
});
it('commits an empty Schema Review over HTTP, then saves metadata without crossing the authoring boundary', async () => {
  const id = 'committed-schema-metadata';
  await seed(id, false, { document: {} });
  const path = `/v1/projects/${projectId}/workspaces/${id}`;
  const before = (await findWorkspaceDraft(db, projectId, id))!;
  const { ledger, basis } = workspaceAuthoringState(before.workspace_state);
  const reviewed = await post(`${path}/authoring/reviews`, {
    request_id: 'empty-schema-http-review',
    expected_workspace_revision: before.revision,
    expected_revision: ledger.compositionRevision,
    expected_ref_head: basis.refHead,
  });
  expect(reviewed.status).toBe(200);
  const transitionId = (await reviewed.json()).data.view.transition_id;
  const review = await app.request(
    `${path}/transition/review-snapshots/latest?transition_id=${transitionId}`
  );
  expect(review.status).toBe(200);
  const { snapshot } = (await review.json()).data;
  const precondition = snapshot.review.precondition;
  // Preparing and reading Review must not write the Workspace it freezes.
  expect(await findWorkspaceDraft(db, projectId, id)).toEqual(before);
  const decided = await post(`${path}/transition/decide`, {
    transition_id: transitionId,
    outcome: 'accepted',
    precondition: {
      workspace_revision: precondition.workspaceRevision,
      ref_head: precondition.refHead,
      effect_digest: precondition.effectDigest,
      proposal_digest: precondition.proposalDigest,
      statement_digests: precondition.statementDigests,
      policy_digest: precondition.policyDigest,
    },
  });
  expect(decided.status, await decided.clone().text()).toBe(200);
  expect((await decided.json()).data.commit.schema).toBe('t3x/commit/v2');
  const committed = (await findWorkspaceDraft(db, projectId, id))!;
  expect(committed.revision).toBe(before.revision + 1);
  const commitHash = committed.workspace_state.lastCommitHash;
  expect(commitHash).toMatch(/^sha256:/);
  const patch = (workspace: Record<string, unknown>, revision: number) =>
    app.request(path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace, if_revision: revision }),
    });

  // A read/save roundtrip after the first commit used to drop lastCommitHash
  // and report a revision conflict even with the latest revision.
  const read = (await (await app.request(path)).json()).data.workspace;
  const saved = await patch({ ...read, title: 'Renamed after commit' }, read.revision);
  expect(saved.status, await saved.clone().text()).toBe(200);
  const metadata = (await findWorkspaceDraft(db, projectId, id))!;
  expect(metadata.workspace_state).toEqual({
    ...committed.workspace_state,
    title: 'Renamed after commit',
    updatedAt: expect.any(String),
  });
  expect(metadata.revision).toBe(committed.revision + 1);

  // A client cannot replace the server-owned commit receipt either.
  const forged = await patch(
    { ...metadata.workspace_state, lastCommitHash: `sha256:${'f'.repeat(64)}` },
    metadata.revision
  );
  expect(forged.status).toBe(200);
  expect((await forged.json()).data.workspace.lastCommitHash).toBe(commitHash);
  const current = (await findWorkspaceDraft(db, projectId, id))!;
  for (const change of [
    { schemaBindings: [] },
    {
      authoringLedger: {
        ...current.workspace_state.authoringLedger,
        actions: [],
        compositionRevision: 99,
      },
    },
    { authoringBasis: { ...current.workspace_state.authoringBasis, refHead: null } },
    { baseCommitHash: null },
    { yopsDraft: { operations: [] } },
  ]) {
    const rejected = await patch({ ...current.workspace_state, ...change }, current.revision);
    expect(rejected.status).toBe(409);
    expect((await rejected.json()).error).toMatchObject({
      code: 'AUTHORING_COMMAND_REQUIRED',
      message:
        'This save cannot change protected Workspace state. Use the Schema or Draft editing actions instead.',
    });
    expect(await findWorkspaceDraft(db, projectId, id)).toEqual(current);
  }
  const stale = await patch(current.workspace_state, committed.revision);
  expect(stale.status).toBe(409);
  expect((await stale.json()).error).toMatchObject({ code: 'CONFLICT' });
  expect(await findWorkspaceDraft(db, projectId, id)).toEqual(current);
  expect((await getTransitionRefHead(db, { projectId, refName: id })).head).toBe(commitHash);

  const active = workspaceAuthoringState(current.workspace_state);
  await publishWorkspaceAuthoringAction(db, {
    projectId,
    workspaceId: id,
    actionId: 'content-after-schema-commit',
    actor: reviewer,
    channel: 'manual',
    expectedWorkspaceRevision: current.revision,
    expectedRevision: active.ledger.compositionRevision,
    expectedRefHead: active.basis.refHead,
    operations: [{ set: { path: 'candidate', value: { requirements: { title: 'New content' } } } }],
  });
  const nextReview = await fullReview(id, 'review-before-metadata-change');
  const reviewedDraft = (await findWorkspaceDraft(db, projectId, id))!;
  expect(
    (
      await patch(
        { ...reviewedDraft.workspace_state, title: 'Changed during Review' },
        reviewedDraft.revision
      )
    ).status
  ).toBe(200);
  const changed = (await findWorkspaceDraft(db, projectId, id))!;
  const staleDecision = await post(`${path}/transition/decide`, {
    transition_id: nextReview.view.transitionId,
    outcome: 'accepted',
    precondition: {
      workspace_revision: nextReview.view.precondition.workspaceRevision,
      ref_head: nextReview.view.precondition.refHead,
      effect_digest: nextReview.view.precondition.effectDigest,
      proposal_digest: nextReview.view.precondition.proposalDigest,
      statement_digests: nextReview.view.precondition.statementDigests,
      policy_digest: nextReview.view.precondition.policyDigest,
    },
  });
  expect(staleDecision.status).toBe(409);
  expect((await staleDecision.json()).error).toEqual({
    code: 'STALE_REVIEW',
    message: 'Workspace or ref facts changed; review again.',
  });
  expect(await findWorkspaceDraft(db, projectId, id)).toEqual(changed);
  expect((await getTransitionRefHead(db, { projectId, refName: id })).head).toBe(commitHash);
});
it('reopens a prepared snapshot without picker sources, edits twice and commits exact definitions with empty content', async () => {
  const id = 'snapshot-edit-loop';
  await seed(id, false, { document: {} });
  const definition = normalizeYSchemaObject({
    ...baseSchema,
    nodes: { ...baseSchema.nodes, extra: { slots: { note: { type: 'string' } } } },
  });
  const source = await addSchema('snapshot-edit-loop', definition);
  async function prepare(body: Awaited<ReturnType<typeof input>>) {
    const response = await post(`${preparationPath(id)}/preview`, body);
    expect(response.status).toBe(200);
    const plan = (await response.json()).data;
    expect(plan.canPrepare).toBe(true);
    expect(
      (
        await post(preparationPath(id), {
          ...body,
          previewHash: plan.previewHash,
          requestId: crypto.randomUUID(),
        })
      ).status
    ).toBe(200);
  }
  await prepare(await input(id, source));
  const bound = (await findWorkspaceDraft(db, projectId, id))!;
  expect(bound.workspace_state.schemaBindings[0]).not.toHaveProperty('studioSources');
  expect((await getTransitionRefHead(db, { projectId, refName: id })).head).toBeNull();
  let expected = definition;
  let candidateRevision = 0;
  for (const name of ['before_commit', 'after_commit']) {
    const read = await studio('preview', { workspaceId: id, candidateIds: [] });
    expect(read.status).toBe(200);
    const current = (await read.json()).data;
    expect(current.schema).toEqual(expected);
    expect(current.sources).toHaveLength(1);
    expected = normalizeYSchemaObject({
      ...expected,
      nodes: { ...expected.nodes, [name]: { slots: {} } },
    });
    const response = await app.request(
      `/v1/projects/${projectId}/schema-studio/edit-candidates/${id}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: id,
          candidateIds: [],
          ifRevision: candidateRevision,
          rebase: true,
          retryKey: name,
          intent: name,
          origin: 'studio',
          localContribution: {},
          schemaDefinition: expected,
          baseSchemaHash: current.schemaHash,
        }),
      }
    );
    expect(response.status).toBe(200);
    const edit = (await response.json()).data.candidate;
    candidateRevision = edit.revision;
    const schemaEditCandidate = { candidateId: edit.candidateId, revision: edit.revision };
    const edited = (
      await (
        await studio('preview', { workspaceId: id, candidateIds: [], schemaEditCandidate })
      ).json()
    ).data;
    expect(edited.schema).toEqual(expected);
    await prepare({
      target: {
        kind: 'studio',
        candidateIds: [],
        reviewHash: edited.reviewHash,
        schemaEditCandidate,
      } as never,
      ifRevision: edited.workspace.revision,
      commands: [],
      confirmedChanges: [],
    });
    const reviewed = await fullReview(id, name);
    expect(reviewed.schemaReview.draft.definition).toEqual(expected);
    expect(reviewed.schemaReview.draftContent).toEqual({});
    expect((await fullDecision(id, reviewed)).commit).toBeDefined();
    expect((await readWorkspaceAuthoring(db, { projectId, workspaceId: id })).hasChanges).toBe(
      false
    );
  }
  const reopened = (await (await studio('preview', { workspaceId: id, candidateIds: [] })).json())
    .data;
  expect(reopened.schema).toEqual(expected);
});
it.each([
  ['missing-required-node', { candidate: { existing_record: {} } }],
  ['wrong-root', { unrelated: { requirements: { title: 'Do not validate this root' } } }],
])('blocks accepting a bound Schema Review with %s content even on an unprotected branch', async (kind, document) => {
  const id = `bound-review-${kind}`;
  const schema = normalizeYSchemaObject({
    ...baseSchema,
    nodes: {
      requirements: {
        required: true,
        requiredSlots: ['title'],
        slots: { title: { type: 'string' } },
      },
    },
  });
  await seed(id, false, { document, schema });
  const before = (await findWorkspaceDraft(db, projectId, id))!;
  const reviewed = await fullReview(id);
  await expect(fullDecision(id, reviewed)).rejects.toThrow();
  expect((await getTransitionRefHead(db, { projectId, refName: id })).head).toBeNull();
  expect(await findWorkspaceDraft(db, projectId, id)).toEqual(before);
  const rejected = await fullDecision(id, reviewed, 'rejected');
  expect(rejected.commit).toBeUndefined();
  expect((await getTransitionRefHead(db, { projectId, refName: id })).head).toBeNull();
});
async function editReviewedDraft(workspaceId: string) {
  const draft = (await findWorkspaceDraft(db, projectId, workspaceId))!;
  const { ledger, basis } = workspaceAuthoringState(draft.workspace_state);
  return publishWorkspaceAuthoringAction(db, {
    projectId,
    workspaceId,
    actor: reviewer,
    actionId: `concurrent:${ledger.compositionRevision}`,
    channel: 'manual',
    expectedWorkspaceRevision: draft.revision,
    expectedRevision: ledger.compositionRevision,
    expectedRefHead: basis.refHead,
    operations: [
      {
        set: {
          path: 'candidate/features/title',
          value: `A concurrent edit ${ledger.compositionRevision}`,
        },
      },
    ],
  });
}
it('forks one exact committed Schema/content pair without importing the source Draft or sharing its edits', async () => {
  const source = 'fork-schema-source';
  await seed(source);
  const initialReview = await fullReview(source);
  await fullDecision(source, initialReview);
  const committedSource = (await findWorkspaceDraft(db, projectId, source))!;
  const committedHead = committedSource.parent_commit_hash;
  // The parent now has uncommitted Schema and content changes. A fork must ignore both.
  expect((await post(preparationPath(source), await mapping(source))).status).toBe(200);
  const parentPending = (await findWorkspaceDraft(db, projectId, source))!;
  expect(
    (await resolveWorkspaceYSchema(parentPending.workspace_state, db, projectId)).schema
  ).toEqual(migratedSchema);
  const branch = await createBranchWorkspace(db, {
    projectId,
    name: 'fork/child',
    parentBranch: source,
  });
  expect(branch.headCommitHash).toBe(committedHead);
  const childId = 'workspace_branch:fork%2Fchild';
  const child = (await findWorkspaceDraft(db, projectId, childId))!;
  expect(currentComposition(workspaceAuthoringState(child.workspace_state).ledger)).toEqual(
    initialReview.schemaReview.draftContent
  );
  expect(child.workspace_state.schemaBindings).toEqual(initialReview.schemaReview.draft.bindings);
  expect((await resolveWorkspaceYSchema(child.workspace_state, db, projectId)).schema).toEqual(
    baseSchema
  );
  expect(child.workspace_state.workspaceSchemaBase).toEqual({
    refHead: committedHead,
    snapshot: initialReview.schemaReview.draft,
  });
  expect(workspaceAuthoringState(child.workspace_state).ledger.actions).toHaveLength(0);
  expect(child.workspace_state).not.toHaveProperty('schemaEditCandidate');
  expect(child.workspace_state).not.toHaveProperty('assistantSchemaSettings');
  expect((await readWorkspaceAuthoring(db, { projectId, workspaceId: childId })).hasChanges).toBe(
    false
  );
  await expect(fullReview(childId)).rejects.toThrow('No changes to commit');
  // A child of an unmodified fork still resolves the original Commit's authority and Schema.
  await createBranchWorkspace(db, {
    projectId,
    name: 'fork-grandchild',
    parentBranch: branch.name,
  });
  const grandchildId = 'workspace_branch:fork-grandchild';
  const grandchild = (await findWorkspaceDraft(db, projectId, grandchildId))!;
  expect(grandchild.workspace_state.schemaBindings).toEqual(child.workspace_state.schemaBindings);
  // Applying and committing Schema/content on the child never advances its parent or sibling.
  const childSchema = normalizeYSchemaObject({
    ...baseSchema,
    nodes: { ...baseSchema.nodes, child_only: { slots: { note: { type: 'string' } } } },
  });
  const childSource = await addSchema('fork-child-only', childSchema);
  const childPlan = await input(childId, childSource);
  const childPreviewResponse = await post(`${preparationPath(childId)}/preview`, childPlan);
  expect(childPreviewResponse.status).toBe(200);
  const childPreview = (await childPreviewResponse.json()).data;
  expect(childPreview.canPrepare).toBe(true);
  expect(
    (
      await post(preparationPath(childId), {
        ...childPlan,
        previewHash: childPreview.previewHash,
        requestId: 'fork-child-only-schema',
      })
    ).status
  ).toBe(200);
  const childEdited = (await findWorkspaceDraft(db, projectId, childId))!;
  const childAuthoring = workspaceAuthoringState(childEdited.workspace_state);
  await publishWorkspaceAuthoringAction(db, {
    projectId,
    workspaceId: childId,
    actor: reviewer,
    actionId: 'fork-child-content',
    channel: 'manual',
    expectedWorkspaceRevision: childEdited.revision,
    expectedRevision: childAuthoring.ledger.compositionRevision,
    expectedRefHead: childAuthoring.basis.refHead,
    operations: [
      { set: { path: 'candidate/requirements/title', value: 'Only on the child branch' } },
    ],
  });
  const childReview = await fullReview(childId, 'fork-child-review');
  await fullDecision(childId, childReview);
  expect((await findBranchByName(db, projectId, source))!.headCommitHash).toBe(committedHead);
  expect(await findWorkspaceDraft(db, projectId, source)).toEqual(parentPending);
  expect(await findWorkspaceDraft(db, projectId, grandchildId)).toEqual(grandchild);
  expect((await findBranchByName(db, projectId, branch.name))!.headCommitHash).not.toBe(
    committedHead
  );
  const advanced = await createBranchWorkspace(db, {
    projectId,
    name: 'fork-after-child-change',
    parentBranch: branch.name,
  });
  const next = (await findWorkspaceDraft(
    db,
    projectId,
    'workspace_branch:fork-after-child-change'
  ))!;
  expect(next.parent_commit_hash).toBe(advanced.headCommitHash);
  expect((await resolveWorkspaceYSchema(next.workspace_state, db, projectId)).schema).toEqual(
    childSchema
  );
  expect(currentComposition(workspaceAuthoringState(next.workspace_state).ledger)).toEqual(
    childReview.schemaReview.draftContent
  );
});

it('does not leave a partial branch if its inherited Schema cannot be resolved', async () => {
  const source = 'fork-schema-unavailable';
  await seed(source);
  await fullDecision(source, await fullReview(source));
  const before = (await findWorkspaceDraft(db, projectId, source))!;
  await db
    .delete(yschemaCompositionSnapshots)
    .where(
      and(
        eq(yschemaCompositionSnapshots.projectId, projectId),
        eq(yschemaCompositionSnapshots.compositionId, `base:${source}`)
      )
    );
  await expect(
    createBranchWorkspace(db, { projectId, name: 'missing-schema-fork', parentBranch: source })
  ).rejects.toThrow(/Schema failed verification/);
  expect(await findBranchByName(db, projectId, 'missing-schema-fork')).toBeNull();
  expect(
    await findWorkspaceDraft(db, projectId, 'workspace_branch:missing-schema-fork')
  ).toBeNull();
  // A project-scoped source cannot be inherited through another project either.
  await expect(
    createBranchWorkspace(db, { projectId: sourceId, name: 'invalid-fork', parentBranch: source })
  ).rejects.toThrow();
  expect(await findBranchByName(db, sourceId, 'invalid-fork')).toBeNull();
  expect(await findWorkspaceDraft(db, sourceId, 'workspace_branch:invalid-fork')).toBeNull();
  expect(await findWorkspaceDraft(db, projectId, source)).toEqual(before);
});

it('SE-011 freezes complete schema/content, commits exact Schema Hash, and uses that Base next round', async () => {
  const id = 'full-review-two-rounds';
  await seed(id);
  const first = await fullReview(id);
  expect(first.schemaReview.base.status).toBe('unbound');
  await fullDecision(id, first);
  let draft = (await findWorkspaceDraft(db, projectId, id))!;
  const firstHead = draft.parent_commit_hash;
  expect(draft.workspace_state.workspaceSchemaBase).toMatchObject({
    refHead: firstHead,
    snapshot: { status: 'bound', schemaHash: await sha256CompositionValue(baseSchema) },
  });
  // Simulate an existing branch that predates the local Schema Base cache.
  const withoutCache = await transactWorkspaceAuthoring(
    db,
    { projectId, workspaceId: id, refName: id },
    async (_tx, current) => {
      const { workspaceSchemaBase: _cache, ...workspace } = current.workspace_state;
      return { workspace, value: undefined };
    }
  );
  draft = withoutCache.draft;
  const { ledger, basis } = workspaceAuthoringState(draft.workspace_state);
  await publishWorkspaceAuthoringAction(db, {
    projectId,
    workspaceId: id,
    actor: reviewer,
    actionId: 'prior-to-migration',
    channel: 'manual',
    expectedWorkspaceRevision: draft.revision,
    expectedRevision: ledger.compositionRevision,
    expectedRefHead: basis.refHead,
    operations: [
      { set: { path: 'candidate/requirements/title', value: 'Preserve this earlier action' } },
    ],
  });
  const plan = await mapping(id);
  expect((await post(preparationPath(id), plan)).status).toBe(200);
  const reviewed = await fullReview(id, 'second-round');
  expect(reviewed.schemaReview.actionCount).toBe(2);
  expect(reviewed.schemaReview.base.schemaHash).toBe(await sha256CompositionValue(baseSchema));
  expect(reviewed.schemaReview.baseContent).toEqual({
    candidate: { requirements: { title: 'Edited content' } },
  });
  expect(reviewed.schemaReview.draftContent).toEqual({
    candidate: { features: { title: 'Preserve this earlier action' } },
  });
  expect(reviewed.schemaReview.changes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: 'REMOVE', path: 'nodes.requirements' }),
      expect.objectContaining({ kind: 'ADD', path: 'nodes.features' }),
    ])
  );
  const graph = await resolveTransitionProposalGraph(db, projectId, reviewed.view.transitionId);
  expect(JSON.parse(graph.preparation!.canonicalJson).schemaReview).toEqual(reviewed.schemaReview);
  const snapshot = await getLatestTransitionReviewSnapshot(db, {
    projectId,
    workspaceId: id,
    transitionId: reviewed.view.transitionId,
  });
  expect(snapshot).toBeDefined();
  const committed = await fullDecision(id, reviewed);
  expect(committed.commit).toBeDefined();
  draft = (await findWorkspaceDraft(db, projectId, id))!;
  const targetHash = await sha256CompositionValue(migratedSchema);
  expect(draft.parent_commit_hash).not.toBe(firstHead);
  expect(draft.workspace_state.workspaceSchemaBase).toEqual({
    refHead: draft.parent_commit_hash,
    snapshot: reviewed.schemaReview.draft,
  });
  expect(draft.workspace_state.authoringHistory.at(-1)).toMatchObject({ schemaHash: targetHash });
  // Native validation Statement included in the Commit closure binds the same definition digest.
  expect(
    graph.observations.some(({ statement }) => JSON.stringify(statement).includes(targetHash))
  ).toBe(true);
});

it('edits an existing strict Schema through guarded YOps, adopts, prepares evidenced content, reviews, commits, publishes and reloads the exact release', async () => {
  const id = 'schema-edit-publish-e2e';
  await seed(id);
  const strictBase = normalizeYSchemaObject({
    ...baseSchema,
    name: 'test/strict-base',
    version: '1.0.0',
    strict: true,
  });
  const candidateId = await addSchema('strict-base-e2e', strictBase);
  const material = await createMaterial(db, {
    project_id: projectId,
    source_type: 'paste',
    content_text: 'Edited content. Confirmed advantage.',
    content_hash: `sha256:${'a'.repeat(64)}`,
  });
  await transactWorkspaceAuthoring(
    db,
    { projectId, workspaceId: id, refName: id },
    async (_tx, draft) => ({
      workspace: {
        ...draft.workspace_state,
        sourceBundle: [{ materialId: material.id, contentHash: material.content_hash }],
      },
      value: null,
    })
  );
  const definition = normalizeYSchemaObject({
    ...strictBase,
    nodes: {
      ...strictBase.nodes,
      requirements: { slots: { title: { type: 'string', minLength: 1 } } },
      advantage: { slots: { title: { type: 'string', provenanceRequired: true } } },
    },
  });
  const save = await app.request(`/v1/projects/${projectId}/schema-studio/edit-candidates/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workspaceId: id,
      candidateIds: [candidateId],
      ifRevision: 0,
      retryKey: 'edit-strict-base',
      intent: 'Constrain existing title and add evidenced advantage',
      origin: 'studio',
      localContribution: {},
      schemaDefinition: definition,
      baseSchemaHash: await sha256CompositionValue(strictBase),
    }),
  });
  expect(save.status).toBe(200);
  const saved = (await save.json()).data.candidate;
  expect(saved.authoringDraft.base.kind).toBe('published_schema');
  expect(saved.authoringDraft.effect.operations[0]).toHaveProperty('assert');
  const candidateRef = { candidateId: saved.candidateId, revision: saved.revision };
  const previewInput = {
    workspaceId: id,
    candidateIds: [candidateId],
    schemaEditCandidate: candidateRef,
  };
  let preview = (await (await studio('preview', previewInput)).json()).data;
  expect(preview.schema).toEqual(definition);
  expect(preview.schema.strict).toBe(true);
  const beforeAdopt = await findWorkspaceDraft(db, projectId, id);
  const adoptedResponse = await studio('apply', {
    ...previewInput,
    ifRevision: preview.workspace.revision,
    reviewHash: preview.reviewHash,
  });
  expect(adoptedResponse.status).toBe(200);
  const adopted = (await adoptedResponse.json()).data;
  expect((await findWorkspaceDraft(db, projectId, id))!.workspace_state.schemaBindings).toEqual(
    beforeAdopt!.workspace_state.schemaBindings
  );
  const migration = {
    target: { kind: 'pending', pendingId: adopted.pending.pendingId },
    ifRevision: adopted.workspaceRevision,
    commands: [
      { kind: 'set', path: 'candidate/advantage', value: { title: 'Confirmed advantage' } },
    ],
    confirmedChanges: [],
  };
  const migrationResponse = await post(`${preparationPath(id)}/preview`, migration);
  expect(migrationResponse.status).toBe(200);
  const checked = (await migrationResponse.json()).data;
  expect(checked.issues).toEqual([]);
  expect(checked.canPrepare).toBe(true);
  expect(
    (
      await post(preparationPath(id), {
        ...migration,
        previewHash: checked.previewHash,
        requestId: 'prepare-effect-e2e',
      })
    ).status
  ).toBe(200);
  const reviewed = await fullReview(id);
  expect(reviewed.schemaReview.draft.schemaHash).toBe(saved.authoringDraft.resultSchemaHash);
  const committed = await fullDecision(id, reviewed);
  expect(committed.commit).toBeDefined();
  const originalAfterCommit = (await findWorkspaceDraft(db, projectId, id))!;
  await createBranchWorkspace(db, { projectId, name: 'studio-exact-fork', parentBranch: id });
  const forkId = 'workspace_branch:studio-exact-fork';
  const forkPreviewInput = { workspaceId: forkId, candidateIds: [candidateId] };
  const forkPreview = (await (await studio('preview', forkPreviewInput)).json()).data;
  expect(forkPreview.schema).toEqual(definition);
  expect(forkPreview.workspace.boundSchema).toEqual(definition);
  const forkDefinition = normalizeYSchemaObject({
    ...definition,
    nodes: { ...definition.nodes, child_only: { slots: {} } },
  });
  const forkSaveResponse = await app.request(
    `/v1/projects/${projectId}/schema-studio/edit-candidates/${encodeURIComponent(forkId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...forkPreviewInput,
        ifRevision: 0,
        retryKey: 'fork-edit-base',
        intent: 'Add child-only Node without losing inherited local changes',
        origin: 'studio',
        localContribution: {},
        schemaDefinition: forkDefinition,
        baseSchemaHash: forkPreview.schemaHash,
      }),
    }
  );
  expect(forkSaveResponse.status).toBe(200);
  const forkCandidate = (await forkSaveResponse.json()).data.candidate;
  expect(forkCandidate.authoringDraft.base.kind).toBe('composition');
  expect(forkCandidate.baseDefinition).toEqual(definition);
  const forkEdited = (
    await (
      await studio('preview', {
        ...forkPreviewInput,
        schemaEditCandidate: {
          candidateId: forkCandidate.candidateId,
          revision: forkCandidate.revision,
        },
      })
    ).json()
  ).data;
  expect(forkEdited.schema).toEqual(forkDefinition);
  expect(await findWorkspaceDraft(db, projectId, id)).toEqual(originalAfterCommit);
  preview = (await (await studio('preview', previewInput)).json()).data;
  const publishInput = {
    visibility: 'community',
    candidateIds: [candidateId],
    schemaEditCandidate: candidateRef,
    ifRevision: preview.workspace.revision,
    reviewHash: preview.reviewHash,
    canonicalName: `projects/${projectId}/derived-e2e`,
    version: '1.0.0',
    title: 'Derived end-to-end Schema',
    description: '',
    tags: [],
    releaseNotes: '',
  };
  const publication = await studio(`publish/${id}`, publishInput);
  expect(publication.status).toBe(200);
  const release = (await publication.json()).data;
  const stored = await findYSchemaArtifactVersion(db, {
    canonical_name: publishInput.canonicalName,
    version: '1.0.0',
    project_id: projectId,
  });
  expect(stored!.manifest.schema).toMatchObject({ strict: true, nodes: definition.nodes });
  expect(stored!.manifest.blueprint).not.toHaveProperty('authoringDraft');
  const catalog = await app.request(
    `/v1/projects/${projectId}/yschema/catalog?${new URLSearchParams({ canonical_name: publishInput.canonicalName })}`
  );
  expect(catalog.status).toBe(200);
  expect((await catalog.json()).data.items[0].release.hash).toBe(release.source.hash);
  const reading = await app.request(
    `/v1/projects/${projectId}/schema-studio/source?${new URLSearchParams({ canonicalName: publishInput.canonicalName, version: '1.0.0', expectedHash: release.source.hash })}`
  );
  expect(reading.status).toBe(200);
  expect((await reading.json()).data.manifest).toEqual(stored!.manifest);
  // The original published Base was never modified.
  const original = await findYSchemaArtifactVersion(db, {
    canonical_name: 'test/strict-base-e2e',
    version: '1.0.0',
    project_id: sourceId,
  });
  expect(original!.manifest.schema).toEqual(strictBase);
});
it('SE-011 Reject records an immutable decision without changing Workspace or ref head', async () => {
  const id = 'full-review-reject';
  await seed(id);
  const plan = await mapping(id);
  expect((await post(preparationPath(id), plan)).status).toBe(200);
  const reviewed = await fullReview(id);
  const before = await findWorkspaceDraft(db, projectId, id);
  const rejected = await fullDecision(id, reviewed, 'rejected');
  expect(rejected.commit).toBeUndefined();
  expect(rejected.transition.decision).toMatchObject({
    observation: 'supplied',
    outcome: 'rejected',
  });
  expect(await findWorkspaceDraft(db, projectId, id)).toEqual(before);
  expect((await getTransitionRefHead(db, { projectId, refName: id })).head).toBeNull();
});
it('SE-011 concurrent Draft edits invalidate both old Decision and an already accepted Commit', async () => {
  const id = 'full-review-concurrent';
  await seed(id);
  expect((await post(preparationPath(id), await mapping(id))).status).toBe(200);
  const reviewed = await fullReview(id);
  await editReviewedDraft(id);
  await expect(
    decideTransition({
      db,
      projectId,
      actor: reviewer,
      transitionId: reviewed.view.transitionId,
      requestId: 'decide-obsolete-review',
      outcome: 'accepted',
      precondition: reviewed.view.precondition,
    })
  ).rejects.toThrow();
  const latest = await fullReview(id, 'review-after-concurrent-edit');
  const accepted = await decideTransition({
    db,
    projectId,
    actor: reviewer,
    transitionId: latest.view.transitionId,
    requestId: 'accept-before-edit',
    outcome: 'accepted',
    precondition: latest.view.precondition,
  });
  await editReviewedDraft(id);
  await expect(fullDecision(id, reviewed)).rejects.toThrow();
  await expect(
    commitTransition({
      db,
      projectId,
      actor: reviewer,
      transitionId: latest.view.transitionId,
      requestId: 'commit-after-edit',
      decisionDigest: accepted.decisionDigest,
      expectedHead: null,
    })
  ).rejects.toThrow();
  expect((await getTransitionRefHead(db, { projectId, refName: id })).head).toBeNull();
});
it('SE-011 does not let Studio checks substitute for complete Review or accept an unknown Base', async () => {
  const id = 'full-review-no-bypass';
  await seed(id);
  expect((await post(preparationPath(id), await mapping(id))).status).toBe(200);
  const reviewed = await fullReview(id);
  const graph = await resolveTransitionProposalGraph(db, projectId, reviewed.view.transitionId);
  const workspace = (await findWorkspaceDraft(db, projectId, id))!.workspace_state;
  const preparation = JSON.parse(graph.preparation!.canonicalJson);
  delete preparation.schemaReview;
  await expect(
    assertWorkspaceSchemaReview(db, projectId, workspace, {
      ...graph,
      preparation: { ...graph.preparation!, canonicalJson: JSON.stringify(preparation) },
    })
  ).rejects.toThrow('complete Workspace Review');
  // Unknown is explicit, never fabricated from the target definition.
  const unknownBase = { status: 'unknown', schemaHash: null, definition: null, bindings: [] };
  const unknown = {
    ...workspace,
    workspaceSchemaBase: { refHead: workspace.authoringBasis.refHead, snapshot: unknownBase },
  };
  const frozen = { ...reviewed.schemaReview, base: unknownBase, changes: [] };
  const unknownGraph = {
    ...graph,
    preparation: { ...graph.preparation!, canonicalJson: JSON.stringify({ schemaReview: frozen }) },
  };
  await expect(assertWorkspaceSchemaReview(db, projectId, unknown, unknownGraph)).rejects.toThrow(
    'Base Schema'
  );
  await expect(
    assertWorkspaceSchemaReview(db, projectId, unknown, unknownGraph, false)
  ).resolves.toBeUndefined();
});
it('SE-011 schema-only binding drift cannot reuse a previous full Review', async () => {
  const id = 'full-review-binding-drift';
  await seed(id);
  const reviewed = await fullReview(id);
  const draft = (await findWorkspaceDraft(db, projectId, id))!;
  await transactWorkspaceAuthoring(
    db,
    { projectId, workspaceId: id, refName: id },
    async (_tx, current) => ({
      workspace: {
        ...current.workspace_state,
        schemaBindings: [{ ...draft.workspace_state.schemaBindings[0], rootKey: 'different_root' }],
      },
      value: undefined,
    })
  );
  await expect(fullDecision(id, reviewed)).rejects.toThrow();
  expect((await getTransitionRefHead(db, { projectId, refName: id })).head).toBeNull();
});

it('SE-011 the compatibility Workspace Review freezes the same complete contract before Commit', async () => {
  const id = 'full-review-compatibility';
  await seed(id, true);
  expect((await post(preparationPath(id), await mapping(id, true))).status).toBe(200);
  const draft = (await findWorkspaceDraft(db, projectId, id))!;
  const document = currentComposition(workspaceAuthoringState(draft.workspace_state).ledger) as {
    content: { trees: unknown[]; relations: unknown[] };
  };
  const reviewed = await reviewWorkspaceTransition(db, {
    projectId,
    workspaceId: id,
    actor: reviewer,
    expectedRevision: draft.revision,
    content: document.content as never,
  });
  const graph = await resolveTransitionProposalGraph(db, projectId, reviewed.transitionId);
  expect(JSON.parse(graph.preparation!.canonicalJson).schemaReview.draftContent).toEqual(document);
  await decideWorkspaceTransition(db, {
    projectId,
    workspaceId: id,
    actor: reviewer,
    transitionId: reviewed.transitionId,
    outcome: 'accepted',
    precondition: reviewed.precondition,
  });
  const saved = (await findWorkspaceDraft(db, projectId, id))!;
  expect(saved.workspace_state.workspaceSchemaBase.snapshot.schemaHash).toBe(
    await sha256CompositionValue(migratedSchema)
  );
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

it.each([
  ['document', {}],
  ['root', { candidate: {} }],
  [
    'semantic',
    { domain: 't3x.dev/semantic-content', version: 1, content: { trees: [], relations: [] } },
  ],
])('adopts and commits a required Schema without inventing business content: %s', async (kind, document) => {
  const id = `initial-required-${kind}`;
  await seed(id, false, { document });
  const body = await input(id, inputId);
  const response = await post(`${preparationPath(id)}/preview`, body);
  expect(response.status).toBe(200);
  const plan = (await response.json()).data;
  expect(plan).toMatchObject({
    canPrepare: true,
    contentValidation: 'not_applicable',
    issues: [],
    before: document,
    after: document,
  });
  const prepared = await post(preparationPath(id), {
    ...body,
    previewHash: plan.previewHash,
    requestId: id,
  });
  expect(prepared.status).toBe(200);
  const reviewed = await fullReview(id);
  expect(reviewed.schemaReview.contentValidation).toBe('not_applicable');
  expect(reviewed.view.transition.checks.validation.runs).toEqual([]);
  const graph = await resolveTransitionProposalGraph(db, projectId, reviewed.view.transitionId);
  expect(await hasSchemaReviewEvidence(graph.proposal, reviewed.schemaReview)).toBe(true);
  // Changing the application snapshot cannot silently change the committed contract.
  const replaced = {
    ...reviewed.schemaReview,
    draft: {
      ...reviewed.schemaReview.draft,
      definition: {
        ...reviewed.schemaReview.draft.definition,
        description: 'different definition',
      },
    },
  };
  replaced.draft.schemaHash = await sha256CompositionValue(replaced.draft.definition);
  expect(await hasSchemaReviewEvidence(graph.proposal, replaced)).toBe(false);
  const committed = await fullDecision(id, reviewed);
  expect(committed.commit).toBeDefined();
  expect(committed.workspace.schemaReview.summary).toContain('not applicable');
  const restored = await readWorkspaceAuthoring(db, { projectId, workspaceId: id });
  expect(restored.current).toEqual(document);
  expect(restored.currentSchema.definition.nodes.advantage.required).toBe(true);
  const branch = await createBranchWorkspace(db, {
    projectId,
    name: `${id}-child`,
    parentBranch: id,
  });
  expect(branch).toBeDefined();
  // Recover even when the mutable Workspace Base cache was lost.
  await transactWorkspaceAuthoring(
    db,
    { projectId, workspaceId: id, refName: id },
    async (_tx, current) => {
      const { workspaceSchemaBase: _cache, ...workspace } = current.workspace_state;
      return { workspace, value: undefined };
    }
  );
  expect(
    (await readWorkspaceAuthoring(db, { projectId, workspaceId: id })).currentSchema.schemaHash
  ).toBe(plan.schemaHash);
});

it('does not turn deletion of existing required content into Schema initialization', async () => {
  const id = 'deleted-required-content';
  const schema = normalizeYSchemaObject({
    ...baseSchema,
    nodes: {
      requirements: {
        required: true,
        requiredSlots: ['title'],
        slots: { title: { type: 'string' } },
      },
    },
  });
  await seed(id, false, {
    schema,
    document: { candidate: { requirements: { title: 'Existing content' } } },
  });
  await fullDecision(id, await fullReview(id));
  const saved = (await findWorkspaceDraft(db, projectId, id))!;
  const { ledger, basis } = workspaceAuthoringState(saved.workspace_state);
  await publishWorkspaceAuthoringAction(db, {
    projectId,
    workspaceId: id,
    actor: reviewer,
    actionId: 'delete-content',
    channel: 'manual',
    expectedWorkspaceRevision: saved.revision,
    expectedRevision: ledger.compositionRevision,
    expectedRefHead: basis.refHead,
    operations: [{ unset: { path: 'candidate' } }],
  });
  const reviewed = await fullReview(id, 'review-after-deletion');
  expect(reviewed.schemaReview.contentValidation).toBeUndefined();
  expect(reviewed.view.transition.checks.validation.runs[0].predicate.outcome).toBe('failed');
  await expect(fullDecision(id, reviewed)).rejects.toThrow();
  expect((await getTransitionRefHead(db, { projectId, refName: id })).head).toBe(basis.refHead);
});

it.each([
  false,
  true,
])('creates a source-free Schema and continues editing its exact Base before and after Commit (with nodes: %s)', async (withNodes) => {
  const id = withNodes ? 'local-schema-nodes' : 'local-schema-empty';
  await insertBranch(db, { projectId, name: id });
  const draft = await upsertWorkspaceDraft(db, {
    project_id: projectId,
    workspace_id: id,
    target_branch: id,
    title: id,
    workspace_state: { title: id, targetBranch: id, schemaBindings: [] },
  });
  const baselineResponse = await studio('preview', { candidateIds: [], workspaceId: id });
  expect(baselineResponse.status, await baselineResponse.clone().text()).toBe(200);
  const baseline = (await baselineResponse.json()).data;
  expect(baseline.sources).toEqual([]);
  expect(baseline.schema.nodes).toEqual({});
  expect(baseline.schema.name).toBe('Workspace Schema');
  expect((await findWorkspaceDraft(db, projectId, id))!.revision).toBe(draft.revision);
  const definition = {
    ...baseline.schema,
    nodes: withNodes ? { note: { slots: { title: { type: 'string' } } } } : {},
  };
  const saveInput = {
    workspaceId: id,
    candidateIds: [],
    ifRevision: 0,
    retryKey: id,
    intent: 'Create blank Schema',
    origin: 'studio',
    localContribution: {},
    schemaDefinition: definition,
    baseSchemaHash: baseline.schemaHash,
  };
  const save = (body: unknown) =>
    app.request(`/v1/projects/${projectId}/schema-studio/edit-candidates/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const wrongBase = await save({ ...saveInput, baseSchemaHash: `sha256:${'f'.repeat(64)}` });
  expect(wrongBase.status).toBe(409);
  const savedResponse = await save(saveInput);
  expect(savedResponse.status, await savedResponse.clone().text()).toBe(200);
  const saved = (await savedResponse.json()).data.candidate;
  expect(saved.baseSources).toEqual([]);
  expect(saved.authoringDraft.base.kind).toBe('composition');
  const initialBase = saved.authoringDraft.base;
  const initialSnapshot = await findYSchemaCompositionSnapshot(db, {
    project_id: projectId,
    composition_id: initialBase.compositionId,
    composition_revision: initialBase.compositionRevision,
    compiled_schema_hash: initialBase.schemaHash,
  });
  expect(initialSnapshot?.schemaJson).toEqual(baseline.schema);
  expect((await findWorkspaceDraft(db, projectId, id))!.workspace_state.schemaBindings).toEqual([]);
  const read = await app.request(`/v1/projects/${projectId}/schema-studio/edit-candidates/${id}`);
  expect(read.status, await read.clone().text()).toBe(200);
  expect((await read.json()).data.baseDefinition.nodes).toEqual({});
  const current = (await findWorkspaceDraft(db, projectId, id))!;
  await initializeWorkspaceAuthoring(db, {
    projectId,
    workspaceId: id,
    expectedWorkspaceRevision: current.revision,
    expectedRefHead: null,
    actionId: `init:${id}`,
    actor: reviewer,
    legacyDocument: {},
  });
  const reference = { candidateId: saved.candidateId, revision: saved.revision };
  const previewResponse = await studio('preview', {
    candidateIds: [],
    workspaceId: id,
    schemaEditCandidate: reference,
  });
  expect(previewResponse.status, await previewResponse.clone().text()).toBe(200);
  const preview = (await previewResponse.json()).data;
  expect(preview.schema.nodes).toEqual(definition.nodes);
  const body = {
    target: {
      kind: 'studio',
      candidateIds: [],
      schemaEditCandidate: reference,
      reviewHash: preview.reviewHash,
    },
    ifRevision: preview.workspace.revision,
    commands: [],
    confirmedChanges: [],
  };
  const checkResponse = await post(`${preparationPath(id)}/preview`, body);
  expect(checkResponse.status, await checkResponse.clone().text()).toBe(200);
  const check = (await checkResponse.json()).data;
  expect(check.canPrepare, JSON.stringify(check)).toBe(true);
  const prepared = await post(preparationPath(id), {
    ...body,
    previewHash: check.previewHash,
    requestId: `prepare:${id}`,
  });
  expect(prepared.status, await prepared.clone().text()).toBe(200);
  const reviewed = await fullReview(id);
  expect(reviewed.view.transitionId).toBeTruthy();
  const continued = await studio('preview', { candidateIds: [], workspaceId: id });
  expect(continued.status, await continued.clone().text()).toBe(200);
  expect((await continued.json()).data.schema.nodes).toEqual(definition.nodes);

  let expected = definition;
  let candidateRevision = saved.revision;
  for (const name of ['before_commit', 'after_commit']) {
    const boundDraft = (await findWorkspaceDraft(db, projectId, id))!;
    const binding = boundDraft.workspace_state.schemaBindings[0];
    const currentResponse = await studio('preview', { candidateIds: [], workspaceId: id });
    expect(currentResponse.status, await currentResponse.clone().text()).toBe(200);
    const current = (await currentResponse.json()).data;
    expect(current.sources).toEqual([]);
    expect(current.schema).toEqual(expected);
    const baseDefinition = expected;
    expected = { ...expected, nodes: { ...expected.nodes, [name]: { slots: {} } } };
    const nextSave = {
      ...saveInput,
      ifRevision: candidateRevision,
      retryKey: `${id}:${name}`,
      schemaDefinition: expected,
      baseSchemaHash: current.schemaHash,
      rebase: true,
    };
    const response = await save(nextSave);
    expect(response.status, await response.clone().text()).toBe(200);
    const result = (await response.json()).data;
    candidateRevision = result.candidate.revision;
    expect(result.candidate.baseSources).toEqual([]);
    expect(result.candidate.baseDefinition).toEqual(baseDefinition);
    expect(result.candidate.authoringDraft.base).toEqual({
      kind: 'composition',
      compositionId: binding.compositionId,
      compositionRevision: binding.compositionRevision,
      compositionHash: binding.compositionHash,
      schemaHash: binding.schemaHash,
    });
    expect((await findWorkspaceDraft(db, projectId, id))!.workspace_state.schemaBindings).toEqual(
      boundDraft.workspace_state.schemaBindings
    );
    const retriedResponse = await save(nextSave);
    expect(retriedResponse.status, await retriedResponse.clone().text()).toBe(200);
    expect((await retriedResponse.json()).data).toMatchObject({
      outcome: 'reused',
      workspaceRevision: result.workspaceRevision,
      candidate: { candidateId: saved.candidateId, revision: candidateRevision },
    });
    const nextReference = { candidateId: saved.candidateId, revision: candidateRevision };
    const editedResponse = await studio('preview', {
      candidateIds: [],
      workspaceId: id,
      schemaEditCandidate: nextReference,
    });
    expect(editedResponse.status, await editedResponse.clone().text()).toBe(200);
    const edited = (await editedResponse.json()).data;
    expect(edited.schema).toEqual(expected);
    const nextPreparation = {
      ...body,
      target: { ...body.target, schemaEditCandidate: nextReference, reviewHash: edited.reviewHash },
      ifRevision: edited.workspace.revision,
    };
    const checkedResponse = await post(`${preparationPath(id)}/preview`, nextPreparation);
    expect(checkedResponse.status, await checkedResponse.clone().text()).toBe(200);
    const checked = (await checkedResponse.json()).data;
    expect(checked.canPrepare, JSON.stringify(checked)).toBe(true);
    const preparedResponse = await post(preparationPath(id), {
      ...nextPreparation,
      previewHash: checked.previewHash,
      requestId: `prepare:${id}:${name}`,
    });
    expect(preparedResponse.status, await preparedResponse.clone().text()).toBe(200);
    const nextReview = await fullReview(id, `full-review:${id}:${name}`);
    expect(nextReview.schemaReview.draft.definition).toEqual(expected);
    expect((await fullDecision(id, nextReview)).commit).toBeDefined();
    expect(
      await findYSchemaCompositionSnapshot(db, {
        project_id: projectId,
        composition_id: initialBase.compositionId,
        composition_revision: initialBase.compositionRevision,
        compiled_schema_hash: initialBase.schemaHash,
      })
    ).toEqual(initialSnapshot);
  }
});
