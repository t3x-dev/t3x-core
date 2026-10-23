import { describe, expect, it } from 'vitest';
import {
  addSchemaField,
  changeSchemaField,
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
