import { normalizeYSchemaObject } from '@t3x-dev/yschema';
import { describe, expect, it } from 'vitest';
import { mergeSchemaDefinitions } from '../lib/repository-schema-merge';

const base = normalizeYSchemaObject({
  yschema: '0.1',
  name: 'Merge test',
  strict: true,
  nodes: { requirements: { slots: { title: { type: 'string' } } } },
});
const withSlots = (slots: Record<string, unknown>) =>
  normalizeYSchemaObject({
    ...base,
    nodes: {
      requirements: {
        ...base.nodes.requirements,
        slots: { ...base.nodes.requirements!.slots, ...slots },
      },
    },
  });

describe('deterministic Schema three-way merge', () => {
  it('keeps independent owner and advantage definitions without changing its inputs', () => {
    const source = withSlots({ owner: { type: 'string' } });
    const target = withSlots({ advantage: { type: 'string' } });
    const saved = structuredClone([base, source, target]);
    expect(mergeSchemaDefinitions(base, source, target)).toMatchObject({
      conflicts: [],
      definition: {
        nodes: {
          requirements: {
            slots: {
              title: { type: 'string' },
              owner: { type: 'string' },
              advantage: { type: 'string' },
            },
          },
        },
      },
    });
    expect([base, source, target]).toEqual(saved);
  });

  it('merges different properties of one existing Slot and preserves false and zero', () => {
    const before = withSlots({
      title: { type: 'string', maxLength: 24, provenanceRequired: true },
    });
    const source = withSlots({
      title: { type: 'string', maxLength: 80, provenanceRequired: true },
    });
    const target = withSlots({
      title: { type: 'string', maxLength: 24, provenanceRequired: false, minLength: 0 },
    });
    expect(mergeSchemaDefinitions(before, source, target)).toMatchObject({
      conflicts: [],
      definition: {
        nodes: {
          requirements: {
            slots: { title: { maxLength: 80, provenanceRequired: false, minLength: 0 } },
          },
        },
      },
    });
  });

  it('blocks contradictory constraints and delete-versus-edit rather than choosing a branch', () => {
    const source = withSlots({ title: { type: 'number' } });
    const target = withSlots({ title: { type: 'boolean' } });
    expect(mergeSchemaDefinitions(base, source, target)).toMatchObject({
      definition: null,
      conflicts: [expect.objectContaining({ path: 'nodes/requirements/slots/title/type' })],
    });
    const deleted = normalizeYSchemaObject({ ...base, nodes: {} });
    expect(mergeSchemaDefinitions(base, deleted, source)).toMatchObject({
      definition: null,
      conflicts: [expect.objectContaining({ path: 'nodes/requirements' })],
    });
  });

  it('treats enum arrays atomically and never weakens rules by unioning conflicting values', () => {
    const before = withSlots({ title: { type: 'string', enum: ['a', 'b'] } });
    const source = withSlots({ title: { type: 'string', enum: ['a'] } });
    const target = withSlots({ title: { type: 'string', enum: ['b'] } });
    expect(mergeSchemaDefinitions(before, source, target)).toMatchObject({
      definition: null,
      conflicts: [expect.objectContaining({ path: 'nodes/requirements/slots/title/enum' })],
    });
  });
});
