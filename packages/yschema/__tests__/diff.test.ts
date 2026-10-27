import { describe, expect, it } from 'vitest';
import { diffYSchemas, normalizeYSchemaObject, sha256CompositionValue } from '../src';

describe('diffYSchemas', () => {
  const nodeSchema = (repeated: boolean | undefined, nested: boolean) => {
    const node = {
      slots: { title: { type: 'string' } },
      ...(repeated === undefined ? {} : { repeated }),
    };
    return normalizeYSchemaObject({
      yschema: '0.1',
      name: 'test',
      nodes: nested ? { group: { children: { item: node } } } : { item: node },
    });
  };

  describe.each([false, true])('Node repeated semantics (nested=%s)', (nested) => {
    it.each([
      [undefined, false],
      [false, undefined],
      [false, false],
      [undefined, undefined],
      [true, true],
    ] as const)('does not report equivalent repetition: %s → %s', (before, after) => {
      expect(diffYSchemas(nodeSchema(before, nested), nodeSchema(after, nested))).toEqual([]);
    });
    it.each([
      [undefined, true, 'ADD'],
      [false, true, 'CHANGE'],
      [true, false, 'CHANGE'],
      [true, undefined, 'REMOVE'],
    ] as const)('still reports a real repetition change: %s → %s', (before, after, kind) => {
      expect(diffYSchemas(nodeSchema(before, nested), nodeSchema(after, nested))).toEqual([
        expect.objectContaining({
          kind,
          path: nested ? 'nodes.group.children.item.repeated' : 'nodes.item.repeated',
        }),
      ]);
    });
  });

  it('does not mutate definitions or collapse their different immutable hashes', async () => {
    const base = nodeSchema(undefined, false);
    const target = nodeSchema(false, false);
    const before = [structuredClone(base), structuredClone(target)];
    const hashes = await Promise.all([
      sha256CompositionValue(base),
      sha256CompositionValue(target),
    ]);
    expect(hashes[0]).not.toBe(hashes[1]);
    expect(diffYSchemas(base, target)).toEqual([]);
    expect([base, target]).toEqual(before);
    expect(
      await Promise.all([sha256CompositionValue(base), sha256CompositionValue(target)])
    ).toEqual(hashes);
  });

  it('does not mistake a Slot or child Node named repeated for the repeated flag', () => {
    const base = normalizeYSchemaObject({
      yschema: '0.1',
      name: 'test',
      nodes: { item: { slots: {} } },
    });
    const target = normalizeYSchemaObject({
      yschema: '0.1',
      name: 'test',
      nodes: {
        item: {
          slots: { repeated: { type: 'boolean', default: false } },
          children: { repeated: { slots: {} } },
        },
      },
    });
    expect(diffYSchemas(base, target).map((change) => change.path)).toEqual([
      'nodes.item.children',
      'nodes.item.slots.repeated',
    ]);
    expect(diffYSchemas(target, base).map((change) => change.path)).toEqual([
      'nodes.item.children',
      'nodes.item.slots.repeated',
    ]);
    const changedDefault = structuredClone(target);
    changedDefault.nodes.item!.slots!.repeated!.default = true;
    expect(diffYSchemas(target, changedDefault)).toEqual([
      expect.objectContaining({ kind: 'CHANGE', path: 'nodes.item.slots.repeated.default' }),
    ]);
  });

  it('reports deterministic contract changes while ignoring release metadata', () => {
    const base = normalizeYSchemaObject({
      yschema: '0.1',
      name: 'projects/test/schema',
      version: '1.0.0',
      nodes: {
        summary: { slots: { problem: { type: 'string' } } },
        obsolete: { slots: {} },
      },
    });
    const target = normalizeYSchemaObject({
      yschema: '0.1',
      name: 'projects/test/schema',
      version: '1.1.0',
      nodes: {
        summary: { required: true, slots: { problem: { type: 'string', maxWords: 80 } } },
      },
    });

    expect(diffYSchemas(base, target)).toEqual([
      { kind: 'REMOVE', path: 'nodes.obsolete', summary: 'Contract path removed.' },
      { kind: 'ADD', path: 'nodes.summary.required', summary: 'Contract path added.' },
      {
        kind: 'ADD',
        path: 'nodes.summary.slots.problem.maxWords',
        summary: 'Contract path added.',
      },
    ]);
  });
});
