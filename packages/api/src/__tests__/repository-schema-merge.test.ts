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

  it('resolves only exact conflicting paths, including custom scalars, deletion and invalid definitions', () => {
    const source = withSlots({ title: { type: 'string', maxLength: 30 } });
    const target = withSlots({ title: { type: 'string', maxLength: 40 } });
    const path = 'nodes/requirements/slots/title/maxLength';
    for (const [choice, expected] of [
      ['source', 30],
      ['target', 40],
      [{ value: 20 }, 20],
    ] as const) {
      const result = mergeSchemaDefinitions(base, source, target, { [path]: choice });
      expect(result.unresolved).toEqual([]);
      expect(result.definition?.nodes.requirements?.slots.title?.maxLength).toBe(expected);
    }
    expect(
      mergeSchemaDefinitions(base, source, target, { [path]: { remove: true } }).definition?.nodes
        .requirements?.slots.title?.maxLength
    ).toBeUndefined();
    expect(
      mergeSchemaDefinitions(base, source, target, { [path]: { value: 'wrong' } })
    ).toMatchObject({ definition: null, definitionError: expect.any(String) });
    expect(() =>
      mergeSchemaDefinitions(base, source, target, { 'nodes/unknown': 'source' })
    ).toThrow(/stale Schema conflict/);
    const deleted = normalizeYSchemaObject({ ...base, nodes: {} });
    expect(
      mergeSchemaDefinitions(base, deleted, source, { 'nodes/requirements': 'source' }).definition
        ?.nodes
    ).toEqual({});
    expect(
      mergeSchemaDefinitions(base, deleted, source, { 'nodes/requirements': 'target' }).definition
        ?.nodes.requirements?.slots.title?.maxLength
    ).toBe(30);
  });
});
