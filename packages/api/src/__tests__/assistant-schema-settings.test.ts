import type { AssistantSchemaSettingsInput } from '@t3x-dev/api-client';
import { currentComposition } from '@t3x-dev/application';
import { applyWorkspaceSchemaYOps, createYOpsState } from '@t3x-dev/core';
import {
  type AnyDB,
  findTurnsByConversation,
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
import { compileConfirmedSchemaChange } from '../lib/schema-change-contract';
import { createAssistantSchemaSettingsService } from '../lib/workspace-assistant/schema-settings';
import {
  buildAuthoringPreparation,
  initializeWorkspaceAuthoring,
  publishWorkspaceAuthoringAction,
  renewWorkspaceAuthoringState,
  workspaceAuthoringState,
} from '../lib/workspace-authoring';
import { setupTestDB } from './setup';

let db: AnyDB;
let cleanup: () => Promise<void>;
let projectId: string;
let counter = 0;
const actor = { kind: 'human' as const, id: 'human:local-user' };
const denied = new Set<string>();
const model = vi.hoisted(() => ({ tools: vi.fn(), structured: vi.fn(), text: vi.fn() }));
vi.mock('../lib/provider-resolver', () => ({
  resolveProviderAndModel: async () => ({
    ok: true,
    model: 'test',
    providerId: 'test',
    provider: {
      id: 'test',
      generate: vi.fn(),
      generateFromPrompt: model.text,
      generateWithTools: model.tools,
      generateStructured: model.structured,
    },
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

it('applies a human-edited confirmation without any model call, preserving content and replay guards', async () => {
  const ws = await fixture();
  const shown = await run(ws, (service) => service.show(slot, `deterministic-${ws}`));
  const before = (await findWorkspaceDraft(db, projectId, ws))!;
  const calls = model.structured.mock.calls.length;
  const edited = { ...slot, required: true, definition: { type: 'string', maxLength: 24 } };
  const response = await app.request(
    `/v1/projects/${projectId}/workspaces/${ws}/source-chat/assistant/schema-settings`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: 'conversation',
        settingsId: shown.settingsId,
        ifRevision: shown.revision,
        settings: edited,
        applyToDraft: true,
      }),
    }
  );
  expect(response.status, await response.clone().text()).toBe(200);
  expect((await response.json()).data.status).toBe('applied');
  expect(model.structured).toHaveBeenCalledTimes(calls);
  const after = (await findWorkspaceDraft(db, projectId, ws))!;
  expect(after.workspace_state!.authoringLedger).toEqual(before.workspace_state!.authoringLedger);
  const edit = after.workspace_state!.schemaEditCandidate as {
    authoringDraft: { effect: { operations: Parameters<typeof applyWorkspaceSchemaYOps>[1] } };
  };
  const result = await applyWorkspaceSchemaYOps(base, edit.authoringDraft.effect.operations);
  expect(result.schema.nodes.product.slots!.advantage).toEqual(edited.definition);
  expect(result.schema.nodes.product.requiredSlots).toContain('advantage');
  const stale = structuredClone(base);
  stale.nodes.product.slots.title.maxWords = 99;
  await expect(
    applyWorkspaceSchemaYOps(stale, edit.authoringDraft.effect.operations)
  ).rejects.toThrow();
});

it('stages a Node and its two Slots as three durable cards, each requiring its own Confirm', async () => {
  const ws = await fixture();
  const before = (await findWorkspaceDraft(db, projectId, ws))!;
  const shown = await run(ws, (service) =>
    service.show(
      {
        action: 'add_node',
        nodePath: 'product',
        name: 'owner',
        definition: {
          description: 'Product owner',
          slots: { name: { type: 'string' }, phone: { type: 'string' } },
          requiredSlots: ['name'],
        },
        intent: 'Add owner with name and phone',
      },
      'owner-plan'
    )
  );
  expect(
    shown.cards?.map((card) => [card.settings.action, card.settings.name, card.status])
  ).toEqual([
    ['add_node', 'owner', 'pending'],
    ['add_slot', 'name', 'queued'],
    ['add_slot', 'phone', 'queued'],
  ]);
  expect(shown.settings.definition.slots).toBeUndefined();
  expect(shown.settings.intent).toBe('Add only Node product/owner');
  expect(shown.cards![1]!.settings.intent).toBe('Add only Slot product/owner/name');
  expect((await run(ws, (service) => service.read()))?.cards).toHaveLength(3);
  expect((await findWorkspaceDraft(db, projectId, ws))!.workspace_state!.schemaBindings).toEqual(
    before.workspace_state!.schemaBindings
  );
  const confirm = async (card: NonNullable<typeof shown.cards>[number]) =>
    app.request(
      `/v1/projects/${projectId}/workspaces/${ws}/source-chat/assistant/schema-settings`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: 'conversation',
          settingsId: card.settingsId,
          ifRevision: card.revision,
          settings: card.settings,
          applyToDraft: true,
        }),
      }
    );
  expect((await confirm(shown.cards![1]!)).status).toBe(409);
  let state = shown;
  for (const [step, index] of [0, 2, 1].entries()) {
    const response = await confirm(state.cards![index]!);
    expect(response.status, await response.clone().text()).toBe(200);
    state = (await response.json()).data;
    if (step === 0)
      await expect(run(ws, (service) => service.show(slot, 'premature-next-plan'))).rejects.toThrow(
        'remaining Schema cards'
      );
    const draft = (await findWorkspaceDraft(db, projectId, ws))!;
    const schema = (await resolveWorkspaceYSchema(draft.workspace_state!, db, projectId)).schema!;
    const owner = schema.nodes.product.children as Record<
      string,
      { slots?: Record<string, unknown>; requiredSlots?: string[] }
    >;
    expect(Object.keys(owner.owner.slots ?? {})).toEqual(
      step === 0 ? [] : step === 1 ? ['phone'] : ['name', 'phone']
    );
    if (step === 2) expect(owner.owner.requiredSlots).toEqual(['name']);
    expect(draft.workspace_state!.authoringLedger).toEqual(before.workspace_state!.authoringLedger);
  }
  expect(state.cards?.map((card) => card.status)).toEqual(['applied', 'applied', 'applied']);
  const appliedWorkspace = (await findWorkspaceDraft(db, projectId, ws))!.workspace_state!;
  const frozen = buildAuthoringPreparation(appliedWorkspace);
  expect(frozen.schemaCards?.map((card) => card.settingsId)).toEqual([
    state.cards![0].settingsId,
    state.cards![2].settingsId,
    state.cards![1].settingsId,
  ]);
  expect(
    frozen.schemaCards?.every((card) => card.status === 'applied' && card.cards === undefined)
  ).toBe(true);
  const fresh = renewWorkspaceAuthoringState(appliedWorkspace, {
    commitDigest: `sha256:${'1'.repeat(64)}`,
    committedAt: '2026-10-22T00:00:00Z',
    transitionId: 'committed',
    preparationDigest: null,
    result: createYOpsState(currentComposition(workspaceAuthoringState(appliedWorkspace).ledger)),
  });
  expect(fresh.assistantSchemaSettings).toBeUndefined();
  expect(fresh.schemaPreparations).toBeUndefined();
  expect(fresh.schemaPending).toBeUndefined();
  expect(fresh.schemaBindings).toEqual(appliedWorkspace.schemaBindings);
  expect(buildAuthoringPreparation(fresh).schemaCards).toBeUndefined();
  expect(frozen.schemaCards).toHaveLength(3);
  await expect(run(ws, (service) => service.show(slot, 'next-plan'))).resolves.toMatchObject({
    status: 'pending',
    settings: slot,
  });
});

