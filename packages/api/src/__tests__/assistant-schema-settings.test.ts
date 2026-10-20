import type { AssistantSchemaSettingsInput } from '@t3x-dev/api-client';
import { currentComposition } from '@t3x-dev/application';
import { applyWorkspaceSchemaYOps } from '@t3x-dev/core';
import {
  type AnyDB,
  findWorkspaceDraft,
  findYSchemaCompositionSnapshot,
  insertBranch,
  insertConversation,
  insertProject,
  insertTurn,
  listSchemaStudioCandidates,
  saveYSchemaCompositionSnapshot,
  transactWorkspaceAuthoring,
  upsertWorkspaceDraft,
  upsertYSchemaArtifactVersion,
} from '@t3x-dev/storage';
import { normalizeYSchemaObject, sha256CompositionValue } from '@t3x-dev/yschema';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  applySchemaSettings,
  createAssistantSchemaSettingsService,
} from '../lib/workspace-assistant/schema-settings';
import {
  initializeWorkspaceAuthoring,
  publishWorkspaceAuthoringAction,
  workspaceAuthoringState,
} from '../lib/workspace-authoring';
import { setupTestDB } from './setup';

let db: AnyDB;
let cleanup: () => Promise<void>;
let projectId: string;
let counter = 0;
const actor = { kind: 'human' as const, id: 'human:local-user' };
const denied = new Set<string>();
const model = vi.hoisted(() => ({ tools: vi.fn() }));
vi.mock('../lib/provider-resolver', () => ({
  resolveProviderAndModel: async () => ({
    ok: true,
    model: 'test',
    providerId: 'test',
    provider: { id: 'test', generate: vi.fn(), generateWithTools: model.tools },
  }),
}));
vi.mock('../lib/db', () => ({ getDB: async () => db }));
vi.mock('../lib/project-access', () => ({
  getProjectAccessPrincipal: () => undefined,
  getUserId: () => undefined,
  assertProjectAccess: async (_c: unknown, _db: unknown, id: string) =>
    denied.has(id) ? new Response('denied', { status: 403 }) : { projectId: id },
}));

import { resolveWorkspaceYSchema } from '../lib/workspace-yschema';
import { schemaStudioRoutes } from '../routes/schema-studio.openapi';
import { workspaceAssistantRoutes } from '../routes/workspace-assistant.openapi';

const app = new Hono().route('/', schemaStudioRoutes);
app.route('/', workspaceAssistantRoutes);
const base = normalizeYSchemaObject({
  yschema: '0.1',
  name: 'team/assistant-test',
  version: '1.0.0',
  strict: false,
  nodes: {
    product: {
      slots: {
        title: {
          type: 'string',
          minLength: 1,
          maxWords: 24,
          provenanceRequired: true,
          gapQuestion: 'What is the product?',
        },
      },
      requiredSlots: ['title'],
    },
  },
  relationTypes: {},
  rules: [],
});
const slot: AssistantSchemaSettingsInput = {
  action: 'add_slot',
  nodePath: 'product',
  name: 'advantage',
  definition: { type: 'string', maxWords: 40, gapQuestion: 'What is the advantage?' },
  required: false,
  intent: 'Add an advantage Slot',
};

