import type { AssistantSchemaSettingsInput } from '@t3x-dev/api-client';
import { currentComposition } from '@t3x-dev/application';
import { applyWorkspaceSchemaYOps } from '@t3x-dev/core';
import {
  type AnyDB,
  findWorkspaceDraft,
  insertBranch,
  insertConversation,
  insertProject,
  insertTurn,
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
      schemaBindings: [{ canonicalName: base.name, version: base.version, mode: 'pinned' }],
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

describe('Assistant Schema settings using Studio', () => {
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
