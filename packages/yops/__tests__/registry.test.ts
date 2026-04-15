/**
 * OpRegistry Tests — spec-validated handler registration
 */

import { describe, expect, it } from 'vitest';
import type { OpHandler } from '../src/registry';
import { OpRegistry } from '../src/registry';
import type { YOpsSpec } from '../src/spec';

// ── Minimal mock spec with 3 ops ──

function makeMockSpec(opNames: string[]): YOpsSpec {
  const operations: Record<string, YOpsSpec['operations'][string]> = {};
  for (const name of opNames) {
    operations[name] = {
      name,
      category: 'dml',
      description: `Mock ${name} op`,
      fields: {
        path: { type: 'string', required: true, description: 'target path' },
      },
      errors: [],
      rules: [],
      tests: [],
    };
  }
  return {
    name: 'yops',
    version: '1.0',
    description: 'mock spec',
    operations,
    errors: {},
    execution: {
      order: 'sequential',
      on_error: 'fail_fast',
      immutable_input: true,
      idempotent_ops: [],
      strict_ops: [],
      readonly_ops: [],
    },
  };
}

const noopHandler: OpHandler = (doc, _fields, _index) => ({ doc });

describe('OpRegistry', () => {
  it('registers a handler for a spec-defined op', () => {
    const spec = makeMockSpec(['set', 'unset', 'define']);
    const registry = new OpRegistry(spec);

    registry.register('set', noopHandler);

    expect(registry.getHandler('set')).toBe(noopHandler);
  });

  it('throws when registering handler for unknown op (not in spec)', () => {
    const spec = makeMockSpec(['set']);
    const registry = new OpRegistry(spec);

    expect(() => registry.register('bogus', noopHandler)).toThrow(/bogus/);
  });

  it('validate() throws if a spec op has no registered handler', () => {
    const spec = makeMockSpec(['set', 'unset']);
    const registry = new OpRegistry(spec);

    registry.register('set', noopHandler);
    // 'unset' has no handler

    expect(() => registry.validate()).toThrow(/unset/);
  });

  it('validate() passes when all ops are registered', () => {
    const spec = makeMockSpec(['set', 'unset']);
    const registry = new OpRegistry(spec);

    registry.register('set', noopHandler);
    registry.register('unset', noopHandler);

    expect(() => registry.validate()).not.toThrow();
  });

  it('getOpSpec returns spec for a known op', () => {
    const spec = makeMockSpec(['set', 'define']);
    const registry = new OpRegistry(spec);

    const opSpec = registry.getOpSpec('define');

    expect(opSpec).toBeDefined();
    expect(opSpec?.name).toBe('define');
    expect(opSpec?.category).toBe('dml');
  });

  it('getOpSpec returns undefined for an unknown op', () => {
    const spec = makeMockSpec(['set']);
    const registry = new OpRegistry(spec);

    expect(registry.getOpSpec('nonexistent')).toBeUndefined();
  });

  it('operationNames returns all op names from spec', () => {
    const spec = makeMockSpec(['set', 'unset', 'define']);
    const registry = new OpRegistry(spec);

    const names = registry.operationNames;

    expect(names).toHaveLength(3);
    expect(names).toContain('set');
    expect(names).toContain('unset');
    expect(names).toContain('define');
  });

  it('operationNames returns empty array when spec has no ops', () => {
    const spec = makeMockSpec([]);
    const registry = new OpRegistry(spec);

    expect(registry.operationNames).toEqual([]);
  });

  it('getHandler returns undefined for unregistered op', () => {
    const spec = makeMockSpec(['set']);
    const registry = new OpRegistry(spec);

    expect(registry.getHandler('set')).toBeUndefined();
  });

  it('spec property is publicly accessible', () => {
    const spec = makeMockSpec(['set']);
    const registry = new OpRegistry(spec);

    expect(registry.spec).toBe(spec);
  });
});