it('does not allow one Node Confirm to smuggle its unconfirmed Slots into the Draft', async () => {
  const ws = await fixture();
  const request: AssistantSchemaSettingsInput = {
    action: 'add_node',
    nodePath: 'product',
    name: 'owner',
    definition: { slots: { phone: { type: 'string' } } },
    intent: 'Add owner and phone',
  };
  const shown = await run(ws, (service) => service.show(request, 'no-bulk-confirm'));
  await expect(
    run(ws, (service) => service.confirm(shown.settingsId, shown.revision, request))
  ).rejects.toThrow('separate');
});

it('cancels dependent cards when their parent Node is cancelled and keeps the binding unchanged', async () => {
  const ws = await fixture();
  const before = (await findWorkspaceDraft(db, projectId, ws))!;
  const shown = await run(ws, (service) =>
    service.show(
      {
        action: 'add_node',
        nodePath: 'product',
        name: 'owner',
        definition: { slots: { phone: { type: 'string' } } },
        intent: 'Add owner',
      },
      'cancel-plan'
    )
  );
  const cancelled = await run(ws, (service) =>
    service.confirm(shown.settingsId, shown.revision, null)
  );
  expect(cancelled.cards?.map((card) => card.status)).toEqual(['cancelled', 'cancelled']);
  await expect(
    run(ws, (service) => service.confirm(shown.cards![1]!.settingsId, 1, shown.cards![1]!.settings))
  ).rejects.toThrow('previous');
  expect((await findWorkspaceDraft(db, projectId, ws))!.workspace_state!.schemaBindings).toEqual(
    before.workspace_state!.schemaBindings
  );
});

it('rejects queued confirmation after outside content changes instead of silently rebasing the plan', async () => {
  const ws = await fixture();
  const shown = await run(ws, (service) =>
    service.show(
      {
        action: 'add_node',
        nodePath: 'product',
        name: 'owner',
        definition: { slots: { phone: { type: 'string' } } },
        intent: 'Add owner',
      },
      'stale-plan'
    )
  );
  await run(ws, (service) => service.confirm(shown.settingsId, shown.revision, shown.settings));
  await run(ws, (service) => service.propose(shown.settingsId));
  await run(ws, (service) => service.applyToDraft(shown.settingsId));
  const draft = (await findWorkspaceDraft(db, projectId, ws))!;
  await publishWorkspaceAuthoringAction(db, {
    projectId,
    workspaceId: ws,
    actor,
    channel: 'manual',
    actionId: 'outside-edit',
    operations: [{ set: { path: 'candidate', value: { product: { title: 'Keep this edit' } } } }],
    expectedRevision: workspaceAuthoringState(draft.workspace_state!).ledger.compositionRevision,
    expectedWorkspaceRevision: draft.revision,
    expectedRefHead: null,
  });
  const before = (await findWorkspaceDraft(db, projectId, ws))!;
  const phone = shown.cards![1]!;
  await expect(
    run(ws, (service) => service.confirm(phone.settingsId, 1, phone.settings))
  ).rejects.toThrow('outside');
  const after = (await findWorkspaceDraft(db, projectId, ws))!;
  expect(after.revision).toBe(before.revision);
  expect(after.workspace_state!.authoringLedger).toEqual(before.workspace_state!.authoringLedger);
  const cancelled = await run(ws, (service) => service.confirm(phone.settingsId, 1, null));
  expect(cancelled.cards?.at(-1)?.status).toBe('cancelled');
  expect((await findWorkspaceDraft(db, projectId, ws))!.workspace_state!.schemaBindings).toEqual(
    before.workspace_state!.schemaBindings
  );
});

