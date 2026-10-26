import { expect, it } from 'vitest';
import {
  importSchemaField,
  moveSchemaField,
  schemaFieldRows,
} from '@/domain/schemas/schemaFieldEditing';
import { pruneSchemaMappings, transferSchemaMappings } from '@/domain/schemas/schemaSourceMappings';

it('copies a source subtree intact, then moves its object without losing its source location', () => {
  const source = {
    nodes: {
      task: {
        slots: {
          owner: {
            type: 'object',
            properties: { name: { type: 'string' } },
            additionalProperties: false,
          },
        },
        requiredSlots: ['owner'],
        children: { step: { slots: {} } },
      },
    },
  };
  const draft = { nodes: { project: { slots: {} } } };
  const sourceRow = schemaFieldRows(source)[0]!,
    target = schemaFieldRows(draft)[0]!;
  const imported = importSchemaField(draft, source, sourceRow, target);
  const pin = { candidateId: 'task-source', schemaHash: `sha256:${'a'.repeat(64)}` };
  const mappings = transferSchemaMappings([], source, sourceRow, imported.location, pin);
  expect(mappings).toHaveLength(3);
  const owner = schemaFieldRows(imported.definition).find((row) => row.name === 'owner')!;
  const moved = moveSchemaField(imported.definition, owner, target);
  const remapped = transferSchemaMappings(mappings, imported.definition, owner, [
    'nodes',
    'project',
    'slots',
    'owner',
  ]);
  expect(remapped.find((entry) => entry.path.at(-1) === 'owner')).toEqual({
    path: ['nodes', 'project', 'slots', 'owner'],
    from: ['nodes', 'task', 'slots', 'owner'],
    source: pin,
  });
  expect(moved).toHaveProperty('nodes.project.requiredSlots', ['owner']);
  expect(moved).toHaveProperty('nodes.project.slots.owner', source.nodes.task.slots.owner);
  expect(source.nodes.task.requiredSlots).toEqual(['owner']);
  expect(draft).toEqual({ nodes: { project: { slots: {} } } });
  expect(pruneSchemaMappings(remapped, draft)).toEqual([]);
});

it('requires an explicit name for collisions and leaves both inputs untouched on failure', () => {
  const schema = { nodes: { project: { slots: {} }, task: { slots: {} } } };
  const row = schemaFieldRows(schema)[1]!;
  expect(() => importSchemaField(schema, schema, row, null)).toThrow('already has');
  expect(importSchemaField(schema, schema, row, null, 'task_copy').definition).toHaveProperty(
    'nodes.task_copy'
  );
  expect(schema).not.toHaveProperty('nodes.task_copy');
});
