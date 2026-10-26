import { describe, expect, it } from 'vitest';
import {
  addSchemaField,
  changeSchemaField,
  moveSchemaField,
  schemaFieldRows,
} from '@/domain/schemas/schemaFieldEditing';

const schema = {
  yschema: '0.1',
  name: 'checklist',
  strict: true,
  nodes: {
    checklist: {
      slots: { title: { type: 'string', maxLength: 100 } },
      requiredSlots: ['title'],
      children: {
        items: {
          repeated: true,
          slots: { task: { type: 'string' }, done: { type: 'boolean', default: false } },
        },
      },
    },
  },
};
describe('Schema field edits', () => {
  it('moves an entire node subtree between parents and back to the root', () => {
    const source = { ...schema, nodes: { ...schema.nodes, destination: { slots: {} } } };
    const rows = schemaFieldRows(source);
    const original = rows.find((row) => row.semanticPath === 'checklist')!;
    const target = rows.find((row) => row.name === 'destination')!;
    const moved = moveSchemaField(source, original, target);
    expect(moved).not.toHaveProperty('nodes.checklist');
    expect(moved).toHaveProperty('nodes.destination.children.checklist', schema.nodes.checklist);
    const restored = moveSchemaField(
      moved,
      schemaFieldRows(moved).find((row) => row.semanticPath === 'destination/checklist')!,
      null
    );
    expect(restored).toHaveProperty('nodes.checklist', schema.nodes.checklist);
    expect(source.nodes.checklist).toEqual(schema.nodes.checklist);
  });
  it('moves an object field with its complete definition and required status', () => {
    const object = {
      type: 'object',
      properties: { owner: { type: 'string' } },
      required: ['owner'],
      additionalProperties: false,
    };
    const source = {
      nodes: { a: { slots: { config: object }, requiredSlots: ['config'] }, b: { slots: {} } },
    };
    const rows = schemaFieldRows(source);
    const moved = moveSchemaField(
      source,
      rows.find((row) => row.name === 'config')!,
      rows.find((row) => row.name === 'b')!
    );
    expect(moved).toHaveProperty('nodes.b.slots.config', object);
    expect(moved).toHaveProperty('nodes.b.requiredSlots', ['config']);
    expect(moved).not.toHaveProperty('nodes.a.requiredSlots');
    expect(moved).not.toHaveProperty('nodes.a.slots.config');
    expect(source.nodes.a.slots.config).toEqual(object);
  });
  it('rejects cyclic, repeated, unrestricted, conflicting and referenced node destinations atomically', () => {
    const source = {
      ...schema,
      nodes: {
        ...schema.nodes,
        open: { children: 'any' },
        duplicate: { children: { checklist: { slots: {} } } },
      },
    };
    const rows = schemaFieldRows(source);
    const root = rows.find((row) => row.name === 'checklist')!;
    expect(() => moveSchemaField(source, root, root)).toThrow('itself');
    expect(() => moveSchemaField(source, root, rows.find((row) => row.name === 'items')!)).toThrow(
      'descendants'
    );
    expect(() =>
      moveSchemaField(
        source,
        rows.find((row) => row.name === 'open')!,
        rows.find((row) => row.name === 'items')!
      )
    ).toThrow('repeated');
    expect(() => moveSchemaField(source, root, rows.find((row) => row.name === 'open')!)).toThrow(
      'unrestricted'
    );
    expect(() =>
      moveSchemaField(source, root, rows.find((row) => row.name === 'duplicate')!)
    ).toThrow('already has');
    const linked = {
      ...source,
      relationTypes: { link: { from: 'checklist/items', to: 'duplicate' } },
    };
    expect(() => moveSchemaField(linked, rows.find((row) => row.name === 'items')!, null)).toThrow(
      'referenced'
    );
    expect(source.nodes.checklist).toEqual(schema.nodes.checklist);
  });
  it('renames and removes required fields atomically without losing nested or advanced definitions', () => {
    const row = schemaFieldRows(schema).find((item) => item.semanticPath === 'checklist/title')!;
    const renamed = changeSchemaField(schema, row, 'heading', row.definition);
    expect(renamed).toEqual({
      ...schema,
      nodes: {
        checklist: {
          ...schema.nodes.checklist,
          slots: { heading: { type: 'string', maxLength: 100 } },
          requiredSlots: ['heading'],
        },
      },
    });
    const removed = changeSchemaField(
      renamed,
      schemaFieldRows(renamed).find((item) => item.name === 'heading')!,
      'heading',
      undefined
    );
    expect(removed).not.toHaveProperty('nodes.checklist.requiredSlots');
    expect(removed).toHaveProperty('nodes.checklist.children', schema.nodes.checklist.children);
    expect(schema.nodes.checklist.requiredSlots).toEqual(['title']);
  });
  it('keeps node and field paths distinct even when names match', () => {
    const rows = schemaFieldRows({
      nodes: { a: { slots: { b: {} }, children: { b: { slots: {} } } } },
    });
    expect(new Set(rows.map((row) => row.path)).size).toBe(3);
  });
  it('refuses duplicates and referenced node removal without modifying the original', () => {
    const rows = schemaFieldRows(schema);
    const done = rows.find((row) => row.name === 'done')!;
    expect(() => changeSchemaField(schema, done, 'task', done.definition)).toThrow(
      'already in use'
    );
    const linked = {
      ...schema,
      relationTypes: { belongs_to: { from: 'checklist/items', to: 'checklist' } },
    };
    expect(() => changeSchemaField(linked, rows[0]!, 'checklist', undefined)).toThrow('referenced');
  });
  it('adds nested fields with unique names and disallows child definitions under repeated nodes', () => {
    const items = schemaFieldRows(schema).find((row) => row.name === 'items')!;
    const added = addSchemaField(schema, items, 'slot');
    expect(added.definition).toHaveProperty(
      'nodes.checklist.children.items.slots.new_field.type',
      'string'
    );
    expect(() => addSchemaField(schema, items, 'node')).toThrow('repeated');
  });
});