it.each([
  'remove_node',
  'remove_slot',
] as const)('one human Confirm atomically removes the %s definition and its concrete content', async (action) => {
  const ws = await fixture();
  const seeded = (await findWorkspaceDraft(db, projectId, ws))!;
  await publishWorkspaceAuthoringAction(db, {
    projectId,
    workspaceId: ws,
    actor,
    channel: 'manual',
    actionId: 'seed-deleted-field-content',
    operations: [
      {
        set: {
          path: 'candidate',
          value: {
            product: { title: 'Delete this value', unrelated: 'Keep' },
            other: 'Keep sibling',
          },
        },
      },
    ],
    expectedRevision: workspaceAuthoringState(seeded.workspace_state!).ledger.compositionRevision,
    expectedWorkspaceRevision: seeded.revision,
    expectedRefHead: null,
  });
  const settings: AssistantSchemaSettingsInput = {
    action,
    nodePath: action === 'remove_slot' ? 'product' : '',
    name: action === 'remove_slot' ? 'title' : 'product',
    definition: {},
    intent: 'Remove definition and content',
  };
  const shown = await run(ws, (service) => service.show(settings, `delete-${ws}`));
  const before = (await findWorkspaceDraft(db, projectId, ws))!;
  expect(shown.settings.contentMigration).toEqual([
    {
      kind: 'remove',
      path: action === 'remove_slot' ? '"candidate"/"product"/"title"' : '"candidate"/"product"',
    },
  ]);
  const calls = model.structured.mock.calls.length;
  // Schema-only legacy confirmations and plans that omit real content are not destructive authority.
  await expect(
    run(ws, (service) => service.confirm(shown.settingsId, shown.revision, settings))
  ).rejects.toThrow('exact content deletion plan');
  await expect(
    run(ws, (service) =>
      service.confirm(shown.settingsId, shown.revision, { ...shown.settings, contentMigration: [] })
    )
  ).rejects.toThrow('exact content deletion plan');
  expect(await findWorkspaceDraft(db, projectId, ws)).toEqual(before);
  const request = () =>
    app.request(
      `/v1/projects/${projectId}/workspaces/${ws}/source-chat/assistant/schema-settings`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: 'conversation',
          settingsId: shown.settingsId,
          ifRevision: shown.revision,
          settings: shown.settings,
          applyToDraft: true,
        }),
      }
    );
  const response = await request();
  expect(response.status, await response.clone().text()).toBe(200);
  expect((await response.json()).data.status).toBe('applied');
  const after = (await findWorkspaceDraft(db, projectId, ws))!;
  expect(currentComposition(workspaceAuthoringState(after.workspace_state!).ledger)).toMatchObject({
    candidate: {
      other: 'Keep sibling',
      ...(action === 'remove_slot' ? { product: { unrelated: 'Keep' } } : {}),
    },
  });
  const document = currentComposition(workspaceAuthoringState(after.workspace_state!).ledger) as {
    candidate: Record<string, unknown>;
  };
  if (action === 'remove_node') expect(document.candidate).not.toHaveProperty('product');
  else expect(document.candidate.product).not.toHaveProperty('title');
  const schema = (await resolveWorkspaceYSchema(after.workspace_state!, db, projectId)).schema!;
  if (action === 'remove_node') expect(schema.nodes.product).toBeUndefined();
  else expect(schema.nodes.product.slots!.title).toBeUndefined();
  expect(after.workspace_state!.schemaBindings).not.toEqual(before.workspace_state!.schemaBindings);
  expect(workspaceAuthoringState(after.workspace_state!).ledger.compositionRevision).toBe(
    workspaceAuthoringState(before.workspace_state!).ledger.compositionRevision + 1
  );
  expect((await request()).status).toBe(200);
  expect(await findWorkspaceDraft(db, projectId, ws)).toEqual(after);
  expect(model.structured).toHaveBeenCalledTimes(calls);
  expect(workspaceAuthoringState(after.workspace_state!).basis.refHead).toBeNull();
});

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

