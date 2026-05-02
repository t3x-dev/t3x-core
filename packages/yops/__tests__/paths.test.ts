import { describe, expect, it } from 'vitest';
import {
  deepClone,
  deleteAtPath,
  parsePath,
  resolvePath,
  setAtPath,
  tryParsePath,
} from '../src/paths';
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

  // ── quoted segments (proposal A′ from #930) ───────────────────────────────

  describe('quoted segments', () => {
    it('decodes a quoted key containing a slash', () => {
      expect(parsePath('config/"db/prod"/host')).toEqual([
        { type: 'key', value: 'config' },
        { type: 'key', value: 'db/prod' },
        { type: 'key', value: 'host' },
      ]);
    });

    it('decodes \\" as a literal double quote', () => {
      expect(parsePath('"some \\"weird\\" key"')).toEqual([
        { type: 'key', value: 'some "weird" key' },
      ]);
    });

    it('decodes \\\\ as a literal backslash', () => {
      expect(parsePath('"path\\\\with\\\\backslashes"')).toEqual([
        { type: 'key', value: 'path\\with\\backslashes' },
      ]);
    });

    it('treats reserved characters as literal inside quotes', () => {
      expect(parsePath('"k[0]=v"')).toEqual([{ type: 'key', value: 'k[0]=v' }]);
    });

    it('mixes quoted and unquoted segments', () => {
      expect(parsePath('a/"b/c"/d/[0]/e')).toEqual([
        { type: 'key', value: 'a' },
        { type: 'key', value: 'b/c' },
        { type: 'key', value: 'd' },
        { type: 'index', value: 0 },
        { type: 'key', value: 'e' },
      ]);
    });
  });

  describe('parsePath fallback for malformed quoted segments (permissive)', () => {
    // parsePath stays permissive — invalid quoted segments fall back to
    // legacy split-on-/ behaviour. The validator surfaces the error
    // separately via tryParsePath.
    it('unclosed quote falls back to legacy split', () => {
      expect(parsePath('"unclosed')).toEqual([{ type: 'key', value: '"unclosed' }]);
    });

    it('invalid escape falls back to legacy split', () => {
      // The whole path falls back to split-on-/, so the segment is the
      // raw quoted text unchanged.
      const result = parsePath('"a\\nb"');
      expect(result).toEqual([{ type: 'key', value: '"a\\nb"' }]);
    });
  });
});

// ── tryParsePath (strict; the validator builds on this) ────────────────────

describe('tryParsePath', () => {
  it('returns ok for a simple unquoted path', () => {
    const r = tryParsePath('config/database/host');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.segments).toEqual([
      { type: 'key', value: 'config' },
      { type: 'key', value: 'database' },
      { type: 'key', value: 'host' },
    ]);
  });

  it('returns ok for a valid quoted segment', () => {
    const r = tryParsePath('config/"db/prod"/host');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.segments).toEqual([
      { type: 'key', value: 'config' },
      { type: 'key', value: 'db/prod' },
      { type: 'key', value: 'host' },
    ]);
  });

  it('returns UNCLOSED_QUOTE for a quoted segment with no closing quote', () => {
    const r = tryParsePath('config/"db/prod/host');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('UNCLOSED_QUOTE');
    expect(r.message).toMatch(/unclosed/i);
    expect(r.offset).toBe(7); // position of the opening quote
  });

  it('returns INVALID_ESCAPE for a backslash followed by an unsupported char', () => {
    const r = tryParsePath('"a\\nb"');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('INVALID_ESCAPE');
    expect(r.message).toMatch(/\\n/);
  });

  it('returns INVALID_ESCAPE for a trailing backslash inside a quoted segment', () => {
    const r = tryParsePath('"trailing\\');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('INVALID_ESCAPE');
  });

  it('empty path returns ok with empty segments', () => {
    const r = tryParsePath('');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.segments).toEqual([]);
  });
});

describe('resolvePath with quoted segments', () => {
  const doc: YValue = {
    config: {
      'db/prod': {
        host: 'localhost',
      },
      simple: {
        host: 'staging',
      },
    },
  };

  it('resolves a key containing a slash via a quoted segment', () => {
    expect(resolvePath(doc, 'config/"db/prod"/host')).toBe('localhost');
  });

  it('quoted simple key resolves the same as unquoted', () => {
    expect(resolvePath(doc, 'config/"simple"/host')).toBe('staging');
    expect(resolvePath(doc, 'config/simple/host')).toBe('staging');
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

  it('key match with numeric coercion', () => {
    const numDoc: YValue = {
      items: [
        { id: 1, name: 'first' },
        { id: 2, name: 'second' },
      ],
    };
    expect(resolvePath(numDoc, 'items/[id=1]/name')).toBe('first');
    expect(resolvePath(numDoc, 'items/[id=2]/name')).toBe('second');
  });

  it('key match with boolean coercion', () => {
    const boolDoc: YValue = { flags: [{ name: 'debug', enabled: true }] };
    expect(resolvePath(boolDoc, 'flags/[enabled=true]/name')).toBe('debug');
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
    expect(doc).toEqual({ config: { host: 'localhost' } });
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
    expect(result).toEqual({
      users: [
        { name: 'alice', role: 'admin' },
        { name: 'bob', role: 'viewer' },
      ],
    });
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
    expect(doc).toEqual({ a: 1, b: 2 });
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
    expect(clone.a).not.toBe((obj as { a: YValue }).a);
  });
});
