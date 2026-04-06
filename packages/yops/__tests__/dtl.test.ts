/**
 * DTL Operations Tests: move, clone, nest, split, fold, merge, sort, unique, pick, omit
 */

import { describe, it, expect } from 'vitest';
import { applyYOps } from '../src/index';
import type { YValue } from '../src/types';

// ── move ─────────────────────────────────────────────────────────────────────

describe('move', () => {
  it('moves a subtree to a new path', () => {
    const doc: YValue = { a: { x: 1 }, b: {} };
    const result = applyYOps(doc, [{ move: { from: 'a/x', to: 'b/y' } }]);
    expect(result.ok).toBe(true);
    expect(result.applied).toBe(1);
    expect((result.doc as any).a).toEqual({});
    expect((result.doc as any).b.y).toBe(1);
    // original untouched
    expect((doc as any).a.x).toBe(1);
    expect((doc as any).b.y).toBeUndefined();
  });

  it('moves a top-level key', () => {
    const doc: YValue = { old_name: 'value', container: {} };
    const result = applyYOps(doc, [{ move: { from: 'old_name', to: 'container/new_name' } }]);
    expect(result.ok).toBe(true);
    expect((result.doc as any).old_name).toBeUndefined();
    expect((result.doc as any).container.new_name).toBe('value');
  });

  it('errors if from path does not exist', () => {
    const doc: YValue = { a: {} };
    const result = applyYOps(doc, [{ move: { from: 'missing', to: 'a/x' } }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('PATH_NOT_FOUND');
    expect(result.error?.op_index).toBe(0);
    // doc unchanged
    expect(result.doc).toEqual(doc);
  });

  it('errors if to path already exists', () => {
    const doc: YValue = { a: 1, b: 2 };
    const result = applyYOps(doc, [{ move: { from: 'a', to: 'b' } }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('ALREADY_EXISTS');
    expect(result.error?.op_index).toBe(0);
  });
});

// ── clone ─────────────────────────────────────────────────────────────────────

describe('clone', () => {
  it('deep copies a subtree to a new path', () => {
    const doc: YValue = { original: { nested: { value: 42 } } };
    const result = applyYOps(doc, [{ clone: { from: 'original', to: 'copy' } }]);
    expect(result.ok).toBe(true);
    expect(result.applied).toBe(1);
    expect((result.doc as any).original).toEqual({ nested: { value: 42 } });
    expect((result.doc as any).copy).toEqual({ nested: { value: 42 } });
    // original untouched
    expect((doc as any).copy).toBeUndefined();
  });

  it('cloned subtree is independent (deep copy)', () => {
    const doc: YValue = { src: { items: [1, 2, 3] } };
    const result = applyYOps(doc, [{ clone: { from: 'src', to: 'dst' } }]);
    expect(result.ok).toBe(true);
    const docAny = result.doc as any;
    // Mutate the copy reference — original should remain untouched in the result doc
    expect(docAny.src.items).toEqual([1, 2, 3]);
    expect(docAny.dst.items).toEqual([1, 2, 3]);
  });

  it('errors if from path does not exist', () => {
    const doc: YValue = { a: {} };
    const result = applyYOps(doc, [{ clone: { from: 'missing', to: 'a/x' } }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('PATH_NOT_FOUND');
    expect(result.error?.op_index).toBe(0);
  });

  it('errors if to path already exists', () => {
    const doc: YValue = { a: 1, b: 2 };
    const result = applyYOps(doc, [{ clone: { from: 'a', to: 'b' } }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('ALREADY_EXISTS');
    expect(result.error?.op_index).toBe(0);
  });
});

// ── nest ──────────────────────────────────────────────────────────────────────

describe('nest', () => {
  it('wraps sibling keys under a new parent', () => {
    const doc: YValue = { config: { host: 'localhost', port: 5432, name: 'mydb' } };
    const result = applyYOps(doc, [{
      nest: { path: 'config', keys: ['host', 'port'], under: 'connection' },
    }]);
    expect(result.ok).toBe(true);
    expect(result.applied).toBe(1);
    const cfg = (result.doc as any).config;
    expect(cfg.connection).toEqual({ host: 'localhost', port: 5432 });
    expect(cfg.name).toBe('mydb');
    expect(cfg.host).toBeUndefined();
    expect(cfg.port).toBeUndefined();
    // original untouched
    expect((doc as any).config.host).toBe('localhost');
  });

  it('errors if path is not a mapping', () => {
    const doc: YValue = { items: [1, 2, 3] };
    const result = applyYOps(doc, [{
      nest: { path: 'items', keys: ['0'], under: 'wrapped' },
    }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('NOT_A_MAPPING');
    expect(result.error?.op_index).toBe(0);
  });

  it('errors if a key does not exist in the mapping', () => {
    const doc: YValue = { config: { host: 'localhost' } };
    const result = applyYOps(doc, [{
      nest: { path: 'config', keys: ['host', 'missing'], under: 'wrapped' },
    }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('PATH_NOT_FOUND');
    expect(result.error?.op_index).toBe(0);
  });

  it('errors if path does not exist', () => {
    const doc: YValue = {};
    const result = applyYOps(doc, [{
      nest: { path: 'missing', keys: ['a'], under: 'wrapped' },
    }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('NOT_A_MAPPING');
  });
});

// ── split ─────────────────────────────────────────────────────────────────────

describe('split', () => {
  it('distributes keys into new child mappings', () => {
    const doc: YValue = {
      settings: { host: 'localhost', port: 5432, log_level: 'debug', timeout: 30 },
    };
    const result = applyYOps(doc, [{
      split: {
        path: 'settings',
        into: {
          db: ['host', 'port'],
          app: ['log_level', 'timeout'],
        },
      },
    }]);
    expect(result.ok).toBe(true);
    expect(result.applied).toBe(1);
    const s = (result.doc as any).settings;
    expect(s.db).toEqual({ host: 'localhost', port: 5432 });
    expect(s.app).toEqual({ log_level: 'debug', timeout: 30 });
    expect(s.host).toBeUndefined();
    expect(s.port).toBeUndefined();
    // original untouched
    expect((doc as any).settings.host).toBe('localhost');
  });

  it('errors if path is not a mapping', () => {
    const doc: YValue = { items: [1, 2, 3] };
    const result = applyYOps(doc, [{
      split: { path: 'items', into: { group: ['0'] } },
    }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('NOT_A_MAPPING');
    expect(result.error?.op_index).toBe(0);
  });

  it('errors if a listed key does not exist', () => {
    const doc: YValue = { settings: { host: 'localhost' } };
    const result = applyYOps(doc, [{
      split: { path: 'settings', into: { db: ['host', 'missing'] } },
    }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('PATH_NOT_FOUND');
    expect(result.error?.op_index).toBe(0);
  });
});

// ── fold ──────────────────────────────────────────────────────────────────────

describe('fold', () => {
  it('collapses a single-child mapping into its parent', () => {
    const doc: YValue = { database: { connection: { host: 'localhost', port: 5432 } } };
    const result = applyYOps(doc, [{ fold: { path: 'database' } }]);
    expect(result.ok).toBe(true);
    expect(result.applied).toBe(1);
    const d = result.doc as any;
    expect(d.database).toBeUndefined();
    expect(d.connection).toEqual({ host: 'localhost', port: 5432 });
    // original untouched
    expect((doc as any).database.connection).toBeDefined();
  });

  it('errors if path has more than one key (not foldable)', () => {
    const doc: YValue = { wrapper: { a: 1, b: 2 } };
    const result = applyYOps(doc, [{ fold: { path: 'wrapper' } }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('NOT_FOLDABLE');
    expect(result.error?.op_index).toBe(0);
  });

  it('errors if path is not a mapping', () => {
    const doc: YValue = { items: [1, 2, 3] };
    const result = applyYOps(doc, [{ fold: { path: 'items' } }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('NOT_FOLDABLE');
    expect(result.error?.op_index).toBe(0);
  });

  it('errors if path has zero keys (empty mapping)', () => {
    const doc: YValue = { wrapper: {} };
    const result = applyYOps(doc, [{ fold: { path: 'wrapper' } }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('NOT_FOLDABLE');
    expect(result.error?.op_index).toBe(0);
  });

  it('errors if path does not exist', () => {
    const doc: YValue = {};
    const result = applyYOps(doc, [{ fold: { path: 'missing' } }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('NOT_FOLDABLE');
  });
});

// ── merge ─────────────────────────────────────────────────────────────────────

describe('merge', () => {
  it('combines sibling mappings into one', () => {
    const doc: YValue = {
      config: {
        db: { host: 'localhost', port: 5432 },
        app: { name: 'myapp', debug: true },
      },
    };
    const result = applyYOps(doc, [{
      merge: { path: 'config', keys: ['db', 'app'], into: 'combined' },
    }]);
    expect(result.ok).toBe(true);
    expect(result.applied).toBe(1);
    const cfg = (result.doc as any).config;
    expect(cfg.combined).toEqual({ host: 'localhost', port: 5432, name: 'myapp', debug: true });
    expect(cfg.db).toBeUndefined();
    expect(cfg.app).toBeUndefined();
    // original untouched
    expect((doc as any).config.db).toBeDefined();
  });

  it('last wins on key conflicts', () => {
    const doc: YValue = {
      root: {
        first: { x: 1, shared: 'from_first' },
        second: { y: 2, shared: 'from_second' },
      },
    };
    const result = applyYOps(doc, [{
      merge: { path: 'root', keys: ['first', 'second'], into: 'merged' },
    }]);
    expect(result.ok).toBe(true);
    const merged = (result.doc as any).root.merged;
    expect(merged.shared).toBe('from_second'); // last wins
    expect(merged.x).toBe(1);
    expect(merged.y).toBe(2);
  });

  it('errors if path is not a mapping', () => {
    const doc: YValue = { items: [1, 2, 3] };
    const result = applyYOps(doc, [{
      merge: { path: 'items', keys: ['0', '1'], into: 'merged' },
    }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('NOT_A_MAPPING');
    expect(result.error?.op_index).toBe(0);
  });

  it('errors if a listed key does not exist', () => {
    const doc: YValue = { config: { db: { host: 'localhost' } } };
    const result = applyYOps(doc, [{
      merge: { path: 'config', keys: ['db', 'missing'], into: 'combined' },
    }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('PATH_NOT_FOUND');
    expect(result.error?.op_index).toBe(0);
  });
});

// ── sort ──────────────────────────────────────────────────────────────────────

describe('sort', () => {
  it('sorts a sequence of scalars ascending (default)', () => {
    const doc: YValue = { items: [3, 1, 4, 1, 5, 9, 2, 6] };
    const result = applyYOps(doc, [{ sort: { path: 'items' } }]);
    expect(result.ok).toBe(true);
    expect(result.applied).toBe(1);
    expect((result.doc as any).items).toEqual([1, 1, 2, 3, 4, 5, 6, 9]);
    // original untouched
    expect((doc as any).items).toEqual([3, 1, 4, 1, 5, 9, 2, 6]);
  });

  it('sorts a sequence of strings ascending', () => {
    const doc: YValue = { tags: ['banana', 'apple', 'cherry'] };
    const result = applyYOps(doc, [{ sort: { path: 'tags', order: 'asc' } }]);
    expect(result.ok).toBe(true);
    expect((result.doc as any).tags).toEqual(['apple', 'banana', 'cherry']);
  });

  it('sorts a sequence descending', () => {
    const doc: YValue = { scores: [10, 30, 20] };
    const result = applyYOps(doc, [{ sort: { path: 'scores', order: 'desc' } }]);
    expect(result.ok).toBe(true);
    expect((result.doc as any).scores).toEqual([30, 20, 10]);
  });

  it('sorts a sequence of mappings by a key', () => {
    const doc: YValue = {
      users: [
        { name: 'charlie', age: 30 },
        { name: 'alice', age: 25 },
        { name: 'bob', age: 28 },
      ],
    };
    const result = applyYOps(doc, [{ sort: { path: 'users', by: 'name' } }]);
    expect(result.ok).toBe(true);
    const users = (result.doc as any).users;
    expect(users[0].name).toBe('alice');
    expect(users[1].name).toBe('bob');
    expect(users[2].name).toBe('charlie');
    // original untouched
    expect((doc as any).users[0].name).toBe('charlie');
  });

  it('sorts by key descending', () => {
    const doc: YValue = {
      users: [
        { name: 'alice', age: 25 },
        { name: 'charlie', age: 30 },
        { name: 'bob', age: 28 },
      ],
    };
    const result = applyYOps(doc, [{ sort: { path: 'users', by: 'age', order: 'desc' } }]);
    expect(result.ok).toBe(true);
    const users = (result.doc as any).users;
    expect(users[0].age).toBe(30);
    expect(users[1].age).toBe(28);
    expect(users[2].age).toBe(25);
  });

  it('errors if path does not exist', () => {
    const doc: YValue = {};
    const result = applyYOps(doc, [{ sort: { path: 'missing' } }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('PATH_NOT_FOUND');
    expect(result.error?.op_index).toBe(0);
  });

  it('errors if path is not a sequence', () => {
    const doc: YValue = { config: { host: 'localhost' } };
    const result = applyYOps(doc, [{ sort: { path: 'config' } }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('NOT_A_SEQUENCE');
    expect(result.error?.op_index).toBe(0);
  });
});

// ── unique ────────────────────────────────────────────────────────────────────

describe('unique', () => {
  it('deduplicates a sequence of scalars (keeps first)', () => {
    const doc: YValue = { items: [1, 2, 1, 3, 2, 4] };
    const result = applyYOps(doc, [{ unique: { path: 'items' } }]);
    expect(result.ok).toBe(true);
    expect(result.applied).toBe(1);
    expect((result.doc as any).items).toEqual([1, 2, 3, 4]);
    // original untouched
    expect((doc as any).items).toEqual([1, 2, 1, 3, 2, 4]);
  });

  it('deduplicates strings', () => {
    const doc: YValue = { tags: ['a', 'b', 'a', 'c', 'b'] };
    const result = applyYOps(doc, [{ unique: { path: 'tags' } }]);
    expect(result.ok).toBe(true);
    expect((result.doc as any).tags).toEqual(['a', 'b', 'c']);
  });

  it('deduplicates by a key field', () => {
    const doc: YValue = {
      users: [
        { name: 'alice', role: 'admin' },
        { name: 'bob', role: 'viewer' },
        { name: 'alice', role: 'editor' }, // duplicate by name
      ],
    };
    const result = applyYOps(doc, [{ unique: { path: 'users', by: 'name' } }]);
    expect(result.ok).toBe(true);
    const users = (result.doc as any).users;
    expect(users).toHaveLength(2);
    expect(users[0].name).toBe('alice');
    expect(users[0].role).toBe('admin'); // keeps first
    expect(users[1].name).toBe('bob');
    // original untouched
    expect((doc as any).users).toHaveLength(3);
  });

  it('errors if path does not exist', () => {
    const doc: YValue = {};
    const result = applyYOps(doc, [{ unique: { path: 'missing' } }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('PATH_NOT_FOUND');
    expect(result.error?.op_index).toBe(0);
  });

  it('errors if path is not a sequence', () => {
    const doc: YValue = { config: { host: 'localhost' } };
    const result = applyYOps(doc, [{ unique: { path: 'config' } }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('NOT_A_SEQUENCE');
    expect(result.error?.op_index).toBe(0);
  });
});

// ── pick ──────────────────────────────────────────────────────────────────────

describe('pick', () => {
  it('keeps only the specified keys in a mapping', () => {
    const doc: YValue = { user: { name: 'alice', email: 'alice@example.com', role: 'admin', age: 30 } };
    const result = applyYOps(doc, [{ pick: { path: 'user', keys: ['name', 'email'] } }]);
    expect(result.ok).toBe(true);
    expect(result.applied).toBe(1);
    expect((result.doc as any).user).toEqual({ name: 'alice', email: 'alice@example.com' });
    // original untouched
    expect((doc as any).user.role).toBe('admin');
  });

  it('keeps all keys if all are listed', () => {
    const doc: YValue = { obj: { a: 1, b: 2 } };
    const result = applyYOps(doc, [{ pick: { path: 'obj', keys: ['a', 'b'] } }]);
    expect(result.ok).toBe(true);
    expect((result.doc as any).obj).toEqual({ a: 1, b: 2 });
  });

  it('results in empty mapping if no listed keys exist', () => {
    const doc: YValue = { obj: { a: 1, b: 2 } };
    const result = applyYOps(doc, [{ pick: { path: 'obj', keys: ['x', 'y'] } }]);
    expect(result.ok).toBe(true);
    expect((result.doc as any).obj).toEqual({});
  });

  it('errors if path is not a mapping', () => {
    const doc: YValue = { items: [1, 2, 3] };
    const result = applyYOps(doc, [{ pick: { path: 'items', keys: ['0'] } }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('NOT_A_MAPPING');
    expect(result.error?.op_index).toBe(0);
  });

  it('errors if path does not exist', () => {
    const doc: YValue = {};
    const result = applyYOps(doc, [{ pick: { path: 'missing', keys: ['a'] } }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('NOT_A_MAPPING');
    expect(result.error?.op_index).toBe(0);
  });
});

// ── omit ──────────────────────────────────────────────────────────────────────

describe('omit', () => {
  it('removes specified keys from a mapping', () => {
    const doc: YValue = { user: { name: 'alice', password: 'secret', role: 'admin' } };
    const result = applyYOps(doc, [{ omit: { path: 'user', keys: ['password'] } }]);
    expect(result.ok).toBe(true);
    expect(result.applied).toBe(1);
    expect((result.doc as any).user).toEqual({ name: 'alice', role: 'admin' });
    // original untouched
    expect((doc as any).user.password).toBe('secret');
  });

  it('is idempotent — no error if key does not exist', () => {
    const doc: YValue = { obj: { a: 1, b: 2 } };
    const result = applyYOps(doc, [{ omit: { path: 'obj', keys: ['missing', 'also_missing'] } }]);
    expect(result.ok).toBe(true);
    expect(result.applied).toBe(1);
    expect((result.doc as any).obj).toEqual({ a: 1, b: 2 });
  });

  it('removes multiple keys', () => {
    const doc: YValue = { obj: { a: 1, b: 2, c: 3, d: 4 } };
    const result = applyYOps(doc, [{ omit: { path: 'obj', keys: ['a', 'c'] } }]);
    expect(result.ok).toBe(true);
    expect((result.doc as any).obj).toEqual({ b: 2, d: 4 });
  });

  it('errors if path is not a mapping', () => {
    const doc: YValue = { items: [1, 2, 3] };
    const result = applyYOps(doc, [{ omit: { path: 'items', keys: ['0'] } }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('NOT_A_MAPPING');
    expect(result.error?.op_index).toBe(0);
  });

  it('errors if path does not exist', () => {
    const doc: YValue = {};
    const result = applyYOps(doc, [{ omit: { path: 'missing', keys: ['a'] } }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('NOT_A_MAPPING');
    expect(result.error?.op_index).toBe(0);
  });
});

// ── Review fix: edge cases ───────────────────────────────────────────────────

describe('nest — ALREADY_EXISTS guard', () => {
  it('errors if wrapper key already exists', () => {
    const doc: YValue = { config: { host: 'x', port: 5432, database: {} } };
    const result = applyYOps(doc, [{
      nest: { path: 'config', keys: ['host', 'port'], under: 'database' },
    }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('ALREADY_EXISTS');
  });
});

describe('split — ALREADY_EXISTS guard', () => {
  it('errors if group name already exists as a non-moved key', () => {
    const doc: YValue = { config: { host: 'x', port: 5432, db: 'existing' } };
    const result = applyYOps(doc, [{
      split: { path: 'config', into: { db: ['host', 'port'] } },
    }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('ALREADY_EXISTS');
  });
});

describe('merge — NOT_A_MAPPING guard', () => {
  it('errors if a listed key is not a mapping', () => {
    const doc: YValue = { config: { a: { x: 1 }, b: 'scalar' } };
    const result = applyYOps(doc, [{
      merge: { path: 'config', keys: ['a', 'b'], into: 'merged' },
    }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('NOT_A_MAPPING');
  });
});