it('applies the relation and enforced-rule CRUD lifecycle through one-step Confirm without model calls or content writes', async () => {
  const ws = await fixture();
  const initial = (await findWorkspaceDraft(db, projectId, ws))!;
  const modelCalls = [
    model.tools.mock.calls.length,
    model.structured.mock.calls.length,
    model.text.mock.calls.length,
  ];
  const changes: AssistantSchemaSettingsInput[] = [
    {
      action: 'add_relation',
      nodePath: '',
      name: 'links',
      definition: { from: 'product', to: 'product' },
      intent: 'Add a product link definition',
    },
    {
      action: 'edit_relation',
      nodePath: '',
      name: 'links',
      definition: { description: 'Reviewed product links', acyclic: true },
      intent: 'Constrain product links',
    },
    {
      action: 'add_rule',
      nodePath: '',
      name: 'linked_product',
      definition: {
        kind: 'required_relation',
        relationType: 'links',
        from: 'product',
        to: 'product',
      },
      intent: 'Require a product link',
    },
    {
      action: 'edit_rule',
      nodePath: '',
      name: 'linked_product',
      definition: { description: 'Keep link endpoints and rule enforcement' },
      intent: 'Describe the enforced link rule',
    },
    {
      action: 'remove_rule',
      nodePath: '',
      name: 'linked_product',
      definition: {},
      intent: 'Remove only the link rule',
    },
    {
      action: 'remove_relation',
      nodePath: '',
      name: 'links',
      definition: {},
      intent: 'Remove only the link definition',
    },
  ];
  let expected = base;
  for (const [index, settings] of changes.entries()) {
    const shown = await run(ws, (service) =>
      service.show(settings, `relation-lifecycle-${ws}-${index}`)
    );
    const response = await app.request(
      `/v1/projects/${projectId}/workspaces/${ws}/source-chat/assistant/schema-settings`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: 'conversation',
          settingsId: shown.settingsId,
          ifRevision: shown.revision,
          settings: shown.settings,
          applyToDraft: true,
        }),
      }
    );
    expect(response.status, await response.clone().text()).toBe(200);
    const result = (await response.json()).data;
    expect(result.status).toBe('applied');
    expected = (await compileConfirmedSchemaChange(expected, settings)).schema;
    const draft = (await findWorkspaceDraft(db, projectId, ws))!;
    expect((await resolveWorkspaceYSchema(draft.workspace_state!, db, projectId)).schema).toEqual(
      expected
    );
    expect(draft.workspace_state!.authoringLedger).toEqual(
      initial.workspace_state!.authoringLedger
    );
    expect(draft.parent_commit_hash).toBe(initial.parent_commit_hash);
    if (index === 2) {
      await expect(
        run(ws, (service) => service.show(changes[5]!, `invalid-reference-${ws}`))
      ).rejects.toThrow();
      expect(await findWorkspaceDraft(db, projectId, ws)).toEqual(draft);
    }
  }
  expect(expected.nodes).toEqual(base.nodes);
  expect(expected.relationTypes).toEqual({});
  expect(expected.rules).toEqual([]);
  expect([
    model.tools.mock.calls.length,
    model.structured.mock.calls.length,
    model.text.mock.calls.length,
  ]).toEqual(modelCalls);
});

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
  model.text.mockResolvedValue({
    text: '已收到工具结果，请查看字段设置。',
    usage: { inputTokens: 5, outputTokens: 5 },
  });
  model.structured.mockRejectedValue(new Error('Confirm must not invoke a model'));
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

async function renameFixture() {
  const ws = await fixture();
  const draft = (await findWorkspaceDraft(db, projectId, ws))!;
  await publishWorkspaceAuthoringAction(db, {
    projectId,
    workspaceId: ws,
    actor,
    channel: 'manual',
    actionId: 'seed-rename',
    operations: [
      {
        set: {
          path: 'candidate',
          value: { product: { title: 'Keep this title', retained: 'Unrelated' } },
        },
      },
    ],
    expectedRevision: workspaceAuthoringState(draft.workspace_state!).ledger.compositionRevision,
    expectedWorkspaceRevision: draft.revision,
    expectedRefHead: null,
  });
  return ws;
}

it.each([
  'preserve',
  'clear',
] as const)('atomically confirms a rename and its editable %s content plan without a model or Commit', async (mode) => {
  const ws = await renameFixture();
  const shown = await run(ws, (s) =>
    s.show(
      {
        action: 'rename_slot',
        nodePath: 'product',
        name: 'title',
        newName: 'headline',
        definition: {},
        intent: 'Rename title',
      },
      `rename-${ws}`
    )
  );
  expect(shown.settings.contentMigration).toEqual(shown.renameMappings!.preserve);
  expect(shown.renameMappings!.preserve).toEqual([
    { kind: 'move', from: '"candidate"/"product"/"title"', to: '"candidate"/"product"/"headline"' },
  ]);
  const settings = {
    ...shown.settings,
    renameContentMode: mode,
    contentMigration: shown.renameMappings![mode],
  };
  const request = () =>
    app.request(
      `/v1/projects/${projectId}/workspaces/${ws}/source-chat/assistant/schema-settings`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: 'conversation',
          settingsId: shown.settingsId,
          ifRevision: shown.revision,
          settings,
          applyToDraft: true,
        }),
      }
    );
  const calls = model.structured.mock.calls.length;
  const response = await request();
  expect(response.status, await response.clone().text()).toBe(200);
  expect((await response.json()).data).toMatchObject({ status: 'applied' });
  const after = (await findWorkspaceDraft(db, projectId, ws))!;
  const document = currentComposition(
    workspaceAuthoringState(after.workspace_state!).ledger
  ) as any;
  expect(document.candidate.product).toEqual({
    retained: 'Unrelated',
    ...(mode === 'preserve' ? { headline: 'Keep this title' } : {}),
  });
  const schema = (await resolveWorkspaceYSchema(after.workspace_state!, db, projectId)).schema!;
  expect(schema.nodes.product.slots!.title).toBeUndefined();
  expect(schema.nodes.product.slots!.headline).toEqual(base.nodes.product.slots!.title);
  expect(schema.nodes.product.requiredSlots).toContain('headline');
  if (mode === 'clear')
    expect((await run(ws, (s) => s.read()))!.application).toMatchObject({
      ready: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: 'REQUIRED_SLOT_MISSING' })]),
    });
  expect((await request()).status).toBe(200);
  expect(await findWorkspaceDraft(db, projectId, ws)).toEqual(after);
  expect(model.structured).toHaveBeenCalledTimes(calls);
  expect(workspaceAuthoringState(after.workspace_state!).basis.refHead).toBeNull();
});

