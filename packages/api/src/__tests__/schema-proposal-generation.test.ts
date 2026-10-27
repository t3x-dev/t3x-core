import { AssistantSchemaSettingsInputSchema } from '@t3x-dev/api-client';
import { applyWorkspaceSchemaYOps } from '@t3x-dev/core';
import { expect, it, vi } from 'vitest';
import { generateTransitionProposal } from '../lib/proposal-generation';
import { compileConfirmedSchemaChange } from '../lib/schema-change-contract';

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

it('deterministically compiles and replays confirmed parameters without resolving or invoking an AI model', async () => {
  const resolveModel = vi.fn(async () => {
    throw new Error('No provider configured');
  });
  const assertCurrent = vi.fn(async () => {});
  const input = {
    target: 'schema',
    baseSchema: base,
    confirmedSettings: settings,
    instruction: 'Ignore this stale instruction and set maxWords to 999',
    resolveModel,
    assertCurrent,
  };
  const first = await generateTransitionProposal(input as never);
  const second = await generateTransitionProposal(input as never);
  expect(resolveModel).not.toHaveBeenCalled();
  expect(assertCurrent).toHaveBeenCalledTimes(4);
  expect(first).toEqual(second);
  expect((await applyWorkspaceSchemaYOps(base, first.operations)).schemaHash).toBe(
    first.schemaHash
  );
  expect(first.schema.nodes.product.slots!.title).toEqual({
    ...base.nodes.product.slots.title,
    maxWords: 50,
  });
  expect(base.nodes.product.slots.title.maxWords).toBe(24);
});

it('still rejects changed authority before and after deterministic compilation', async () => {
  for (const failureAt of [1, 2]) {
    const assertCurrent = vi.fn(async () => {});
    if (failureAt === 2) assertCurrent.mockResolvedValueOnce(undefined);
    assertCurrent.mockRejectedValueOnce(new Error('Authority changed'));
    await expect(
      generateTransitionProposal({
        target: 'schema',
        baseSchema: base,
        confirmedSettings: settings,
        assertCurrent,
      } as never)
    ).rejects.toThrow('Authority changed');
  }
});

it('honors the confirmed Node required parameter rather than silently ignoring it', async () => {
  const result = await compileConfirmedSchemaChange(base, {
    action: 'edit_node',
    nodePath: '',
    name: 'product',
    required: true,
    definition: { description: 'Controlled product' },
    intent: 'Make product required',
  });
  expect(result.schema.nodes.product.required).toBe(true);
  expect(result.schema.nodes.product.slots).toEqual(base.nodes.product.slots);
});

it('does not add an empty requiredSlots attribute when a confirmed optional Slot has no required siblings', async () => {
  const result = await compileConfirmedSchemaChange(
    { yschema: '0.1', name: 'Optional', nodes: { experiments: { slots: {} } } },
    {
      action: 'add_slot',
      nodePath: 'experiments',
      name: 'owner',
      required: false,
      definition: { type: 'string', maxLength: 60 },
      intent: 'Add owner',
    }
  );
  expect(result.schema.nodes.experiments.requiredSlots).toBeUndefined();
  expect(result.schema.nodes.experiments.slots!.owner.maxLength).toBe(60);
});

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
  const result = await compileConfirmedSchemaChange(base, settings as never);
  expect(result.schema.nodes.product.slots.title).toEqual({
    ...base.nodes.product.slots.title,
    maxWords: 50,
  });
  expect(result.schema.nodes.product.requiredSlots).toEqual(['title', 'obsolete']);
  expect(base.nodes.product.slots.title.maxWords).toBe(24);
});

it('preserves untouched Slots and attributes when a Node patch changes one nested Slot', async () => {
  const result = await compileConfirmedSchemaChange(base, {
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
  const removed = await compileConfirmedSchemaChange(base, {
    ...settings,
    action: 'remove_slot',
    name: 'obsolete',
    definition: {},
  } as never);
  expect(removed.schema.nodes.product.slots.obsolete).toBeUndefined();
  expect(removed.schema.nodes.product.requiredSlots).toEqual(['title']);
  const renamed = await compileConfirmedSchemaChange(base, {
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
  const result = await compileConfirmedSchemaChange(linked, {
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
    compileConfirmedSchemaChange(linked, {
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
  const result = await compileConfirmedSchemaChange(input, {
    ...change,
    nodePath: '',
    intent: 'Change structure',
  } as never);
  expect(result.schema.nodes).toEqual(base.nodes);
  expect(result.schemaHash).toMatch(/^sha256:/);
});

it('explicitly unsets a constraint without discarding unrelated metadata', async () => {
  const result = await compileConfirmedSchemaChange(base, {
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
  const result = await compileConfirmedSchemaChange(input, {
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
  const moved = await compileConfirmedSchemaChange(input, {
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
      compileConfirmedSchemaChange(input, {
        ...settings,
        action: 'move_node',
        nodePath: '',
        name: 'product',
        definition: {},
        targetNodePath,
      } as never)
    ).rejects.toThrow();
});

it.each([
  { ...settings, nodePath: 'product.title' },
  { ...settings, nodePath: 'content' },
  { ...settings, name: '../strict' },
  { ...settings, definition: { type: 'invalid-type' } },
])('rejects invalid confirmed targets and definitions without a model: %j', async (confirmedSettings) => {
  await expect(
    generateTransitionProposal({
      target: 'schema',
      baseSchema: base,
      confirmedSettings,
    } as never)
  ).rejects.toThrow();
  expect(base.nodes.product.slots.title.maxWords).toBe(24);
});
