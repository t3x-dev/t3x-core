import { AssistantSchemaSettingsInputSchema } from '@t3x-dev/api-client';
import { compileWorkspaceSchemaDefinition } from '@t3x-dev/core';
import { expect, it, vi } from 'vitest';
import { createInferenceRuntime } from '../lib/inference';
import { GENERATION_MODEL_SPECIFICATION_VERSION } from '../lib/model-runtime-contract';
import { generateTransitionProposal } from '../lib/proposal-generation';
import { createWorkspaceSchemaProposalModel } from '../lib/workspace-assistant/adapters/generation-model';
import { applySchemaSettings } from '../lib/workspace-assistant/schema-settings';

const base = {
  yschema: '0.1',
  name: 'test/generic',
  strict: false,
  nodes: {
    product: {
      slots: {
        title: {
          type: 'string',
          maxWords: 24,
          provenanceRequired: true,
          gapQuestion: 'Which title?',
        },
        obsolete: { type: 'string' },
      },
      requiredSlots: ['title', 'obsolete'],
    },
  },
  relationTypes: {},
  rules: [],
};
const settings = {
  action: 'edit_slot',
  nodePath: 'product',
  name: 'title',
  definition: { maxWords: 50 },
  intent: 'Change title maxWords to 50',
};

it.each([
  ['edit_slot', { maxWords: 50 }],
  ['remove_slot', {}],
  ['rename_slot', {}],
  ['edit_node', { description: 'Updated product' }],
  ['remove_node', {}],
  ['rename_node', {}],
])('accepts a confirmable %s operation instead of restricting AI to additions', (action, definition) => {
  expect(
    AssistantSchemaSettingsInputSchema.safeParse({
      ...settings,
      action,
      definition,
      ...(action.startsWith('rename') ? { newName: 'overview' } : {}),
    }).success
  ).toBe(true);
});

it('edits one constraint without dropping advanced attributes or changing requiredness', async () => {
  const result = await applySchemaSettings(base, settings as never);
  expect(result.schema.nodes.product.slots.title).toEqual({
    ...base.nodes.product.slots.title,
    maxWords: 50,
  });
  expect(result.schema.nodes.product.requiredSlots).toEqual(['title', 'obsolete']);
  expect(base.nodes.product.slots.title.maxWords).toBe(24);
});

it('preserves untouched Slots and attributes when a Node patch changes one nested Slot', async () => {
  const result = await applySchemaSettings(base, {
    ...settings,
    action: 'edit_node',
    nodePath: '',
    name: 'product',
    definition: { slots: { title: { maxWords: 50 } } },
  } as never);
  expect(result.schema.nodes.product.slots.title).toEqual({
    ...base.nodes.product.slots.title,
    maxWords: 50,
  });
  expect(result.schema.nodes.product.slots.obsolete).toEqual(base.nodes.product.slots.obsolete);
  expect(result.schema.nodes.product.requiredSlots).toEqual(base.nodes.product.requiredSlots);
});

it('removes and renames required Slots without leaving invalid requiredSlots', async () => {
  const removed = await applySchemaSettings(base, {
    ...settings,
    action: 'remove_slot',
    name: 'obsolete',
    definition: {},
  } as never);
  expect(removed.schema.nodes.product.slots.obsolete).toBeUndefined();
  expect(removed.schema.nodes.product.requiredSlots).toEqual(['title']);
  const renamed = await applySchemaSettings(base, {
    ...settings,
    action: 'rename_slot',
    newName: 'headline',
    definition: {},
  } as never);
  expect(renamed.schema.nodes.product.slots.headline).toEqual(base.nodes.product.slots.title);
  expect(renamed.schema.nodes.product.requiredSlots).toContain('headline');
  expect(renamed.schema.nodes.product.requiredSlots).not.toContain('title');
});

