/**
 * DDL Operations Tests: define, drop, rename
 */

import { describe, it, expect } from 'vitest';
import { applyYOps } from '../src/engine';
import type { YValue } from '../src/types';

// ── define ──────────────────────────────────────────────────────────────────

describe('define', () => {
  it('creates an empty mapping at a path', () => {
    const doc: YValue = { config: { host: 'localhost' } };
    const result = applyYOps(doc, [{ define: { path: 'database' } }]);
    expect(result.ok).toBe(true);
    expect(result.applied).toBe(1);
    expect((result.doc as any).database).toEqual({});
    // original untouched
    expect((doc as any).database).toBeUndefined();
  });

  it('creates nested intermediate mappings', () => {
    const doc: YValue = {};
    const result = applyYOps(doc, [{ define: { path: 'a/b/c' } }]);
    expect(result.ok).toBe(true);
    expect((result.doc as any).a.b.c).toEqual({});
  });

  it('errors if path already exists', () => {
    const doc: YValue = { config: { host: 'localhost' } };
    const result = applyYOps(doc, [{ define: { path: 'config' } }]);
    expect(result.ok).toBe(false);
    expect(result.applied).toBe(0);
    expect(result.error?.code).toBe('ALREADY_EXISTS');
    expect(result.error?.op_index).toBe(0);
  });
});

// ── drop ────────────────────────────────────────────────────────────────────

describe('drop', () => {
  it('removes a key and its subtree', () => {
    const doc: YValue = { config: { host: 'localhost', port: 5432 }, name: 'app' };
    const result = applyYOps(doc, [{ drop: { path: 'config' } }]);
    expect(result.ok).toBe(true);
    expect(result.applied).toBe(1);
    expect((result.doc as any).config).toBeUndefined();
    expect((result.doc as any).name).toBe('app');
    // original untouched
    expect((doc as any).config).toBeDefined();
  });

  it('removes a nested key', () => {
    const doc: YValue = { config: { host: 'localhost', port: 5432 } };
    const result = applyYOps(doc, [{ drop: { path: 'config/port' } }]);
    expect(result.ok).toBe(true);
    expect((result.doc as any).config).toEqual({ host: 'localhost' });
  });

  it('errors if path does not exist', () => {
    const doc: YValue = { config: { host: 'localhost' } };
    const result = applyYOps(doc, [{ drop: { path: 'missing' } }]);
    expect(result.ok).toBe(false);
    expect(result.applied).toBe(0);
    expect(result.error?.code).toBe('PATH_NOT_FOUND');
    expect(result.error?.op_index).toBe(0);
  });
});

// ── rename ──────────────────────────────────────────────────────────────────

describe('rename', () => {
  it('changes a key name', () => {
    const doc: YValue = { config: { host: 'localhost', port: 5432 }, name: 'app' };
    const result = applyYOps(doc, [{ rename: { path: 'config', to: 'settings' } }]);
    expect(result.ok).toBe(true);
    expect(result.applied).toBe(1);
    expect((result.doc as any).settings).toEqual({ host: 'localhost', port: 5432 });
    expect((result.doc as any).config).toBeUndefined();
    // original untouched
    expect((doc as any).config).toBeDefined();
  });

  it('errors if path does not exist', () => {
    const doc: YValue = { config: { host: 'localhost' } };
    const result = applyYOps(doc, [{ rename: { path: 'missing', to: 'found' } }]);
    expect(result.ok).toBe(false);
    expect(result.applied).toBe(0);
    expect(result.error?.code).toBe('PATH_NOT_FOUND');
  });

  it('errors if target name already exists at same level', () => {
    const doc: YValue = { config: { host: 'localhost' }, settings: { theme: 'dark' } };
    const result = applyYOps(doc, [{ rename: { path: 'config', to: 'settings' } }]);
    expect(result.ok).toBe(false);
    expect(result.applied).toBe(0);
    expect(result.error?.code).toBe('ALREADY_EXISTS');
  });
});

// ── engine: fail-fast & sequential ──────────────────────────────────────────

describe('engine', () => {
  it('executes ops sequentially, each sees previous state', () => {
    const doc: YValue = {};
    const result = applyYOps(doc, [
      { define: { path: 'a' } },
      { define: { path: 'a/b' } },
    ]);
    expect(result.ok).toBe(true);
    expect(result.applied).toBe(2);
    expect((result.doc as any).a.b).toEqual({});
  });

  it('stops at first error (fail-fast)', () => {
    const doc: YValue = { existing: {} };
    const result = applyYOps(doc, [
      { define: { path: 'existing' } }, // fails — ALREADY_EXISTS
      { define: { path: 'new' } },      // never reached
    ]);
    expect(result.ok).toBe(false);
    expect(result.applied).toBe(0);
    expect(result.error?.op_index).toBe(0);
    expect((result.doc as any).new).toBeUndefined();
  });

  it('returns UNKNOWN_OP for unrecognised ops', () => {
    const doc: YValue = {};
    // Cast to bypass TypeScript — simulates future/unknown op at runtime
    const result = applyYOps(doc, [{ frobnicate: {} } as any]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('UNKNOWN_OP');
  });

  it('does not mutate the original document', () => {
    const doc: YValue = { x: 1 };
    applyYOps(doc, [{ define: { path: 'y' } }]);
    expect((doc as any).y).toBeUndefined();
  });
});