it('retains both Schema and content on invalid mapping and lets the generated card correct its plan', async () => {
  const ws = await renameFixture();
  const shown = await run(ws, (s) =>
    s.show(
      {
        action: 'rename_slot',
        nodePath: 'product',
        name: 'title',
        newName: 'headline',
        definition: {},
        intent: 'Rename title',
      },
      `correct-${ws}`
    )
  );
  const before = (await findWorkspaceDraft(db, projectId, ws))!;
  const broken = {
    ...shown.settings,
    contentMigration: [
      {
        kind: 'move' as const,
        from: 'candidate/product/missing',
        to: 'candidate/product/headline',
      },
    ],
  };
  await run(ws, (s) => s.confirm(shown.settingsId, shown.revision, broken));
  await run(ws, (s) => s.propose(shown.settingsId));
  await expect(run(ws, (s) => s.applyToDraft(shown.settingsId))).rejects.toThrow();
  const failed = (await findWorkspaceDraft(db, projectId, ws))!;
  expect(failed.workspace_state!.schemaBindings).toEqual(before.workspace_state!.schemaBindings);
  expect(failed.workspace_state!.authoringLedger).toEqual(before.workspace_state!.authoringLedger);
  const generated = (await run(ws, (s) => s.read()))!;
  await run(ws, (s) =>
    s.confirm(generated.settingsId, generated.revision, {
      ...generated.settings,
      contentMigration: shown.renameMappings!.preserve,
    })
  );
  await run(ws, (s) => s.applyToDraft(shown.settingsId));
  expect((await run(ws, (s) => s.read()))!.status).toBe('applied');
});

it.each([
  { action: 'add_slot', name: 'owner', definition: { type: 'string' }, required: true },
  { action: 'edit_slot', name: 'title', definition: { maxWords: 50 } },
  { action: 'edit_slot', name: 'title', definition: { enum: ['draft', 'ready'] }, required: false },
  { action: 'remove_slot', name: 'title', definition: {} },
  { action: 'rename_slot', name: 'title', newName: 'headline', definition: {} },
  {
    action: 'edit_node',
    name: 'product',
    definition: { description: 'Updated product' },
    nodePath: '',
  },
  { action: 'remove_node', name: 'product', definition: {}, nodePath: '' },
  { action: 'rename_node', name: 'product', newName: 'overview', definition: {}, nodePath: '' },
  {
    action: 'add_node',
    name: 'experiments',
    definition: { slots: { title: { type: 'string' } } },
    nodePath: '',
  },
  {
    action: 'move_slot',
    name: 'title',
    newName: 'headline',
    definition: {},
    targetNodePath: 'product',
  },
  {
    action: 'move_node',
    name: 'product',
    newName: 'overview',
    definition: {},
    nodePath: '',
    targetNodePath: '',
  },
  {
    action: 'add_relation',
    name: 'links',
    definition: { from: 'product', to: 'product' },
    nodePath: '',
  },
  {
    action: 'add_rule',
    name: 'review',
    definition: { description: 'Review required' },
    nodePath: '',
  },
  {
    action: 'edit_slot',
    name: 'title',
    definition: { type: 'number' },
    unsetAttributes: ['minLength', 'maxWords'],
    required: false,
  },
])('human confirmation gates deterministic generation and never applies content or a binding: $action $name', async (change) => {
  const ws = await fixture();
  const settings = {
    nodePath: 'product',
    intent: 'Requested Schema change',
    ...change,
  } as AssistantSchemaSettingsInput;
  const before = (await findWorkspaceDraft(db, projectId, ws))!;
  const calls = model.structured.mock.calls.length;
  const shown = await run(ws, (service) => service.show(settings, `generic-${ws}`));
  expect(shown).not.toHaveProperty('generationMode');
  expect(shown.impact).toMatchObject({
    items: expect.any(Array),
    content: { hash: expect.any(String) },
  });
  expect(model.structured).toHaveBeenCalledTimes(calls);
  await expect(run(ws, (service) => service.propose(shown.settingsId))).rejects.toThrow('Confirm');
  const confirmed = await run(ws, (service) =>
    service.confirm(shown.settingsId, shown.revision, shown.settings)
  );
  expect(model.structured).toHaveBeenCalledTimes(calls);
  const generated = await run(ws, (service) => service.propose(confirmed.settingsId));
  expect(model.structured).toHaveBeenCalledTimes(calls);
  const after = (await findWorkspaceDraft(db, projectId, ws))!;
  expect(after.workspace_state!.schemaBindings).toEqual(before.workspace_state!.schemaBindings);
  expect(currentComposition(workspaceAuthoringState(after.workspace_state!).ledger)).toEqual(
    currentComposition(workspaceAuthoringState(before.workspace_state!).ledger)
  );
  expect(generated.kind).toBe('schema');
  const candidate = after.workspace_state!.schemaEditCandidate as {
    authoringDraft: { effect: { operations: Parameters<typeof applyWorkspaceSchemaYOps>[1] } };
  };
  const replayed = (
    await applyWorkspaceSchemaYOps(base, candidate.authoringDraft.effect.operations)
  ).schema;
  expect(replayed).toEqual((await compileConfirmedSchemaChange(base, shown.settings)).schema);
  const response = await app.request(
    `/v1/projects/${projectId}/workspaces/${ws}/source-chat/assistant/schema-settings`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: 'conversation',
        settingsId: shown.settingsId,
        ifRevision: confirmed.revision,
        settings: shown.settings,
        generateSnapshot: true,
        applyToDraft: true,
      }),
    }
  );
  if (shown.impact!.canAdopt) {
    expect(response.status, await response.clone().text()).toBe(200);
    const bound = await resolveWorkspaceYSchema(
      (await findWorkspaceDraft(db, projectId, ws))!.workspace_state!,
      db,
      projectId
    );
    expect(bound.schema).toEqual(replayed);
  } else {
    // Generating a valid Schema candidate must not bypass the existing content migration gate.
    expect(response.status, await response.clone().text()).toBe(409);
    expect((await findWorkspaceDraft(db, projectId, ws))!.workspace_state!.schemaBindings).toEqual(
      before.workspace_state!.schemaBindings
    );
    expect((await run(ws, (service) => service.read()))!.status).toBe('generated');
  }
  await run(ws, (service) => service.propose(confirmed.settingsId));
  expect(model.structured).toHaveBeenCalledTimes(calls);
});