it('renames a Node and rewrites its relationship and rule endpoints while preserving other attributes', async () => {
  const linked = {
    ...base,
    relationTypes: { links: { from: 'product', to: 'product' } },
    rules: [
      {
        id: 'connected',
        kind: 'required_relation',
        relationType: 'links',
        from: 'product',
        to: 'product',
      },
    ],
  };
  const result = await applySchemaSettings(linked, {
    ...settings,
    action: 'rename_node',
    nodePath: '',
    name: 'product',
    newName: 'overview',
    definition: {},
  } as never);
  expect(result.schema.nodes.overview).toEqual(base.nodes.product);
  expect(result.schema.relationTypes.links).toMatchObject({ from: 'overview', to: 'overview' });
  expect(result.schema.rules[0]).toMatchObject({ from: 'overview', to: 'overview' });
  await expect(
    applySchemaSettings(linked, {
      ...settings,
      action: 'remove_node',
      nodePath: '',
      name: 'product',
      definition: {},
    } as never)
  ).rejects.toThrow();
});

it.each([
  { action: 'add_relation', name: 'other', definition: { from: 'product', to: 'product' } },
  { action: 'edit_relation', name: 'links', definition: { description: 'Explicit link' } },
  { action: 'remove_relation', name: 'links', definition: {} },
  { action: 'add_rule', name: 'other', definition: { description: 'New rule' } },
  { action: 'edit_rule', name: 'connected', definition: { description: 'Updated rule' } },
  { action: 'remove_rule', name: 'connected', definition: {} },
])('supports the same confirmation contract for $action', async (change) => {
  const input = {
    ...base,
    relationTypes: { links: { from: 'product', to: 'product' } },
    rules: [{ id: 'connected', description: 'Keep or update' }],
  };
  const result = await applySchemaSettings(input, {
    ...change,
    nodePath: '',
    intent: 'Change structure',
  } as never);
  expect(result.schema.nodes).toEqual(base.nodes);
  expect(result.schemaHash).toMatch(/^sha256:/);
});

it('explicitly unsets a constraint without discarding unrelated metadata', async () => {
  const result = await applySchemaSettings(base, {
    ...settings,
    definition: {},
    unsetAttributes: ['maxWords'],
  } as never);
  expect(result.schema.nodes.product.slots.title).toEqual({
    type: 'string',
    provenanceRequired: true,
    gapQuestion: 'Which title?',
  });
});

it('moves a required Slot to another Node, preserving definition and requiredness', async () => {
  const input = { ...base, nodes: { ...base.nodes, target: { slots: {} } } };
  const result = await applySchemaSettings(input, {
    ...settings,
    action: 'move_slot',
    name: 'title',
    definition: {},
    targetNodePath: 'target',
  } as never);
  expect(result.schema.nodes.product.slots.title).toBeUndefined();
  expect(result.schema.nodes.product.requiredSlots).not.toContain('title');
  expect(result.schema.nodes.target.slots.title).toEqual(base.nodes.product.slots.title);
  expect(result.schema.nodes.target.requiredSlots).toContain('title');
});

it('moves a Node under a valid parent and rejects self-nesting, collisions and repeated parents', async () => {
  const input = {
    ...base,
    nodes: { ...base.nodes, target: { slots: {} }, list: { repeated: true, slots: {} } },
  };
  const moved = await applySchemaSettings(input, {
    ...settings,
    action: 'move_node',
    nodePath: '',
    name: 'product',
    definition: {},
    targetNodePath: 'target',
  } as never);
  expect(moved.schema.nodes.product).toBeUndefined();
  expect(moved.schema.nodes.target.children.product).toEqual(base.nodes.product);
  for (const targetNodePath of ['product', 'list'])
    await expect(
      applySchemaSettings(input, {
        ...settings,
        action: 'move_node',
        nodePath: '',
        name: 'product',
        definition: {},
        targetNodePath,
      } as never)
    ).rejects.toThrow();
});

