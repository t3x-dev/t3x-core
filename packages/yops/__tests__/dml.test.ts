/**
 * DML Operations Tests: set, unset, populate, append
 */

import { describe, expect, it } from 'vitest';
import { applyYOps } from '../src/index';
import type { YValue } from '../src/types';

// ── set ──────────────────────────────────────────────────────────────────────

describe('set', () => {
  it('sets a value at a path', () => {
    const doc: YValue = { config: {} };
    const result = applyYOps(doc, [{ set: { path: 'config/host', value: 'localhost' } }]);
    expect(result.ok).toBe(true);
    expect(result.applied).toBe(1);
    expect((result.doc as any).config.host).toBe('localhost');
    // original untouched
    expect((doc as any).config.host).toBeUndefined();
  });

  it('overwrites existing value', () => {
    const doc: YValue = { config: { host: 'localhost' } };
    const result = applyYOps(doc, [{ set: { path: 'config/host', value: '127.0.0.1' } }]);
    expect(result.ok).toBe(true);
    expect((result.doc as any).config.host).toBe('127.0.0.1');
    // original untouched
    expect((doc as any).config.host).toBe('localhost');
  });

  it('creates intermediate mappings', () => {
    const doc: YValue = {};
    const result = applyYOps(doc, [{ set: { path: 'a/b/c', value: 42 } }]);
    expect(result.ok).toBe(true);
    expect((result.doc as any).a.b.c).toBe(42);
  });

  it('sets value via array key match', () => {
    const doc: YValue = {
      users: [
        { name: 'alice', role: 'viewer' },
        { name: 'bob', role: 'viewer' },
      ],
    };
    const result = applyYOps(doc, [{ set: { path: 'users/[name=alice]/role', value: 'admin' } }]);
    expect(result.ok).toBe(true);
    const users = (result.doc as any).users;
    expect(users[0].role).toBe('admin');
    expect(users[1].role).toBe('viewer');
    // original untouched
    expect((doc as any).users[0].role).toBe('viewer');
  });
});

// ── unset ────────────────────────────────────────────────────────────────────

describe('unset', () => {
  it('removes a key (idempotent)', () => {
    const doc: YValue = { config: { host: 'localhost', port: 5432 } };
    const result = applyYOps(doc, [{ unset: { path: 'config/port' } }]);
    expect(result.ok).toBe(true);
    expect(result.applied).toBe(1);
    expect((result.doc as any).config).toEqual({ host: 'localhost' });
    // original untouched
    expect((doc as any).config.port).toBe(5432);
  });

  it('no error on missing key', () => {
    const doc: YValue = { config: { host: 'localhost' } };
    const result = applyYOps(doc, [{ unset: { path: 'config/missing' } }]);
    expect(result.ok).toBe(true);
    expect(result.applied).toBe(1);
    expect(result.error).toBeUndefined();
    expect(result.doc).toEqual(doc);
  });

  it('errors when unset targets a sequence index', () => {
    const doc: YValue = { items: ['a', 'b', 'c'] };
    const result = applyYOps(doc, [{ unset: { path: 'items/[1]' } }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('NOT_A_MAPPING');
    expect(result.doc).toEqual(doc);
  });
});

// ── populate ─────────────────────────────────────────────────────────────────

describe('populate', () => {
  it('sets multiple keys on a mapping', () => {
    const doc: YValue = { user: { name: 'alice' } };
    const result = applyYOps(doc, [
      {
        populate: {
          path: 'user',
          values: { role: 'admin', active: true },
        },
      },
    ]);
    expect(result.ok).toBe(true);
    expect(result.applied).toBe(1);
    expect((result.doc as any).user).toEqual({ name: 'alice', role: 'admin', active: true });
    // original untouched
    expect((doc as any).user.role).toBeUndefined();
  });

  it('errors if path is not a mapping', () => {
    const doc: YValue = { items: [1, 2, 3] };
    const result = applyYOps(doc, [
      {
        populate: {
          path: 'items',
          values: { extra: 4 },
        },
      },
    ]);
    expect(result.ok).toBe(false);
    expect(result.applied).toBe(0);
    expect(result.error?.code).toBe('NOT_A_MAPPING');
    expect(result.error?.op_index).toBe(0);
  });

  it('errors if path does not exist', () => {
    const doc: YValue = { config: {} };
    const result = applyYOps(doc, [
      {
        populate: {
          path: 'missing',
          values: { key: 'value' },
        },
      },
    ]);
    expect(result.ok).toBe(false);
    expect(result.applied).toBe(0);
    expect(result.error?.code).toBe('PATH_NOT_FOUND');
    expect(result.error?.op_index).toBe(0);
  });
});

// ── append ───────────────────────────────────────────────────────────────────

describe('append', () => {
  it('appends a value to a sequence', () => {
    const doc: YValue = { items: [1, 2] };
    const result = applyYOps(doc, [{ append: { path: 'items', value: 3 } }]);
    expect(result.ok).toBe(true);
    expect(result.applied).toBe(1);
    expect((result.doc as any).items).toEqual([1, 2, 3]);
    // original untouched
    expect((doc as any).items).toEqual([1, 2]);
  });

  it('errors if path is not a sequence', () => {
    const doc: YValue = { config: { host: 'localhost' } };
    const result = applyYOps(doc, [{ append: { path: 'config', value: 'extra' } }]);
    expect(result.ok).toBe(false);
    expect(result.applied).toBe(0);
    expect(result.error?.code).toBe('NOT_A_SEQUENCE');
    expect(result.error?.op_index).toBe(0);
  });

  it('errors if path does not exist', () => {
    const doc: YValue = { config: {} };
    const result = applyYOps(doc, [{ append: { path: 'missing', value: 'x' } }]);
    expect(result.ok).toBe(false);
    expect(result.applied).toBe(0);
    expect(result.error?.code).toBe('PATH_NOT_FOUND');
    expect(result.error?.op_index).toBe(0);
  });

  it('appends a mapping to a sequence', () => {
    const doc: YValue = { users: [{ name: 'alice' }] };
    const result = applyYOps(doc, [
      { append: { path: 'users', value: { name: 'bob', role: 'viewer' } } },
    ]);
    expect(result.ok).toBe(true);
    expect((result.doc as any).users).toEqual([{ name: 'alice' }, { name: 'bob', role: 'viewer' }]);
    // original untouched
    expect((doc as any).users).toHaveLength(1);
  });
});
