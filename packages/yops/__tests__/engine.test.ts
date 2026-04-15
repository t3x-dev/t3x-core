/**
 * Engine Integration Tests — sequencing, fail-fast, deep clone, complex pipelines
 */

import { describe, expect, it } from 'vitest';
import { applyYOps } from '../src/index';
import type { YOp, YValue } from '../src/types';

describe('applyYOps — engine behavior', () => {
  it('deep clones input — original not mutated', () => {
    const doc: YValue = { config: { host: 'old' } };
    const ops: YOp[] = [{ set: { path: 'config/host', value: 'new' } }];
    applyYOps(doc, ops);
    expect((doc as Record<string, any>).config.host).toBe('old');
  });

  it('applies ops sequentially — each sees previous state', () => {
    const doc: YValue = {};
    const ops: YOp[] = [
      { define: { path: 'config' } },
      { set: { path: 'config/host', value: 'localhost' } },
      { set: { path: 'config/port', value: 5432 } },
    ];
    const result = applyYOps(doc, ops);
    expect(result.ok).toBe(true);
    expect(result.doc).toEqual({ config: { host: 'localhost', port: 5432 } });
    expect(result.applied).toBe(3);
  });

  it('fail-fast — stops at first error', () => {
    const doc: YValue = { a: 1 };
    const ops: YOp[] = [
      { set: { path: 'b', value: 2 } },
      { drop: { path: 'missing' } },
      { set: { path: 'c', value: 3 } },
    ];
    const result = applyYOps(doc, ops);
    expect(result.ok).toBe(false);
    expect(result.applied).toBe(1);
    expect(result.error?.code).toBe('PATH_NOT_FOUND');
    expect(result.error?.op_index).toBe(1);
    expect((result.doc as Record<string, any>).b).toBe(2);
    expect((result.doc as Record<string, any>).c).toBeUndefined();
  });

  it('returns applied: 0 for empty ops array', () => {
    const doc: YValue = { a: 1 };
    const result = applyYOps(doc, []);
    expect(result.ok).toBe(true);
    expect(result.applied).toBe(0);
    expect(result.doc).toEqual({ a: 1 });
  });

  it('unknown op returns UNKNOWN_OP error', () => {
    const doc: YValue = {};
    const ops = [{ bogus: { path: 'x' } }] as unknown as YOp[];
    const result = applyYOps(doc, ops);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('UNKNOWN_OP');
  });

  it('complex multi-op pipeline', () => {
    const doc: YValue = {};
    const ops: YOp[] = [
      { define: { path: 'users' } },
      { set: { path: 'users', value: [] } },
      { append: { path: 'users', value: { name: 'alice', role: 'user' } } },
      { append: { path: 'users', value: { name: 'bob', role: 'admin' } } },
      { sort: { path: 'users', by: 'name' } },
      { set: { path: 'users/[name=alice]/role', value: 'admin' } },
    ];
    const result = applyYOps(doc, ops);
    expect(result.ok).toBe(true);
    expect(result.doc).toEqual({
      users: [
        { name: 'alice', role: 'admin' },
        { name: 'bob', role: 'admin' },
      ],
    });
  });
});
