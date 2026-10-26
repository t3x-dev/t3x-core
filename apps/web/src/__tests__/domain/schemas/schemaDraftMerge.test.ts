import { expect, it } from 'vitest';
import { mergeSchemaDraft } from '@/domain/schemas/schemaDraftMerge';
import {
  addSchemaRelation,
  moveSchemaField,
  schemaFieldRows,
} from '@/domain/schemas/schemaFieldEditing';

it('preserves local additions when sources add nodes and adopts the new root metadata', () => {
  const base = {
    name: 'old',
    strict: false,
    nodes: { tasks: { slots: { title: { type: 'string' } } } },
  };
  const current = structuredClone(base);
  Object.assign(current.nodes.tasks.slots, { due_date: { type: 'string' } });
  const incoming = {
    ...base,
    name: 'new',
    strict: true,
    nodes: { ...base.nodes, owner: { slots: {} } },
  };
  const merged = mergeSchemaDraft(base, current, incoming);
  expect(merged.conflicts).toEqual([]);
  expect(merged.definition).toMatchObject({
    name: 'new',
    strict: true,
    nodes: { tasks: { slots: { due_date: {} } }, owner: {} },
  });
});
it('requires an explicit choice for deletion versus a local change, preserving unrelated edits', () => {
  const base = { nodes: { tasks: { slots: { title: { type: 'string' } } }, owner: {} } };
  const current = { nodes: { tasks: { slots: { title: { type: 'number' } } }, owner: {} } };
  const incoming = { nodes: { owner: {} } };
  expect(mergeSchemaDraft(base, current, incoming).conflicts).toEqual([
    { path: 'nodes/tasks', current: current.nodes.tasks, incoming: undefined },
  ]);
  expect(
    mergeSchemaDraft(base, current, incoming, { 'nodes/tasks': 'current' }).definition
  ).toEqual(current);
  expect(
    mergeSchemaDraft(base, current, incoming, { 'nodes/tasks': 'incoming' }).definition
  ).toEqual(incoming);
});
it('moves required fields atomically and refuses duplicate destinations and references', () => {
  const schema = {
    nodes: {
      a: { requiredSlots: ['title'], slots: { title: { type: 'string', default: 'keep' } } },
      b: { slots: {} },
    },
  };
  const rows = schemaFieldRows(schema),
    field = rows[1]!,
    target = rows[2]!;
  const moved = moveSchemaField(schema, field, target);
  expect(moved).not.toHaveProperty('nodes.a.requiredSlots');
  expect(moved).toHaveProperty('nodes.b.requiredSlots', ['title']);
  expect(moved).toHaveProperty('nodes.b.slots.title', { type: 'string', default: 'keep' });
  expect(schema.nodes.a.slots.title).toBeDefined();
  expect(() =>
    moveSchemaField({ ...schema, rules: [{ id: 'ref', from: 'a/title' }] }, field, target)
  ).toThrow('referenced');
  expect(() =>
    moveSchemaField({ nodes: { ...schema.nodes, b: { slots: { title: {} } } } }, field, target)
  ).toThrow('already');
});
it('creates a relationship definition with repeated-node endpoint patterns', () => {
  const schema = { nodes: { tasks: { repeated: true, slots: {} }, owner: { slots: {} } } };
  const rows = schemaFieldRows(schema);
  expect(addSchemaRelation(schema, rows[0]!, rows[1]!)).toHaveProperty('relationTypes.relates_to', {
    from: 'tasks/*',
    to: 'owner',
  });
});
