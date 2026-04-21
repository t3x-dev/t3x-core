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

  it('rejects extra fields inside op params (strict mode)', () => {
    const result = YOpSchema.safeParse({ define: { path: 'foo', extra: 'bar' } });
    expect(result.success).toBe(false);
  });

  it('accepts an op with valid LLM source', () => {
    const result = YOpSchema.safeParse({
      set: { path: 'budget', value: '5000 yuan' },
      source: {
        type: 'llm',
        model: 'claude-sonnet-4-20250514',
        at: '2026-04-15T10:00:00Z',
        turn_ref: { turn_hash: 'sha256:abc', quote: '五千块' },
      },
    });
    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error('Expected schema parse to succeed');
    }
    expect(result.data.source?.turn_ref?.quote).toBe('五千块');
  });

  it('accepts an op with valid human source', () => {
    const result = YOpSchema.safeParse({
      define: { path: 'trip' },
      source: { type: 'human', author: 'user@example.com' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts an op without source (optional)', () => {
    const result = YOpSchema.safeParse({ define: { path: 'trip' } });
    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error('Expected schema parse to succeed');
    }
    expect(result.data.source).toBeUndefined();
  });

  it('rejects an op with invalid source shape', () => {
    const result = YOpSchema.safeParse({
      set: { path: 'x', value: 1 },
      source: { type: 'llm' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields other than source (strict still enforced)', () => {
    const result = YOpSchema.safeParse({
      define: { path: 'foo' },
      source: { type: 'human', author: 'me' },
      bogus: 'should fail',
    });
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