async function fixture() {
  const workspaceId = `settings-${++counter}`;
  await insertBranch(db, { projectId, name: workspaceId });
  await upsertWorkspaceDraft(db, {
    project_id: projectId,
    workspace_id: workspaceId,
    title: workspaceId,
    target_branch: workspaceId,
    workspace_state: {
      targetBranch: workspaceId,
      schemaBindings: [
        { canonicalName: base.name, version: base.version, mode: 'pinned', rootKey: 'candidate' },
      ],
    },
  });
  await initializeWorkspaceAuthoring(db, {
    projectId,
    workspaceId,
    expectedWorkspaceRevision: 1,
    expectedRefHead: null,
    actor,
    actionId: 'init',
  });
  return workspaceId;
}
async function run<T>(
  workspaceId: string,
  invoke: (service: ReturnType<typeof createAssistantSchemaSettingsService>) => Promise<T>,
  principal = actor,
  conversationId = 'conversation'
) {
  let result: T | undefined;
  let failure: unknown;
  await new Hono()
    .get('/', async (c) => {
      try {
        result = await invoke(
          createAssistantSchemaSettingsService(
            c,
            db,
            projectId,
            workspaceId,
            principal,
            conversationId
          )
        );
      } catch (error) {
        failure = error;
      }
      return c.text('done');
    })
    .request('/');
  if (failure) throw failure;
  return result!;
}
beforeAll(async () => {
  const setup = await setupTestDB();
  db = setup.db;
  cleanup = setup.cleanup;
  projectId = (await insertProject(db, { name: 'Schema settings tests' })).projectId;
  await insertBranch(db, { projectId, name: 'main' });
  const manifest = {
    apiVersion: 't3x.dev/yschema-blueprint/v1',
    schema: base,
    license: 'MIT',
    registry: { schemaHash: await sha256CompositionValue(base), renderPlan: [], originsByPath: {} },
  };
  await upsertYSchemaArtifactVersion(db, {
    artifact_id: 'assistant-schema',
    artifact_version_id: 'assistant-schema-v1',
    canonical_name: base.name,
    version: base.version!,
    family: 'open',
    kind: 'schema',
    visibility: 'private',
    owner_project_id: projectId,
    status: 'published',
    manifest_json: manifest,
    artifact_hash: await sha256CompositionValue(manifest),
    path_count: 2,
    provides: [],
    requires: [],
  });
  const add = await app.request(`/v1/projects/${projectId}/schema-studio/candidates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourceProjectId: projectId,
      canonicalName: base.name,
      version: base.version,
    }),
  });
  expect(add.status).toBe(200);
});
afterAll(async () => cleanup?.());

it('uses the bound prepared snapshot, asks before discarding a newer Studio edit, and synchronizes a real snapshot', async () => {
  const ws = await fixture();
  const source = (await listSchemaStudioCandidates(db, projectId))[0]!;
  const bound = normalizeYSchemaObject({
    ...base,
    nodes: {
      ...base.nodes,
      requirements: {
        repeated: true,
        slots: {
          title: { type: 'string', maxLength: 80 },
          inherited: { type: 'string', gapQuestion: 'Preserve this' },
        },
        requiredSlots: ['title'],
      },
    },
  });
  const boundHash = await sha256CompositionValue(bound);
  const compositionHash = await sha256CompositionValue({ boundHash, ws });
  const binding = {
    compositionId: 'prepared:' + compositionHash,
    compositionRevision: 1,
    compositionHash,
    schemaHash: boundHash,
    canonicalName: 'prepared:' + compositionHash,
    version: '1',
  };
  const sourceDescriptor = { kind: 'studio', candidateIds: [source.id] };
  const selectionHash = await sha256CompositionValue({
    apiVersion: 't3x.dev/studio-selection/v1',
    projectId,
    sources: [
      {
        projectId: source.sourceProjectId,
        canonicalName: source.canonicalName,
        version: source.version,
        artifactVersionId: source.artifactVersionId,
        hash: source.artifactHash,
      },
    ],
  });
  await saveYSchemaCompositionSnapshot(db, {
    snapshot_id: 'bound-' + ws,
    project_id: projectId,
    composition_id: binding.compositionId,
    composition_revision: 1,
    composition_hash: compositionHash,
    compiled_schema_hash: boundHash,
    compiler_version: 'test',
    // Legacy snapshots did not persist sources: recover the matching receipt, not the latest one.
    manifest_json: { selectionHash },
    schema_json: { ...bound },
    render_plan_json: [],
    origins_json: {},
  });
  // Bind using the normal Workspace persistence fixture, retaining its exact preparation receipt.
  await transactWorkspaceAuthoring(
    db,
    { projectId, workspaceId: ws, refName: ws },
    async (_tx, current) => ({
      workspace: {
        ...current.workspace_state,
        schemaBindings: [binding],
        schemaPreparations: [
          { schemaHash: boundHash, source: sourceDescriptor },
          {
            schemaHash: 'sha256:' + '0'.repeat(64),
            source: { kind: 'studio', candidateIds: ['unrelated-latest-source'] },
          },
        ],
      },
      value: null,
    })
  );
  const studio = await app.request(
    '/v1/projects/' + projectId + '/schema-studio/edit-candidates/' + ws,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: ws,
        candidateIds: [source.id],
        ifRevision: 0,
        retryKey: 'newer-studio-' + ws,
        intent: 'Unrelated unadopted Studio work',
        origin: 'studio',
        localContribution: { nodes: { unrelated: { slots: {} } } },
      }),
    }
  );
  expect(studio.status).toBe(200);
  const existing = (await studio.json()).data.candidate;
  const before = (await findWorkspaceDraft(db, projectId, ws))!;
  const owner = {
    ...slot,
    nodePath: 'requirements',
    name: 'owner',
    definition: { type: 'string' },
    required: true,
  };
  const shown = await run(ws, (service) => service.show(owner, 'prepared-owner-' + ws));
  expect(shown.studioConflict).toEqual({
    candidateId: existing.candidateId,
    revision: existing.revision,
  });
  expect(
    (await findWorkspaceDraft(db, projectId, ws))!.workspace_state!.schemaEditCandidate
  ).toEqual(existing);
  await expect(
    run(ws, (service) => service.confirm(shown.settingsId, shown.revision, owner))
  ).rejects.toThrow('explicitly confirm');
  const endpoint =
    '/v1/projects/' + projectId + '/workspaces/' + ws + '/source-chat/assistant/schema-settings';
  const request = {
    conversationId: 'conversation',
    settingsId: shown.settingsId,
    ifRevision: shown.revision,
    settings: owner,
    generateSnapshot: true,
  };
  const declined = await app.request(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  expect(declined.status).toBe(409);
  const response = await app.request(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...request, discardStudioCandidate: true }),
  });
  expect(response.status, await response.clone().text()).toBe(200);
  const generated = (await response.json()).data;
  expect(generated.status).toBe('generated');
  expect(generated.snapshot).toBeDefined();
  const after = (await findWorkspaceDraft(db, projectId, ws))!;
  const edit = after.workspace_state!.schemaEditCandidate as typeof existing;
  expect(edit.authoringDraft.base.compositionId).toBe(binding.compositionId);
  const replayed = await applyWorkspaceSchemaYOps(bound, edit.authoringDraft.effect.operations);
  expect(replayed.schema.nodes.requirements.slots!.owner).toEqual({ type: 'string' });
  expect(replayed.schema.nodes.requirements.requiredSlots).toContain('owner');
  expect(replayed.schema.nodes.requirements.slots!.inherited).toEqual(
    bound.nodes.requirements.slots!.inherited
  );
  expect(replayed.schema.nodes.unrelated).toBeUndefined();
  const frozen = await findYSchemaCompositionSnapshot(db, {
    project_id: projectId,
    composition_id: generated.snapshot!.compositionId,
    composition_revision: 1,
    compiled_schema_hash: replayed.schemaHash,
  });
  expect(frozen?.schemaJson).toEqual(replayed.schema);
  expect(after.workspace_state!.schemaBindings).toEqual(before.workspace_state!.schemaBindings);
  expect(currentComposition(workspaceAuthoringState(after.workspace_state!).ledger)).toEqual(
    currentComposition(workspaceAuthoringState(before.workspace_state!).ledger)
  );
  const preview = await app.request('/v1/projects/' + projectId + '/schema-studio/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workspaceId: ws,
      candidateIds: [source.id],
      schemaEditCandidate: { candidateId: edit.candidateId, revision: edit.revision },
    }),
  });
  expect(preview.status, await preview.clone().text()).toBe(200);
  expect((await preview.json()).data.schemaHash).toBe(generated.snapshot!.schemaHash);
  // Lost responses may retry the original button request, without another revision/write.
  const revision = after.revision;
  const repeated = await app.request(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...request, discardStudioCandidate: true }),
  });
  expect(repeated.status).toBe(200);
  expect((await findWorkspaceDraft(db, projectId, ws))!.revision).toBe(revision);
  const restored = await app.request(
    '/v1/projects/' + projectId + '/schema-studio/edit-candidates/' + ws
  );
  expect(restored.status).toBe(200);
  expect((await restored.json()).data.baseDefinition).toEqual(bound);
  // Further Studio edits must keep replaying against the bound snapshot, not the original Starter.
  const nextSchema = structuredClone(replayed.schema);
  nextSchema.nodes.requirements.slots!.owner.maxLength = 40;
  const saved = await app.request(
    '/v1/projects/' + projectId + '/schema-studio/edit-candidates/' + ws,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: ws,
        candidateIds: [source.id],
        ifRevision: edit.revision,
        retryKey: 'studio-after-snapshot-' + ws,
        origin: 'studio',
        intent: 'Constrain owner length',
        localContribution: {},
        schemaDefinition: nextSchema,
        baseSchemaHash: boundHash,
      }),
    }
  );
  expect(saved.status, await saved.clone().text()).toBe(200);
  const savedEdit = (await saved.json()).data.candidate;
  expect(savedEdit.authoringDraft.base.compositionId).toBe(binding.compositionId);
  expect(savedEdit.baseDefinition).toEqual(bound);
  const edited = await applyWorkspaceSchemaYOps(bound, savedEdit.authoringDraft.effect.operations);
  expect(edited.schema.nodes.requirements.slots!.owner.maxLength).toBe(40);
  expect(edited.schema.nodes.requirements.slots!.inherited).toEqual(
    bound.nodes.requirements.slots!.inherited
  );
});

describe('Assistant Schema settings using Studio', () => {
  async function seedProduct(ws: string, extra: Record<string, unknown> = {}) {
    const draft = (await findWorkspaceDraft(db, projectId, ws))!;
    await publishWorkspaceAuthoringAction(db, {
      projectId,
      workspaceId: ws,
      actor,
      channel: 'manual',
      actionId: 'product-content',
      operations: [
        { set: { path: 'candidate', value: { product: { title: 'Product', ...extra } } } },
      ],
      expectedRevision: workspaceAuthoringState(draft.workspace_state!).ledger.compositionRevision,
      expectedWorkspaceRevision: draft.revision,
      expectedRefHead: null,
    });
  }
  it('saves and binds the exact snapshot directly, retaining content and reporting required gaps', async () => {
    const ws = await fixture();
    await seedProduct(ws);
    const before = (await findWorkspaceDraft(db, projectId, ws))!;
    const owner = { ...slot, name: 'owner', required: true, definition: { type: 'string' } };
    const shown = await run(ws, (s) => s.show(owner, 'direct-save-' + ws));
    const endpoint =
      '/v1/projects/' + projectId + '/workspaces/' + ws + '/source-chat/assistant/schema-settings';
    const payload = {
      conversationId: 'conversation',
      settingsId: shown.settingsId,
      ifRevision: shown.revision,
      settings: owner,
      applyToDraft: true,
    };
    const response = await app.request(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(response.status, await response.clone().text()).toBe(200);
    const saved = (await response.json()).data;
    expect(saved.status).toBe('applied');
    expect(saved.application.ready).toBe(false);
    expect(saved.application.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'product/owner' })])
    );
    const after = (await findWorkspaceDraft(db, projectId, ws))!;
    expect(after.workspace_state!.schemaBindings).toEqual([
      expect.objectContaining(saved.snapshot),
    ]);
    expect(after.workspace_state!.authoringLedger).toEqual(before.workspace_state!.authoringLedger);
    expect(after.workspace_state!.authoringBasis).toEqual(before.workspace_state!.authoringBasis);
    expect(after.status).toBe('editing');
    const resolved = await resolveWorkspaceYSchema(after.workspace_state!, db, projectId);
    expect(resolved.schema!.nodes.product.requiredSlots).toContain('owner');
    expect(resolved.schema!.nodes.product.slots!.title).toEqual(base.nodes.product.slots!.title);
    const retry = await app.request(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(retry.status, await retry.clone().text()).toBe(200);
    expect((await findWorkspaceDraft(db, projectId, ws))!.revision).toBe(after.revision);
    // Subsequent requests use the newly bound snapshot, not the initial Starter.
    const next = await run(ws, (s) => s.show({ ...slot, name: 'next_slot' }, 'after-apply-' + ws));
    expect(next.schemaHash).toBe(saved.snapshot.schemaHash);
    expect(next.studioConflict).toBeUndefined();
  });
  it('requires explicit Studio replacement and then saves the replacement directly to Draft', async () => {
    const ws = await fixture();
    const first = await run(ws, (s) => s.show(slot, 'first-' + ws));
    await run(ws, (s) => s.confirm(first.settingsId, first.revision, slot));
    await run(ws, (s) => s.propose(first.settingsId));
    const owner = { ...slot, name: 'owner' };
    const shown = await run(ws, (s) => s.show(owner, 'replace-' + ws));
    const endpoint =
      '/v1/projects/' + projectId + '/workspaces/' + ws + '/source-chat/assistant/schema-settings';
    const payload = {
      conversationId: 'conversation',
      settingsId: shown.settingsId,
      ifRevision: shown.revision,
      settings: owner,
      applyToDraft: true,
    };
    const before = (await findWorkspaceDraft(db, projectId, ws))!;
    expect(
      (
        await app.request(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      ).status
    ).toBe(409);
    expect((await findWorkspaceDraft(db, projectId, ws))!.revision).toBe(before.revision);
    const response = await app.request(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, discardStudioCandidate: true }),
    });
    expect(response.status, await response.clone().text()).toBe(200);
    const after = (await findWorkspaceDraft(db, projectId, ws))!;
    const resolved = await resolveWorkspaceYSchema(after.workspace_state!, db, projectId);
    expect(resolved.schema!.nodes.product.slots!.owner).toBeDefined();
    expect(resolved.schema!.nodes.product.slots!.advantage).toBeUndefined();
    expect(after.workspace_state!.authoringLedger).toEqual(before.workspace_state!.authoringLedger);
  });
  it('does not bind incompatible content, stale content or lost authority', async () => {
    for (const kind of ['incompatible', 'stale', 'permission']) {
      const ws = await fixture();
      await seedProduct(ws, kind === 'incompatible' ? { advantage: 'not a number' } : {});
      const settings = kind === 'incompatible' ? { ...slot, definition: { type: 'number' } } : slot;
      const shown = await run(ws, (s) => s.show(settings, kind + ws));
      await run(ws, (s) => s.confirm(shown.settingsId, shown.revision, settings));
      await run(ws, (s) => s.propose(shown.settingsId));
      const before = (await findWorkspaceDraft(db, projectId, ws))!;
      if (kind === 'stale')
        await publishWorkspaceAuthoringAction(db, {
          projectId,
          workspaceId: ws,
          actor,
          channel: 'manual',
          actionId: 'later-content',
          operations: [{ set: { path: 'candidate/product/title', value: 'New title' } }],
          expectedRevision: workspaceAuthoringState(before.workspace_state!).ledger
            .compositionRevision,
          expectedWorkspaceRevision: before.revision,
          expectedRefHead: null,
        });
      if (kind === 'permission') denied.add(projectId);
      try {
        await expect(run(ws, (s) => s.applyToDraft(shown.settingsId))).rejects.toThrow();
      } finally {
        denied.delete(projectId);
      }
      expect(
        (await findWorkspaceDraft(db, projectId, ws))!.workspace_state!.schemaBindings
      ).toEqual(before.workspace_state!.schemaBindings);
      expect((await run(ws, (s) => s.read()))!.status).toBe('generated');
    }
  });
  it('streams a settings card, accepts human confirmation, then resumes the AI with the confirmed ID', async () => {
    const ws = await fixture();
    const conversation = await insertConversation(db, { projectId, title: 'Schema conversation' });
    const user = await insertTurn(db, {
      projectId,
      conversationId: conversation.conversationId,
      role: 'user',
      content: 'Add an advantage Slot to product.',
    });
    const prefix = `/v1/projects/${projectId}/workspaces/${ws}/source-chat/assistant`;
    const post = (path: string, body: unknown) =>
      app.request(prefix + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    model.tools.mockResolvedValueOnce({
      tool_calls: [{ id: 'model-card', name: 'showSchemaSettings', input: slot }],
      stop_reason: 'tool_use',
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    const first = await post('/stream', {
      request_id: 'show',
      conversation_id: conversation.conversationId,
      user_turn_hash: user.turnHash,
      if_revision: (await findWorkspaceDraft(db, projectId, ws))!.revision,
      allow_proposal: true,
    });
    const firstEvents = await first.text();
    expect(firstEvents).toContain('awaiting_confirmation');
    expect(model.tools).toHaveBeenCalledTimes(1);
    const card = (
      await (
        await app.request(
          `${prefix}/schema-settings?conversation_id=${conversation.conversationId}`
        )
      ).json()
    ).data;
    expect(card.status).toBe('pending');
    expect(card.baseDefinition).toBeUndefined();
    const confirmation = await post('/schema-settings', {
      conversationId: conversation.conversationId,
      settingsId: card.settingsId,
      ifRevision: card.revision,
      settings: { ...slot, definition: { type: 'string', maxWords: 60 } },
    });
    expect(confirmation.status).toBe(200);
    const confirmationTurn = await insertTurn(db, {
      projectId,
      conversationId: conversation.conversationId,
      role: 'user',
      content: 'Generate the Schema candidate from my confirmed settings.',
    });
    model.tools.mockResolvedValueOnce({
      tool_calls: [
        {
          id: 'model-proposal',
          name: 'requestProposal',
          input: {
            target: 'schema',
            instruction: 'Add advantage',
            confirmedSettingsId: card.settingsId,
          },
        },
      ],
      stop_reason: 'tool_use',
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    const resumed = await post('/stream', {
      request_id: 'confirmed',
      conversation_id: conversation.conversationId,
      user_turn_hash: confirmationTurn.turnHash,
      if_revision: (await findWorkspaceDraft(db, projectId, ws))!.revision,
      allow_proposal: true,
      confirmed_settings_id: card.settingsId,
    });
    const events = await resumed.text();
    expect(events).toContain('"kind":"schema"');
    expect(events).not.toContain('"type":"error"');
    expect(model.tools).toHaveBeenCalledTimes(2);
    const cardAfter = (
      await (
        await app.request(
          `${prefix}/schema-settings?conversation_id=${conversation.conversationId}`
        )
      ).json()
    ).data;
    expect(cardAfter.status).toBe('generated');
    expect(cardAfter.settings.definition.maxWords).toBe(60);
  });
  it('stages, restores, confirms exact user attributes and saves a replayable Studio candidate without applying content', async () => {
    const ws = await fixture();
    const before = (await findWorkspaceDraft(db, projectId, ws))!;
    const shown = await run(ws, (service) => service.show(slot, 'settings-one'));
    expect(shown.status).toBe('pending');
    const pending = (await findWorkspaceDraft(db, projectId, ws))!;
    expect(pending.workspace_state!.schemaBindings).toEqual(before.workspace_state!.schemaBindings);
    expect(pending.workspace_state!.schemaEditCandidate).toBeUndefined();
    expect(await run(ws, (service) => service.read())).toMatchObject({
      settingsId: shown.settingsId,
      status: 'pending',
    });
    await expect(run(ws, (service) => service.propose(shown.settingsId))).rejects.toThrow(
      'Confirm'
    );
    const changed = {
      ...slot,
      name: 'benefit',
      definition: { ...slot.definition, maxWords: 60, provenanceRequired: true },
      required: true,
    };
    const confirmed = await run(ws, (service) =>
      service.confirm(shown.settingsId, shown.revision, changed)
    );
    const retry = await run(ws, (service) =>
      service.confirm(shown.settingsId, shown.revision, changed)
    );
    expect(retry.revision).toBe(confirmed.revision);
    expect(
      (await findWorkspaceDraft(db, projectId, ws))!.workspace_state!.schemaEditCandidate
    ).toBeUndefined();
    const generated = await run(ws, (service) => service.propose(shown.settingsId));
    expect(generated.kind).toBe('schema');
    const after = (await findWorkspaceDraft(db, projectId, ws))!;
    const candidate = after.workspace_state!.schemaEditCandidate as {
      authoringDraft: { effect: { operations: Parameters<typeof applyWorkspaceSchemaYOps>[1] } };
      origin: unknown;
      revision: number;
    };
    const replayed = await applyWorkspaceSchemaYOps(
      base,
      candidate.authoringDraft.effect.operations
    );
    expect(replayed.schema.nodes.product.slots!.benefit).toEqual(changed.definition);
    expect(replayed.schema.nodes.product.requiredSlots).toContain('benefit');
    expect(replayed.schema.nodes.product.slots!.title).toEqual(base.nodes.product.slots!.title);
    expect(candidate.origin).toEqual({ channel: 'assistant', actor });
    expect(after.workspace_state!.schemaBindings).toEqual(before.workspace_state!.schemaBindings);
    expect(currentComposition(workspaceAuthoringState(after.workspace_state!).ledger)).toEqual(
      currentComposition(workspaceAuthoringState(before.workspace_state!).ledger)
    );
    expect((await run(ws, (service) => service.propose(shown.settingsId))).reused).toBe(true);
    expect((await findWorkspaceDraft(db, projectId, ws))!.revision).toBe(after.revision);
    // Existing Studio route can read the exact same saved candidate.
    const restored = await app.request(
      `/v1/projects/${projectId}/schema-studio/edit-candidates/${ws}`
    );
    expect(restored.status).toBe(200);
    expect((await restored.json()).data.candidateId).toBe(generated.candidateId);
  });
  it('allows one winner for concurrent confirmation and does not silently overwrite settings', async () => {
    const ws = await fixture();
    const shown = await run(ws, (s) => s.show(slot, 'concurrent'));
    const results = await Promise.allSettled([
      run(ws, (s) => s.confirm(shown.settingsId, 1, { ...slot, name: 'first' })),
      run(ws, (s) => s.confirm(shown.settingsId, 1, { ...slot, name: 'second' })),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });
  it('rejects cross-user access, changed parent and an unconfirmed revision', async () => {
    const ws = await fixture();
    const shown = await run(ws, (s) => s.show(slot, 'owned'));
    await expect(run(ws, (s) => s.read(), { ...actor, id: 'other' })).rejects.toThrow(
      'another user'
    );
    await expect(
      run(ws, (s) => s.confirm(shown.settingsId, 1, { ...slot, nodePath: 'other' }))
    ).rejects.toThrow('parent');
    await expect(run(ws, (s) => s.confirm(shown.settingsId, 2, slot))).rejects.toThrow(
      'Settings changed'
    );
    await expect(run(ws, (s) => s.show(slot, 'overwrite'))).rejects.toThrow('Confirm or cancel');
    await run(ws, (s) => s.confirm(shown.settingsId, 1, null));
    expect((await run(ws, (s) => s.read()))!.status).toBe('cancelled');
  });
  it('blocks stale content but permits cancelling a stale pending card', async () => {
    const ws = await fixture();
    const shown = await run(ws, (s) => s.show(slot, 'stale'));
    const draft = (await findWorkspaceDraft(db, projectId, ws))!;
    const { ledger } = workspaceAuthoringState(draft.workspace_state!);
    await publishWorkspaceAuthoringAction(db, {
      projectId,
      workspaceId: ws,
      actor,
      channel: 'manual',
      actionId: 'change',
      operations: [{ set: { path: 'changed', value: true } }],
      expectedRevision: ledger.compositionRevision,
      expectedWorkspaceRevision: draft.revision,
      expectedRefHead: null,
    });
    await expect(run(ws, (s) => s.confirm(shown.settingsId, 1, slot))).rejects.toThrow('changed');
    expect((await run(ws, (s) => s.confirm(shown.settingsId, 1, null))).status).toBe('cancelled');
  });
  it('rechecks source permissions before saving a candidate and retains confirmation on failure', async () => {
    const ws = await fixture();
    const shown = await run(ws, (s) => s.show(slot, 'permission'));
    await run(ws, (s) => s.confirm(shown.settingsId, 1, slot));
    denied.add(projectId);
    try {
      await expect(run(ws, (s) => s.propose(shown.settingsId))).rejects.toThrow();
    } finally {
      denied.delete(projectId);
    }
    expect((await run(ws, (s) => s.read()))!.status).toBe('confirmed');
    expect(
      (await findWorkspaceDraft(db, projectId, ws))!.workspace_state!.schemaEditCandidate
    ).toBeUndefined();
  });
  it('supports Node addition and rejects collisions, invalid definitions and nested repeated definitions', async () => {
    const added = await applySchemaSettings(base, {
      ...slot,
      action: 'add_node',
      nodePath: '',
      name: 'experiments',
      definition: {
        repeated: true,
        slots: { title: { type: 'string', gapQuestion: 'Which experiment?' } },
      },
    });
    expect(added.schema.nodes.experiments.repeated).toBe(true);
    await expect(applySchemaSettings(base, { ...slot, name: 'title' })).rejects.toThrow('exists');
    await expect(
      applySchemaSettings(base, {
        ...slot,
        definition: { type: 'string', minLength: 10, maxLength: 1 },
      })
    ).rejects.toThrow();
    await expect(
      applySchemaSettings(added.schema, {
        ...slot,
        action: 'add_node',
        nodePath: 'experiments',
        definition: { slots: {} },
      })
    ).rejects.toThrow('cannot own');
  });
});
