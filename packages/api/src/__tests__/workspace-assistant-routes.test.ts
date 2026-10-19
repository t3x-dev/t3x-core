import {
  createMaterial,
  findTurnsByConversation,
  insertBranch,
  insertConversation,
  insertProject,
  insertTurn,
  upsertWorkspaceDraft,
} from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createInferenceRuntime,
  createInferenceRuntimeMiddleware,
  type InferenceAdmissionPolicy,
} from '../lib/inference';
import {
  createGenerationModelCatalogSnapshot,
  GENERATION_MODEL_SPECIFICATION_VERSION,
  GENERATION_PROVIDER_RUNTIME_VERSION,
  type GenerationModel,
  type GenerationProviderRuntime,
} from '../lib/model-runtime-contract';
import { resolveProviderAndModel } from '../lib/provider-resolver';
import { createGenerationProviderRuntimeMiddleware } from '../lib/provider-runtime';
import { createAssistantCapabilities } from '../lib/workspace-assistant/capabilities';
import {
  assertAssistantContextCurrent,
  prepareAssistantContext,
} from '../lib/workspace-assistant/context';
import {
  initializeWorkspaceAuthoring,
  publishWorkspaceAuthoringAction,
} from '../lib/workspace-authoring';
import { llmRoutes } from '../routes/llm.openapi';
import { workspaceAssistantRoutes } from '../routes/workspace-assistant.openapi';
import { setupTestDB } from './setup';

const runtime = vi.hoisted(() => ({ db: null as unknown, generate: vi.fn() }));
vi.mock('../lib/db', () => ({ getDB: async () => runtime.db }));
vi.mock('../lib/provider-resolver', () => ({
  resolveProviderAndModel: vi.fn(async () => ({
    ok: true,
    model: 'test',
    provider: { id: 'test', generate: runtime.generate },
  })),
}));