it('uses deterministic generation for confirmed cards and reuses the exact candidate on retry', async () => {
  const ws = await fixture();
  const original = 'Add advantage, do not fill content or change any other definition.';
  const shown = await run(ws, (service) => service.show(slot, `unified-${ws}`, original));
  await run(ws, (service) => service.confirm(shown.settingsId, 1, slot));
  const before = (await findWorkspaceDraft(db, projectId, ws))!;
  const calls = model.structured.mock.calls.length;
  const generated = await run(ws, (service) => service.propose(shown.settingsId));
  expect(generated).toMatchObject({ kind: 'schema', reused: false });
  const after = (await findWorkspaceDraft(db, projectId, ws))!;
  expect(after.workspace_state!.schemaBindings).toEqual(before.workspace_state!.schemaBindings);
  expect(after.workspace_state!.authoringLedger).toEqual(before.workspace_state!.authoringLedger);
  expect(after.workspace_state!.assistantSchemaSettings).toMatchObject({
    originalInstruction: original,
  });
  expect(await run(ws, (service) => service.propose(shown.settingsId))).toMatchObject({
    reused: true,
  });
  expect(model.structured).toHaveBeenCalledTimes(calls);
});
it('confirms, generates and applies Schema in one request, preserving content and reusing retries', async () => {
  const ws = await fixture();
  const shown = await run(ws, (service) => service.show(slot, `no-combined-save-${ws}`));
  const before = (await findWorkspaceDraft(db, projectId, ws))!;
  const request = () =>
    app.request(
      `/v1/projects/${projectId}/workspaces/${ws}/source-chat/assistant/schema-settings`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: 'conversation',
          settingsId: shown.settingsId,
          ifRevision: 1,
          settings: shown.settings,
          generateSnapshot: true,
          applyToDraft: true,
        }),
      }
    );
  const calls = model.structured.mock.calls.length;
  const response = await request();
  expect(response.status, await response.clone().text()).toBe(200);
  expect((await response.json()).data.status).toBe('applied');
  const after = (await findWorkspaceDraft(db, projectId, ws))!;
  expect(after.workspace_state!.schemaBindings).not.toEqual(before.workspace_state!.schemaBindings);
  expect(after.workspace_state!.authoringLedger).toEqual(before.workspace_state!.authoringLedger);
  expect((await resolveWorkspaceYSchema(after.workspace_state!, db, projectId)).schema).toEqual(
    (await compileConfirmedSchemaChange(base, slot)).schema
  );
  expect((await request()).status).toBe(200);
  expect(model.structured).toHaveBeenCalledTimes(calls);
  expect(await findWorkspaceDraft(db, projectId, ws)).toEqual(after);
});

it('rejects a changed target during Confirm without changing the binding, and allows corrected confirmation', async () => {
  const ws = await fixture();
  const shown = await run(ws, (service) => service.show(slot, `invalid-path-${ws}`));
  const before = (await findWorkspaceDraft(db, projectId, ws))!;
  const request = (settings = slot) =>
    app.request(
      `/v1/projects/${projectId}/workspaces/${ws}/source-chat/assistant/schema-settings`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: 'conversation',
          settingsId: shown.settingsId,
          ifRevision: 1,
          settings,
          applyToDraft: true,
        }),
      }
    );
  expect((await request({ ...slot, nodePath: 'product.title' })).status).toBe(400);
  const failed = (await findWorkspaceDraft(db, projectId, ws))!;
  expect(failed.workspace_state!.schemaBindings).toEqual(before.workspace_state!.schemaBindings);
  expect(failed.workspace_state!.authoringLedger).toEqual(before.workspace_state!.authoringLedger);
  expect((await run(ws, (service) => service.read()))!.status).toBe('pending');
  const retry = await request();
  expect(retry.status, await retry.clone().text()).toBe(200);
  expect((await retry.json()).data.status).toBe('applied');
});

