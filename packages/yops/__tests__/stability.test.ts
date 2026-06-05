import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEngine } from '../src/engine';
import { registerAllHandlers } from '../src/handlers';
import { OpRegistry } from '../src/registry';
import { parseSpec } from '../src/spec';

const yamlStr = readFileSync(join(__dirname, '..', 'yops.yaml'), 'utf8');

function minimalSpecYaml(operationBlock: string): string {
  return `
name: yops
version: "1.0"
description: test spec
operations:
${operationBlock}
errors: {}
execution:
  order: sequential
  on_error: stop
  immutable_input: true
  idempotent_ops: []
  strict_ops: []
  readonly_ops: []
`;
}

describe('YOps stability metadata', () => {
  it('parses operation and field status metadata from the canonical spec', () => {
    const spec = parseSpec(yamlStr);

    for (const op of Object.values(spec.operations)) {
      expect(op.status).toMatch(/^(frozen|evolving|experimental)$/);
      for (const field of Object.values(op.fields)) {
        expect(field.status).toMatch(/^(frozen|evolving|experimental)$/);
      }
    }
  });

  it('rejects operations without status metadata', () => {
    const yaml = minimalSpecYaml(`
  define:
    category: ddl
    description: Create an empty mapping at a path
    fields:
      path:
        type: string
        required: true
        status: frozen
        description: Path to create.
`);

    expect(() => parseSpec(yaml)).toThrow('define: missing required status');
  });

  it('rejects fields without status metadata', () => {
    const yaml = minimalSpecYaml(`
  define:
    category: ddl
    status: frozen
    description: Create an empty mapping at a path
    fields:
      path:
        type: string
        required: true
        description: Path to create.
`);

    expect(() => parseSpec(yaml)).toThrow('define.path: missing required status');
  });

  it('rejects invalid stability status values', () => {
    const yaml = minimalSpecYaml(`
  define:
    category: ddl
    status: stable
    description: Create an empty mapping at a path
    fields:
      path:
        type: string
        required: true
        status: frozen
        description: Path to create.
`);

    expect(() => parseSpec(yaml)).toThrow(
      'define: status must be one of frozen, evolving, experimental'
    );
  });

  it('parses deprecated field metadata', () => {
    const yaml = minimalSpecYaml(`
  sort:
    category: dtl
    status: frozen
    description: Sort a sequence
    fields:
      path:
        type: string
        required: true
        status: frozen
        description: Sequence path.
      by:
        type: string
        required: false
        status: evolving
        deprecated_in: "1.1"
        replacement_field: order_by
        description: Deprecated sort key.
`);

    const spec = parseSpec(yaml);

    expect(spec.operations.sort.fields.by).toMatchObject({
      status: 'evolving',
      deprecated_in: '1.1',
      replacement_field: 'order_by',
    });
  });
});

describe('YOps deprecated field warnings', () => {
  it('emits a clear warning when a deprecated field is used', () => {
    const spec = parseSpec(yamlStr);
    const byField = spec.operations.sort.fields.by as typeof spec.operations.sort.fields.by & {
      deprecated_in?: string;
      replacement_field?: string;
    };
    byField.deprecated_in = '1.1';
    byField.replacement_field = 'order_by';

    const registry = new OpRegistry(spec);
    registerAllHandlers(registry);
    registry.validate();
    const engine = createEngine(registry);

    const result = engine.applyYOps({ items: [{ name: 'b' }, { name: 'a' }] }, [
      { sort: { path: 'items', by: 'name' } },
    ]);

    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([
      {
        code: 'DEPRECATED_FIELD',
        message: 'sort.by is deprecated since 1.1; use order_by instead.',
        op_index: 0,
        op: 'sort',
        field: 'by',
        deprecated_in: '1.1',
        replacement_field: 'order_by',
      },
    ]);
  });

  it('does not emit warnings for non-deprecated execution', () => {
    const spec = parseSpec(yamlStr);
    const registry = new OpRegistry(spec);
    registerAllHandlers(registry);
    registry.validate();
    const engine = createEngine(registry);

    const result = engine.applyYOps({}, [{ define: { path: 'config' } }]);

    expect(result.ok).toBe(true);
    expect(result).not.toHaveProperty('warnings');
  });
});