describe('Workspace Assistant streaming boundary', () => {
  let setup: Awaited<ReturnType<typeof setupTestDB>>;
  const actor = { kind: 'human' as const, id: 'human:local-user' };
  const app = new Hono().route('/', workspaceAssistantRoutes);
  beforeAll(async () => {
    setup = await setupTestDB();
    runtime.db = setup.db;
  });
  afterAll(async () => {
    await setup?.cleanup();
  });
  async function fixture(name: string) {
    const project = await insertProject(setup.db, { name });
    const projectId = project.projectId;
    await insertBranch(setup.db, { projectId, name: 'main' });
    await upsertWorkspaceDraft(setup.db, {
      project_id: projectId,
      workspace_id: 'ws',
      title: name,
      target_branch: 'main',
      workspace_state: { targetBranch: 'main' },
    });
    const initialized = await initializeWorkspaceAuthoring(setup.db, {
      projectId,
      workspaceId: 'ws',
      expectedWorkspaceRevision: 1,
      expectedRefHead: null,
      actionId: 'init',
      actor,
    });
    const conversation = await insertConversation(setup.db, { projectId, title: name });
    const user = await insertTurn(setup.db, {
      projectId,
      conversationId: conversation.conversationId,
      role: 'user',
      content: 'Explain the current Draft.',
    });
    const input = {
      projectId,
      workspaceId: 'ws',
      conversationId: conversation.conversationId,
      userTurnHash: user.turnHash,
      expectedWorkspaceRevision: initialized.draft.revision,
    };
    const body = {
      request_id: name,
      conversation_id: input.conversationId,
      user_turn_hash: user.turnHash,
      if_revision: initialized.draft.revision,
    };
    return {
      projectId,
      input,
      body,
      url: `/v1/projects/${projectId}/workspaces/ws/source-chat/assistant/stream`,
    };
  }
  const send = (url: string, body: unknown) =>
    app.request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  function managedApp(model: GenerationModel, denied = false) {
    const resolve = vi.fn<GenerationProviderRuntime['resolve']>(async () => ({ ok: true, model }));
    const providerRuntime: GenerationProviderRuntime = {
      contractVersion: GENERATION_PROVIDER_RUNTIME_VERSION,
      catalog: {
        snapshot: async () =>
          createGenerationModelCatalogSnapshot({
            revision: 'hosted-test',
            defaultModelId: 'balanced',
            models: [
              {
                id: 'balanced',
                label: 'Balanced',
                availability: 'available',
                capabilities: model.capabilities,
              },
            ],
          }),
      },
      resolve,
    };
    const authorize = vi.fn<InferenceAdmissionPolicy['authorize']>(async () =>
      denied
        ? { outcome: 'denied' as const, code: 'quota', reason: 'Quota exhausted' }
        : { outcome: 'admitted' as const, admission: { id: 'admission' } }
    );
    const settle = vi.fn<InferenceAdmissionPolicy['settle']>(async () => {});
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('userId', 'hosted-user');
      c.set('inferenceIngressChannel', 'web');
      await next();
    });
    app.use('*', createGenerationProviderRuntimeMiddleware(providerRuntime));
    app.use(
      '*',
      createInferenceRuntimeMiddleware(
        createInferenceRuntime({
          admissionPolicy: { authorize, settle, release: async () => {} },
        })
      )
    );
    app.route('/', llmRoutes);
    app.route('/', workspaceAssistantRoutes);
    return { app, resolve, authorize, settle };
  }

  it.each([
    'generate',
    'stream',
    'tools',
  ])('invokes a discovered managed model through %s without local provider resolution', async (mode) => {
    const f = await fixture(`managed-${mode}`);
    vi.mocked(resolveProviderAndModel).mockClear();
    const evidence = {
      provider: 'hosted-gateway',
      model: 'upstream-model',
      providerRequestId: 'upstream-request',
      usage: { inputTokens: 7, outputTokens: 3 },
      finishReason: 'stop' as const,
    };
    const generate = vi.fn<GenerationModel['generate']>(async () => ({
      output: [{ type: 'text' as const, text: 'Managed reply.' }],
      evidence,
    }));
    if (mode === 'tools')
      generate.mockResolvedValueOnce({
        output: [{ type: 'tool_call', id: 'read-1', name: 'readStructure', input: { path: '' } }],
        evidence: { ...evidence, finishReason: 'tool_call' },
      });
    const stream = vi.fn<NonNullable<GenerationModel['stream']>>(async () => ({
      chunks: (async function* () {
        yield { type: 'text_delta' as const, delta: 'Managed ' };
        yield { type: 'text_delta' as const, delta: 'reply.' };
      })(),
      terminal: Promise.resolve({ kind: 'completed' as const, evidence }),
    }));
    const hosted = managedApp({
      specificationVersion: GENERATION_MODEL_SPECIFICATION_VERSION,
      provider: 'managed-service',
      modelId: 'balanced',
      capabilities:
        mode === 'tools'
          ? ['text', 'tool_use']
          : mode === 'stream'
            ? ['text', 'streaming']
            : ['text'],
      generate,
      ...(mode === 'stream' ? { stream } : {}),
    });
    const catalog = await hosted.app.request('/v1/llm/models').then((r) => r.json());
    const selected = catalog.data.providers[0];
    expect(selected.name).toBe('managed');
    const response = await hosted.app.request(f.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...f.body, provider: selected.name, model: selected.models[0].id }),
    });
    expect(response.status).toBe(200);
    const events = (await response.text())
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => JSON.parse(line.slice(6)));
    expect(events.at(-1)).toMatchObject({
      type: 'done',
      content: 'Managed reply.',
      reason: 'completed',
    });
    expect(events.at(-1).turnHash).toBeTruthy();
    expect(resolveProviderAndModel).not.toHaveBeenCalled();
    expect(hosted.resolve).toHaveBeenCalledWith({
      requestedModel: 'balanced',
      requiredCapabilities: ['text'],
      scope: expect.objectContaining({
        actor: { kind: 'user', id: 'hosted-user' },
        ingressChannel: 'web',
        projectId: f.projectId,
        conversationId: f.input.conversationId,
      }),
    });
    const calls = mode === 'stream' ? stream.mock.calls : generate.mock.calls;
    expect(hosted.authorize).toHaveBeenCalledTimes(mode === 'tools' ? 2 : 1);
    expect(hosted.settle).toHaveBeenCalledTimes(calls.length);
    for (let index = 0; index < calls.length; index++) {
      const invocation = calls[index][0];
      expect(invocation).toMatchObject({
        generationId: hosted.authorize.mock.calls[index][0].generationId,
        attemptIndex: index,
        feature: 'workspace.assistant.chat',
      });
      expect(hosted.settle.mock.calls[index][0].terminal.receipt).toMatchObject({
        resolvedProvider: evidence.provider,
        resolvedModel: evidence.model,
        usage: evidence.usage,
        providerRequestId: evidence.providerRequestId,
      });
    }
    if (mode === 'tools') {
      expect(generate.mock.calls[1][0].request.messages).toContainEqual({
        role: 'tool',
        content: [
          expect.objectContaining({ type: 'tool_result', id: 'read-1', name: 'readStructure' }),
        ],
      });
      expect(generate.mock.calls[0][0].generationId).not.toBe(
        generate.mock.calls[1][0].generationId
      );
    }
    const turns = await findTurnsByConversation(setup.db, {
      conversationId: f.input.conversationId,
      order: 'asc',
    });
    expect(turns.filter((turn) => turn.role === 'assistant')).toHaveLength(1);
  });

  it('does not fall back to local credentials on managed resolution or admission failure', async () => {
    const f = await fixture('managed-denied');
    const generate = vi.fn();
    const hosted = managedApp(
      {
        specificationVersion: GENERATION_MODEL_SPECIFICATION_VERSION,
        provider: 'hosted',
        modelId: 'balanced',
        capabilities: ['text'],
        generate,
      },
      true
    );
    vi.mocked(resolveProviderAndModel).mockClear();
    const request = () =>
      hosted.app.request(f.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...f.body, provider: 'managed', model: 'balanced' }),
      });
    const denied = await request();
    expect(await denied.text()).toContain('Quota exhausted');
    hosted.resolve.mockResolvedValueOnce({
      ok: false,
      code: 'unavailable',
      message: 'Managed model unavailable',
    });
    expect((await request()).status).toBe(400);
    expect(generate).not.toHaveBeenCalled();
    expect(resolveProviderAndModel).not.toHaveBeenCalled();
    expect(hosted.settle).not.toHaveBeenCalled();
  });
  it('streams context and model output, persists exactly one assistant turn before done, and leaves Draft unchanged', async () => {
    const f = await fixture('stream');
    runtime.generate.mockResolvedValue({
      text: 'No saved changes yet.',
      usage: { inputTokens: 5, outputTokens: 3 },
    });
    const response = await send(f.url, f.body);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const events = (await response.text())
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => JSON.parse(line.slice(6)));
    expect(events.map((event) => event.type)).toEqual(['context', 'capabilities', 'text', 'done']);
    expect(events.at(-1).turnHash).toBeTruthy();
    const turns = await findTurnsByConversation(setup.db, {
      conversationId: f.input.conversationId,
      order: 'asc',
    });
    expect(turns.filter((turn) => turn.role === 'assistant')).toHaveLength(1);
    expect(JSON.parse(turns.at(-1)?.ringsJson ?? '{}')).toMatchObject({
      workspace_assistant: { requestId: 'stream' },
    });
    expect(events[0].compositionRevision).toBe(0);
  });
  it('executes only the exact user-supplied edit, refuses model-invented operations, and recovers its publication', async () => {
    const f = await fixture('exact-edit');
    const prepared = await prepareAssistantContext(setup.db, f.input, async () => {});
    const capabilities = createAssistantCapabilities({
      db: setup.db,
      prepared,
      actor,
      authorize: async () => {},
      inference: {
        runtime: createInferenceRuntime(),
        runId: 'exact',
        scope: { projectId: f.projectId, actor: { kind: 'user', id: 'local-user' } },
      },
      exactEdit: { operations: [{ set: { path: 'allocation', value: 25 } }] },
    });
    await expect(
      capabilities.applyUserEdit.execute(
        { operations: [{ set: { path: 'allocation', value: 999 } }] },
        'forged'
      )
    ).rejects.toThrow();
    const operationId = `assistant:${'a'.repeat(64)}`;
    const result = await capabilities.applyUserEdit.execute({}, operationId);
    expect(result).toMatchObject({ status: 'published', compositionRevision: 1 });
    const recovered = await app.request(
      `/v1/projects/${f.projectId}/workspaces/ws/source-chat/assistant/operations/${operationId}`
    );
    expect((await recovered.json()).data).toMatchObject({
      status: 'published',
      actionId: operationId,
    });
  });
  it('rejects malformed requests and foreign source threads before invoking a provider', async () => {
    const f = await fixture('boundary'),
      other = await fixture('other');
    runtime.generate.mockClear();
    expect((await send(f.url, { ...f.body, if_revision: -1 })).status).toBe(400);
    expect(
      (await send(f.url, { ...f.body, conversation_id: other.input.conversationId })).status
    ).toBe(404);
    expect(runtime.generate).not.toHaveBeenCalled();
  });
  it('fails closed for revoked access, foreign documents, and stale continuation revisions', async () => {
    const f = await fixture('pinned'),
      other = await fixture('foreign');
    const authorize = vi.fn(async () => {});
    const prepared = await prepareAssistantContext(setup.db, f.input, authorize);
    const material = await createMaterial(setup.db, {
      project_id: other.projectId,
      source_type: 'document',
      title: 'Private',
      content_text: 'Foreign secret',
      content_hash: 'test:foreign',
    });
    await expect(
      prepareAssistantContext(setup.db, { ...f.input, sourceMaterialIds: [material.id] }, authorize)
    ).rejects.toThrow();
    await expect(
      assertAssistantContextCurrent(setup.db, prepared, async () => {
        throw new Error('Access revoked');
      })
    ).rejects.toThrow('Access revoked');
    await publishWorkspaceAuthoringAction(setup.db, {
      projectId: f.projectId,
      workspaceId: 'ws',
      actionId: 'external',
      actor,
      channel: 'mcp',
      operations: [{ set: { path: 'x', value: 1 } }],
      expectedRevision: 0,
      expectedWorkspaceRevision: prepared.workspaceRevision,
      expectedRefHead: null,
    });
    await expect(assertAssistantContextCurrent(setup.db, prepared, authorize)).rejects.toThrow();
  });
});