it.each([
  'applied',
  'blocked',
  'failed',
] as const)('returns the Confirm outcome without an extra AI reply or chat turn: %s', async (outcome) => {
  const ws = await fixture();
  if (outcome === 'blocked') {
    const draft = (await findWorkspaceDraft(db, projectId, ws))!;
    await publishWorkspaceAuthoringAction(db, {
      projectId,
      workspaceId: ws,
      actor,
      channel: 'manual',
      actionId: 'seed-blocked-content',
      operations: [
        { set: { path: 'candidate', value: { product: { title: 'Existing product' } } } },
      ],
      expectedRevision: workspaceAuthoringState(draft.workspace_state!).ledger.compositionRevision,
      expectedWorkspaceRevision: draft.revision,
      expectedRefHead: null,
    });
  }
  const conversation = await insertConversation(db, { projectId, title: 'Schema outcome' });
  const settings =
    outcome === 'blocked'
      ? {
          ...slot,
          action: 'edit_node' as const,
          nodePath: '',
          name: 'product',
          definition: { repeated: true },
        }
      : slot;
  const shown = await run(
    ws,
    (service) => service.show(settings, `reply-${ws}`, '请修改这个字段'),
    actor,
    conversation.conversationId
  );
  const beforeTurns = await findTurnsByConversation(db, {
    conversationId: conversation.conversationId,
  });
  const textCalls = model.text.mock.calls.length;
  const tools = model.tools.mock.calls.length;
  const request = () =>
    app.request(
      `/v1/projects/${projectId}/workspaces/${ws}/source-chat/assistant/schema-settings`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: conversation.conversationId,
          settingsId: shown.settingsId,
          ifRevision: shown.revision,
          settings: outcome === 'failed' ? { ...settings, nodePath: 'not_authorized' } : settings,
          applyToDraft: true,
        }),
      }
    );
  const response = await request();
  expect(response.status).toBe(outcome === 'applied' ? 200 : outcome === 'blocked' ? 409 : 400);
  const body = await response.json();
  expect(body.assistantReply).toBeUndefined();
  expect(body.error?.details?.assistantReply).toBeUndefined();
  expect(model.text).toHaveBeenCalledTimes(textCalls);
  const record = await run(ws, (service) => service.read(), actor, conversation.conversationId);
  expect(record!.status).toBe(
    outcome === 'applied' ? 'applied' : outcome === 'blocked' ? 'generated' : 'pending'
  );
  if (outcome !== 'applied') expect(body.error.message).toBeTruthy();
  const turns = await findTurnsByConversation(db, { conversationId: conversation.conversationId });
  expect(turns).toEqual(beforeTurns);
  expect(model.tools).toHaveBeenCalledTimes(tools);
  if (outcome === 'applied') {
    const calls = model.text.mock.calls.length;
    expect((await request()).status).toBe(200);
    expect(model.text).toHaveBeenCalledTimes(calls);
  }
});

it('applies the edited card parameters and snapshot without invoking a reporting model', async () => {
  const ws = await fixture();
  const conversation = await insertConversation(db, { projectId, title: 'Reply unavailable' });
  const shown = await run(
    ws,
    (service) => service.show(slot, `no-reply-${ws}`),
    actor,
    conversation.conversationId
  );
  const textCalls = model.text.mock.calls.length;
  const response = await app.request(
    `/v1/projects/${projectId}/workspaces/${ws}/source-chat/assistant/schema-settings`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: conversation.conversationId,
        settingsId: shown.settingsId,
        ifRevision: shown.revision,
        settings: { ...slot, definition: { type: 'string', maxWords: 12, description: 'Edited' } },
        applyToDraft: true,
      }),
    }
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('X-T3X-Assistant-Reply')).toBeNull();
  const body = await response.json();
  expect(body.data.status).toBe('applied');
  expect(body.assistantReply).toBeUndefined();
  expect(model.text).toHaveBeenCalledTimes(textCalls);
  const draft = (await findWorkspaceDraft(db, projectId, ws))!;
  const schema = (await resolveWorkspaceYSchema(draft.workspace_state!, db, projectId)).schema!;
  expect(schema.nodes.product.slots!.advantage).toEqual({
    type: 'string',
    maxWords: 12,
    description: 'Edited',
  });
  expect(
    await findTurnsByConversation(db, { conversationId: conversation.conversationId })
  ).toEqual([]);
});

it('does not publish a candidate after cancellation during deterministic compilation', async () => {
  const ws = await fixture();
  const shown = await run(ws, (service) => service.show(slot, `cancel-generation-${ws}`));
  const confirmed = await run(ws, (service) => service.confirm(shown.settingsId, 1, slot));
  const implementation = compileConfirmedSchemaChange;
  const compile = vi.spyOn(
    await import('../lib/schema-change-contract'),
    'compileConfirmedSchemaChange'
  );
  compile.mockImplementationOnce(async (...args) => {
    await run(ws, (service) => service.confirm(shown.settingsId, confirmed.revision, null));
    return implementation(...args);
  });
  try {
    await expect(run(ws, (service) => service.propose(shown.settingsId))).rejects.toThrow();
  } finally {
    compile.mockRestore();
  }
  expect((await run(ws, (service) => service.read()))!.status).toBe('cancelled');
  expect(
    (await findWorkspaceDraft(db, projectId, ws))!.workspace_state!.schemaEditCandidate
  ).toBeUndefined();
});

