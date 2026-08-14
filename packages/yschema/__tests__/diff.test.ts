import { describe, expect, it } from 'vitest';
import { diffYSchemas, normalizeYSchemaObject } from '../src';

describe('diffYSchemas', () => {
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
