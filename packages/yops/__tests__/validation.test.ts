/**
 * Field Validation Tests — spec-driven field checking
 */

import { describe, expect, it } from 'vitest';
import { applyYOps } from '../src/index';
import { validateOps, YOpSchema } from '../src/schema';
import type { YValue } from '../src/types';

type ApplyOpsInput = Parameters<typeof applyYOps>[1];

describe('field validation', () => {
  it('rejects missing required field', () => {
    const doc: YValue = {};
    const ops = [{ set: { path: 'x' } }] as unknown as ApplyOpsInput; // missing 'value'
    const result = applyYOps(doc, ops);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('INVALID_OP');
    expect(result.error?.message).toContain('missing required field');
  });

  it('rejects unknown field', () => {
    const doc: YValue = {};
    const ops = [{ set: { path: 'x', value: 1, bogus: true } }] as unknown as ApplyOpsInput;
    const result = applyYOps(doc, ops);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('INVALID_OP');
    expect(result.error?.message).toContain('unknown field');
  });

  it('rejects invalid enum value', () => {
    const doc: YValue = { items: [3, 1, 2] };
    const ops = [{ sort: { path: 'items', order: 'sideways' } }] as unknown as ApplyOpsInput;
    const result = applyYOps(doc, ops);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('INVALID_OP');
    expect(result.error?.message).toContain('must be one of');
  });

  it('passes valid ops through to handler', () => {
    const doc: YValue = { config: {} };
    const ops = [{ set: { path: 'config/host', value: 'localhost' } }];
    const result = applyYOps(doc, ops);
    expect(result.ok).toBe(true);
    expect(result.doc).toEqual({ config: { host: 'localhost' } });
  });

  it('allows optional fields to be omitted', () => {
    const doc: YValue = { items: [3, 1, 2] };
    const ops = [{ sort: { path: 'items' } }]; // 'by' and 'order' are optional
    const result = applyYOps(doc, ops);
    expect(result.ok).toBe(true);
    expect(result.doc).toEqual({ items: [1, 2, 3] });
  });

  it('reports correct op_index for validation errors', () => {
    const doc: YValue = { x: 1 };
    const ops = [
      { set: { path: 'y', value: 2 } }, // valid
      { set: { path: 'z' } }, // missing 'value'
    ] as unknown as ApplyOpsInput;
    const result = applyYOps(doc, ops);
    expect(result.ok).toBe(false);
    expect(result.applied).toBe(1);
    expect(result.error?.op_index).toBe(1);
  });

  it('rejects empty path at the schema layer', () => {
    const result = YOpSchema.safeParse({ set: { path: '', value: 1 } });
    expect(result.success).toBe(false);
  });

  it('rejects assert with no condition at the schema layer', () => {
    const result = YOpSchema.safeParse({ assert: { path: 'a' } });
    expect(result.success).toBe(false);
  });

  it('keeps applyYOps aligned with schema for empty-path ops', () => {
    const ops = [{ set: { path: '', value: 1 } }] as unknown as ApplyOpsInput;
    expect(validateOps(ops).valid).toBe(false);

    const result = applyYOps({} as YValue, ops);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('INVALID_OP');
  });

  it('keeps applyYOps aligned with schema for empty assert conditions', () => {
    const ops = [{ assert: { path: 'a' } }] as unknown as ApplyOpsInput;
    expect(validateOps(ops).valid).toBe(false);

    const result = applyYOps({ a: 1 } as YValue, ops);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('INVALID_OP');
  });
});
