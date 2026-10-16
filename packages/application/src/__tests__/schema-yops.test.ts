import { describe, expect, it } from 'vitest';
import {
  applyWorkspaceSchemaYOps,
  compileWorkspaceSchemaEditCommand,
  executeWorkspaceSchemaEditCommand,
  type WorkspaceSchemaYOpsError,
} from '../schema-authoring';

function baseSchema() {
  return {
    yschema: '0.1',
    name: 'studio:test',
    strict: false,
    nodes: {
      product: {
        required: true,
        slots: { title: { type: 'string', minLength: 1 } },
        requiredSlots: ['title'],
      },
      requirements: {
        required: true,
        repeated: true,
        slots: { title: { type: 'string', minLength: 1 } },
        requiredSlots: ['title'],
      },
    },
    relationTypes: {
      depends_on: { from: 'requirements/*', to: 'requirements/*', acyclic: true },
    },
    rules: [
      {
        id: 'require_dependency',
        kind: 'required_relation',
        relationType: 'depends_on',
        from: 'requirements/*',
        to: 'requirements/*',
      },
    ],
  } as const;
}

describe('Schema YOps semantic commands', () => {
  it('adds a node deterministically and produces the same hash for the same input', async () => {
    const base = baseSchema();
    const command = {
      kind: 'put_node',
      nodePath: 'advantage',
      definition: {
        required: false,
        slots: { title: { type: 'string' as const, minLength: 1 } },
        requiredSlots: ['title'],
      },
    } as const;

    const first = await executeWorkspaceSchemaEditCommand(base, command);
    const second = await executeWorkspaceSchemaEditCommand(base, command);

    expect(first.schema.nodes.advantage).toEqual(command.definition);
    expect(first.operations).toEqual([
      { assert: { path: 'nodes/advantage', exists: false } },
      { set: { path: 'nodes/advantage', value: command.definition } },
    ]);
    expect(first.schemaHash).toBe(second.schemaHash);
    expect(first.operations).toEqual(second.operations);
    expect(base.nodes).not.toHaveProperty('advantage');
  });

  it('edits Slots, relation types, and Rules through semantic commands', async () => {
    const withSlot = await executeWorkspaceSchemaEditCommand(baseSchema(), {
      kind: 'put_slot',
      nodePath: 'product',
      slot: 'problem',
      definition: { type: 'string', minLength: 1 },
      required: true,
    });
    expect(withSlot.schema.nodes.product.slots?.problem).toEqual({
      type: 'string',
      minLength: 1,
    });
    expect(withSlot.schema.nodes.product.requiredSlots).toEqual(['title', 'problem']);

    const withRelation = await executeWorkspaceSchemaEditCommand(withSlot.schema, {
      kind: 'put_relation_type',
      relationType: 'supports',
      definition: { from: 'requirements/*', to: 'requirements/*' },
    });
    const withRule = await executeWorkspaceSchemaEditCommand(withRelation.schema, {
      kind: 'put_rule',
      rule: {
        id: 'require_support',
        kind: 'required_relation',
        relationType: 'supports',
        from: 'requirements/*',
        to: 'requirements/*',
      },
    });
    expect(withRule.schema.relationTypes?.supports).toEqual({
      from: 'requirements/*',
      to: 'requirements/*',
    });
    expect(withRule.schema.rules?.at(-1)?.id).toBe('require_support');
  });

  it('rejects raw operations outside the local Schema editing boundary', async () => {
    await expect(
      applyWorkspaceSchemaYOps(baseSchema(), [{ set: { path: 'name', value: 'escaped' } }])
    ).rejects.toMatchObject<Partial<WorkspaceSchemaYOpsError>>({
      code: 'PATH_OUT_OF_BOUNDS',
      operationIndex: 0,
    });
  });

  it('normalizes the complete result and rejects dangling relation rules', async () => {
    const operations = compileWorkspaceSchemaEditCommand(baseSchema(), {
      kind: 'remove_relation_type',
      relationType: 'depends_on',
    });
    await expect(applyWorkspaceSchemaYOps(baseSchema(), operations)).rejects.toMatchObject<
      Partial<WorkspaceSchemaYOpsError>
    >({ code: 'INVALID_RESULT' });
  });

  it('does not expose partial writes when a later assertion fails', async () => {
    const base = baseSchema();
    await expect(
      applyWorkspaceSchemaYOps(base, [
        { set: { path: 'nodes/advantage', value: { required: false } } },
        { assert: { path: 'nodes/product', exists: false } },
      ])
    ).rejects.toMatchObject<Partial<WorkspaceSchemaYOpsError>>({ code: 'APPLY_FAILED' });
    expect(base.nodes).not.toHaveProperty('advantage');
  });
});
