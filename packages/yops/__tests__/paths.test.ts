import { describe, it, expect } from 'vitest';
import { parsePath, resolvePath, setAtPath, deleteAtPath, deepClone } from '../src/paths';
import type { YValue } from '../src/types';

// ── parsePath ──────────────────────────────────────────────────────────────

describe('parsePath', () => {
  it('empty string returns []', () => {
    expect(parsePath('')).toEqual([]);
  });

  it('simple key', () => {
    expect(parsePath('config')).toEqual([{ type: 'key', value: 'config' }]);
  });

  it('nested keys', () => {
    expect(parsePath('config/database/host')).toEqual([
      { type: 'key', value: 'config' },
      { type: 'key', value: 'database' },
      { type: 'key', value: 'host' },
    ]);
  });

  it('array index', () => {
    expect(parsePath('items/[0]')).toEqual([
      { type: 'key', value: 'items' },
      { type: 'index', value: 0 },
    ]);
  });

  it('key match', () => {
    expect(parsePath('users/[name=alice]')).toEqual([
      { type: 'key', value: 'users' },
      { type: 'match', key: 'name', value: 'alice' },
    ]);
  });

  it('key match with nested access', () => {
    expect(parsePath('users/[name=alice]/role')).toEqual([
      { type: 'key', value: 'users' },
      { type: 'match', key: 'name', value: 'alice' },
      { type: 'key', value: 'role' },
    ]);
  });
});

// ── resolvePath ────────────────────────────────────────────────────────────

describe('resolvePath', () => {
  const doc: YValue = {
    config: {
      database: {
        host: 'localhost',
        port: 5432,
      },
    },
    items: ['a', 'b', 'c'],
    users: [
      { name: 'alice', role: 'admin' },
      { name: 'bob', role: 'viewer' },
    ],
  };

  it('root (empty path) returns doc itself', () => {
    expect(resolvePath(doc, '')).toBe(doc);
  });

  it('nested mapping key', () => {
    expect(resolvePath(doc, 'config/database/host')).toBe('localhost');
  });

  it('array by index', () => {
    expect(resolvePath(doc, 'items/[1]')).toBe('b');
  });

  it('array by key match', () => {
    expect(resolvePath(doc, 'users/[name=alice]')).toEqual({ name: 'alice', role: 'admin' });
  });

  it('array by key match then nested access', () => {
    expect(resolvePath(doc, 'users/[name=alice]/role')).toBe('admin');
  });

  it('missing path returns undefined', () => {
    expect(resolvePath(doc, 'config/missing')).toBeUndefined();
  });

  it('missing match returns undefined', () => {
    expect(resolvePath(doc, 'users/[name=charlie]')).toBeUndefined();
  });

  it('index out of bounds returns undefined', () => {
    expect(resolvePath(doc, 'items/[99]')).toBeUndefined();
  });

  it('key access on non-mapping returns undefined', () => {
    expect(resolvePath(doc, 'items/foo')).toBeUndefined();
  });
});

// ── setAtPath ──────────────────────────────────────────────────────────────

describe('setAtPath', () => {
  it('set at nested path', () => {
    const doc: YValue = { config: { host: 'localhost' } };
    const result = setAtPath(doc, 'config/host', 'remotehost');
    expect(result).toEqual({ config: { host: 'remotehost' } });
    // original not mutated
    expect((doc as any).config.host).toBe('localhost');
  });

  it('create intermediate mappings for missing keys', () => {
    const doc: YValue = {};
    const result = setAtPath(doc, 'a/b/c', 42);
    expect(result).toEqual({ a: { b: { c: 42 } } });
  });

  it('set in array by index', () => {
    const doc: YValue = { items: ['x', 'y', 'z'] };
    const result = setAtPath(doc, 'items/[1]', 'Y');
    expect(result).toEqual({ items: ['x', 'Y', 'z'] });
  });

  it('set via key match', () => {
    const doc: YValue = {
      users: [
        { name: 'alice', role: 'viewer' },
        { name: 'bob', role: 'viewer' },
      ],
    };
    const result = setAtPath(doc, 'users/[name=alice]/role', 'admin');
    expect((result as any).users[0].role).toBe('admin');
    expect((result as any).users[1].role).toBe('viewer');
  });

  it('set at root (empty path) replaces entire doc', () => {
    const doc: YValue = { old: true };
    const result = setAtPath(doc, '', { new: true });
    expect(result).toEqual({ new: true });
  });

  it('throws on key access into non-mapping', () => {
    const doc: YValue = { items: [1, 2, 3] };
    expect(() => setAtPath(doc, 'items/foo', 99)).toThrow();
  });
});

// ── deleteAtPath ───────────────────────────────────────────────────────────

describe('deleteAtPath', () => {
  it('delete key from mapping', () => {
    const doc: YValue = { a: 1, b: 2 };
    const result = deleteAtPath(doc, 'b');
    expect(result).toEqual({ a: 1 });
    // original not mutated
    expect((doc as any).b).toBe(2);
  });

  it('delete nested key', () => {
    const doc: YValue = { config: { host: 'localhost', port: 5432 } };
    const result = deleteAtPath(doc, 'config/port');
    expect(result).toEqual({ config: { host: 'localhost' } });
  });

  it('missing path returns false', () => {
    const doc: YValue = { a: 1 };
    expect(deleteAtPath(doc, 'z')).toBe(false);
  });

  it('delete element from array by index', () => {
    const doc: YValue = { items: ['a', 'b', 'c'] };
    const result = deleteAtPath(doc, 'items/[1]');
    expect(result).toEqual({ items: ['a', 'c'] });
  });
});

// ── deepClone ──────────────────────────────────────────────────────────────

describe('deepClone', () => {
  it('clones primitives', () => {
    expect(deepClone(42)).toBe(42);
    expect(deepClone('hello')).toBe('hello');
    expect(deepClone(true)).toBe(true);
    expect(deepClone(null)).toBe(null);
  });

  it('clones array deeply', () => {
    const arr: YValue = [1, { a: 2 }, [3]];
    const clone = deepClone(arr) as YValue[];
    expect(clone).toEqual(arr);
    expect(clone).not.toBe(arr);
    expect(clone[1]).not.toBe((arr as YValue[])[1]);
  });

  it('clones mapping deeply', () => {
    const obj: YValue = { a: { b: [1, 2] } };
    const clone = deepClone(obj) as { [k: string]: YValue };
    expect(clone).toEqual(obj);
    expect(clone).not.toBe(obj);
    expect(clone.a).not.toBe((obj as any).a);
  });
});