async function generation(operations: unknown[]) {
  const model = {
    provider: 'test',
    model: 'schema-test',
    generate: vi.fn(async () => ({
      draft: { operations },
      usage: { inputTokens: 10, outputTokens: 10 },
    })),
  };
  const call = () =>
    generateTransitionProposal({
      target: 'schema',
      baseSchema: base,
      confirmedSettings: settings,
      instruction: settings.intent,
      resolveModel: async () => model,
      inference: {
        runtime: createInferenceRuntime(),
        runId: `schema-test-${crypto.randomUUID()}`,
        scope: { actor: { kind: 'local', id: 'test' }, ingressChannel: 'api', projectId: 'test' },
      },
    } as never);
  return { call, model };
}

it('calls the AI Schema branch with the original instruction and exact confirmed parameters, then trial-applies its YOps', async () => {
  const desired = structuredClone(base);
  desired.nodes.product.slots.title.maxWords = 50;
  const expected = await compileWorkspaceSchemaDefinition(base, desired);
  const { call, model } = await generation([...expected.operations]);
  const result = await call();
  expect(model.generate).toHaveBeenCalledOnce();
  expect(model.generate.mock.calls[0][0]).toMatchObject({
    instruction: settings.intent,
    baseSchema: base,
    confirmedSettings: settings,
  });
  expect(result).toMatchObject({
    kind: 'schema',
    schemaHash: expected.schemaHash,
    schema: expected.schema,
  });
});

it.each([
  [{ set: { path: 'strict', value: true } }],
  [{ set: { path: 'content/title', value: 'silently fill content' } }],
  [{ set: { path: 'nodes/product/slots/title/maxWords', value: 99 } }],
  [{ unset: { path: 'nodes/product/slots/obsolete' } }],
])('rejects AI operations outside the confirmed result, including content and protected roots: %j', async (...operations) => {
  const { call, model } = await generation(operations);
  await expect(call()).rejects.toThrow();
  expect(model.generate).toHaveBeenCalledOnce();
  expect(base.nodes.product.slots.title.maxWords).toBe(24);
});

it('uses the managed structured model with the admitted identity and rejects unmanaged invocation', async () => {
  const desired = structuredClone(base);
  desired.nodes.product.slots.title.maxWords = 50;
  const expected = await compileWorkspaceSchemaDefinition(base, desired);
  const generate = vi.fn(async () => ({
    output: [{ type: 'json' as const, value: { operations: expected.operations } }],
    evidence: {
      provider: 'managed',
      model: 'actual-schema-model',
      usage: { inputTokens: 12, outputTokens: 8 },
      finishReason: 'stop' as const,
    },
  }));
  const managed = createWorkspaceSchemaProposalModel({
    specificationVersion: GENERATION_MODEL_SPECIFICATION_VERSION,
    provider: 'managed',
    modelId: 'schema-model',
    capabilities: ['structured_output'],
    generate,
  });
  await expect(
    managed.generate({
      baseSchema: base,
      baseSchemaHash: 'exact',
      confirmedSettings: settings as never,
      instruction: settings.intent,
      prompt: 'Generate Schema only',
    })
  ).rejects.toThrow('generation_capability_unsupported');
  expect(generate).not.toHaveBeenCalled();
  const result = await generateTransitionProposal({
    target: 'schema',
    baseSchema: base,
    confirmedSettings: settings as never,
    instruction: settings.intent,
    resolveModel: async () => managed,
    inference: {
      runtime: createInferenceRuntime({ createGenerationId: () => 'schema-managed-admitted' }),
      runId: 'schema-managed-run',
      scope: { actor: { kind: 'user', id: 'u' }, projectId: 'p' },
    },
  });
  expect(result.schemaHash).toBe(expected.schemaHash);
  expect(generate).toHaveBeenCalledOnce();
  expect(generate.mock.calls[0][0]).toMatchObject({
    generationId: 'schema-managed-admitted',
    feature: 'transition.schema-proposal-generation',
    request: { output: { type: 'json', name: 'SchemaYOpsDraft' } },
  });
});
