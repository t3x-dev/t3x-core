import { currentComposition } from '@t3x-dev/application';
import type { ApiKey } from '@t3x-dev/core';
import {
  type AnyDB,
  createMaterial,
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
} from '@t3x-dev/storage';
import { normalizeYSchemaObject, sha256CompositionValue } from '@t3x-dev/yschema';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { commitTransition, decideTransition } from '../lib/transition-control-plane/lifecycle';
import {
  initializeWorkspaceAuthoring,
  publishWorkspaceAuthoringAction,
  workspaceAuthoringState,
} from '../lib/workspace-authoring';
import { prepareWorkspaceAuthoringReview } from '../lib/workspace-authoring-review';
import { assertWorkspaceSchemaReview } from '../lib/workspace-schema-review';
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

const reviewer = { kind: 'human' as const, id: 'human:local-user' };
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
  preview = (await (await studio('preview', previewInput)).json()).data;
  const publishInput = {
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
  expect(stored!.manifest.blueprint).toMatchObject({ authoringDraft: saved.authoringDraft });
  const catalog = await app.request(
    `/v1/projects/${projectId}/yschema/catalog?${new URLSearchParams({ canonical_name: publishInput.canonicalName })}`
  );
  expect(catalog.status).toBe(200);
  expect((await catalog.json()).data.items[0].release.hash).toBe(release.source.hash);
  const reading = await app.request(
    `/v1/projects/${projectId}/schema-studio/source?${new URLSearchParams({ sourceProjectId: projectId, canonicalName: publishInput.canonicalName, version: '1.0.0', expectedHash: release.source.hash })}`
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
