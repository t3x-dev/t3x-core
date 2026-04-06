/**
 * Field Validation Tests — spec-driven field checking
 */

import { describe, expect, it } from 'vitest';
import { applyYOps } from '../src/index';
import type { YValue } from '../src/types';

describe('field validation', () => {
  it('rejects missing required field', () => {
    const doc: YValue = {};
    const ops = [{ set: { path: 'x' } }] as any; // missing 'value'
    const result = applyYOps(doc, ops);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('INVALID_OP');
    expect(result.error?.message).toContain('missing required field');
  });

  it('rejects unknown field', () => {
    const doc: YValue = {};
    const ops = [{ set: { path: 'x', value: 1, bogus: true } }] as any;
    const result = applyYOps(doc, ops);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('INVALID_OP');
    expect(result.error?.message).toContain('unknown field');
  });

  it('rejects invalid enum value', () => {
    const doc: YValue = { items: [3, 1, 2] };
    const ops = [{ sort: { path: 'items', order: 'sideways' } }] as any;
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
      { set: { path: 'y', value: 2 } },     // valid
      { set: { path: 'z' } },                // missing 'value'
    ] as any;
    const result = applyYOps(doc, ops);
    expect(result.ok).toBe(false);
    expect(result.applied).toBe(1);
    expect(result.error?.op_index).toBe(1);
  });
});
