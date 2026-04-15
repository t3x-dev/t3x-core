import { describe, expect, it } from 'vitest';
import { validateOps, YOpSchema } from '../src/schema';

describe('YOpSchema', () => {
  it('validates a correct define op', () => {
    const result = YOpSchema.safeParse({ define: { path: 'foo' } });
    expect(result.success).toBe(true);
  });

  it('rejects an op with missing required field', () => {
    // rename requires both path and to
    const result = YOpSchema.safeParse({ rename: { path: 'foo' } });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown op name', () => {
    const result = YOpSchema.safeParse({ unknown_op: { path: 'foo' } });
    expect(result.success).toBe(false);
  });

  it('rejects extra fields (strict mode)', () => {
    const result = YOpSchema.safeParse({ define: { path: 'foo', extra: 'bar' } });
    expect(result.success).toBe(false);
  });
});

describe('validateOps', () => {
  it('returns valid:true for all 18 op types', () => {
    const ops = [
      { define: { path: 'a' } },
      { drop: { path: 'a' } },
      { rename: { path: 'a', to: 'b' } },
      { set: { path: 'a', value: 'hello' } },
      { unset: { path: 'a' } },
      { populate: { path: 'a', values: { x: 1, y: 'two' } } },
      { append: { path: 'a', value: 42 } },
      { move: { from: 'a', to: 'b' } },
      { clone: { from: 'a', to: 'b' } },
      { nest: { path: 'a', keys: ['x', 'y'], under: 'nested' } },
      { split: { path: 'a', into: { groupA: ['x'], groupB: ['y'] } } },
      { fold: { path: 'a' } },
      { merge: { path: 'a', keys: ['x', 'y'], into: 'merged' } },
      { sort: { path: 'a' } },
      { unique: { path: 'a' } },
      { pick: { path: 'a', keys: ['x'] } },
      { omit: { path: 'a', keys: ['y'] } },
      { assert: { path: 'a', exists: true } },
    ];
    const result = validateOps(ops);
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it('returns valid:false with error info for invalid op', () => {
    const ops = [{ define: { path: 'foo' } }, { set: { path: 'bar' } }]; // set missing value
    const result = validateOps(ops);
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors![0].op_index).toBe(1);
  });

  it('returns valid:false for unknown op name', () => {
    const ops = [{ bogus: { path: 'x' } }];
    const result = validateOps(ops);
    expect(result.valid).toBe(false);
    expect(result.errors![0].op_index).toBe(0);
  });

  it('validates assert with different condition fields', () => {
    const ops = [
      { assert: { path: 'a', equals: 'hello' } },
      { assert: { path: 'b', type: 'mapping' as const } },
      { assert: { path: 'c', exists: false } },
    ];
    const result = validateOps(ops);
    expect(result.valid).toBe(true);
  });

  it('validates sort with optional fields', () => {
    const ops = [
      { sort: { path: 'items' } },
      { sort: { path: 'items', by: 'name' } },
      { sort: { path: 'items', by: 'name', order: 'desc' as const } },
    ];
    const result = validateOps(ops);
    expect(result.valid).toBe(true);
  });
});