it('coalesces simultaneous Confirm generation retries into one saved candidate without model calls', async () => {
  const ws = await fixture();
  const shown = await run(ws, (service) => service.show(slot, `concurrent-generate-${ws}`));
  await run(ws, (service) => service.confirm(shown.settingsId, 1, slot));
  const calls = model.structured.mock.calls.length;
  const results = await Promise.allSettled([
    run(ws, (service) => service.propose(shown.settingsId)),
    run(ws, (service) => service.propose(shown.settingsId)),
  ]);
  expect(model.structured).toHaveBeenCalledTimes(calls);
  expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
  const after = (await findWorkspaceDraft(db, projectId, ws))!;
  expect((after.workspace_state!.schemaEditCandidate as { revision: number }).revision).toBe(1);
});

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
  it('applies the exact snapshot in one Confirm, retaining content and reporting required gaps', async () => {
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
  it('requires explicit Studio replacement before one-step generation and Draft application', async () => {
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
  it('replies once after staging three cards, then silently applies each edited card on Confirm', async () => {
    const ws = await fixture();
    const conversation = await insertConversation(db, { projectId, title: 'Schema conversation' });
    const user = await insertTurn(db, {
      projectId,
      conversationId: conversation.conversationId,
      role: 'user',
      content: 'Add owner under product, with name and phone Slots.',
    });
    const prefix = `/v1/projects/${projectId}/workspaces/${ws}/source-chat/assistant`;
    const post = (path: string, body: unknown) =>
      app.request(prefix + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    const settings = {
      action: 'add_node',
      nodePath: 'product',
      name: 'owner',
      definition: { slots: { name: { type: 'string' }, phone: { type: 'string' } } },
      intent: user.content,
    };
    const toolsBefore = model.tools.mock.calls.length;
    const textBefore = model.text.mock.calls.length;
    model.tools.mockResolvedValueOnce({
      tool_calls: [{ id: 'model-card', name: 'showSchemaChangeCard', input: settings }],
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
    expect(firstEvents).not.toContain('"type":"error"');
    expect(model.tools).toHaveBeenCalledTimes(toolsBefore + 1);
    expect(model.text).toHaveBeenCalledTimes(textBefore + 1);
    let card = (
      await (
        await app.request(
          `${prefix}/schema-settings?conversation_id=${conversation.conversationId}`
        )
      ).json()
    ).data;
    expect(card.status).toBe('pending');
    expect(card.baseDefinition).toBeUndefined();
    expect(card.cards).toHaveLength(3);
    const transcript = await findTurnsByConversation(db, {
      conversationId: conversation.conversationId,
    });
    expect(transcript.map((turn) => turn.role).sort()).toEqual(['assistant', 'user']);
    const before = (await findWorkspaceDraft(db, projectId, ws))!;
    for (const index of [0, 2, 1]) {
      const selected = card.cards[index];
      const edited =
        index === 2
          ? { ...selected.settings, required: true, definition: { type: 'string', maxLength: 24 } }
          : selected.settings;
      const confirmation = await post('/schema-settings', {
        conversationId: conversation.conversationId,
        settingsId: selected.settingsId,
        ifRevision: selected.revision,
        settings: edited,
        applyToDraft: true,
      });
      expect(confirmation.status, await confirmation.clone().text()).toBe(200);
      const body = await confirmation.json();
      expect(body.assistantReply).toBeUndefined();
      card = body.data;
      expect(card.status).toBe('applied');
      expect(
        await findTurnsByConversation(db, {
          conversationId: conversation.conversationId,
        })
      ).toEqual(transcript);
    }
    expect(model.tools).toHaveBeenCalledTimes(toolsBefore + 1);
    expect(model.text).toHaveBeenCalledTimes(textBefore + 1);
    expect(card.cards.map((item: { status: string }) => item.status)).toEqual([
      'applied',
      'applied',
      'applied',
    ]);
    const draft = (await findWorkspaceDraft(db, projectId, ws))!;
    expect(draft.workspace_state!.authoringLedger).toEqual(before.workspace_state!.authoringLedger);
    const schema = (await resolveWorkspaceYSchema(draft.workspace_state!, db, projectId)).schema!;
    expect(schema.nodes.product.children).toMatchObject({
      owner: {
        slots: { phone: { type: 'string', maxLength: 24 }, name: { type: 'string' } },
        requiredSlots: ['phone'],
      },
    });
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
    const added = await compileConfirmedSchemaChange(base, {
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
    await expect(compileConfirmedSchemaChange(base, { ...slot, name: 'title' })).rejects.toThrow(
      'exists'
    );
    await expect(
      compileConfirmedSchemaChange(base, {
        ...slot,
        definition: { type: 'string', minLength: 10, maxLength: 1 },
      })
    ).rejects.toThrow();
    await expect(
      compileConfirmedSchemaChange(added.schema, {
        ...slot,
        action: 'add_node',
        nodePath: 'experiments',
        definition: { slots: {} },
      })
    ).rejects.toThrow('cannot own');
  });
});
