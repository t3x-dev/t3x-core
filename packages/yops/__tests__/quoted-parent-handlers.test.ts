import { describe, expect, it } from 'vitest';
import { applyYOps } from '../src';

describe('quoted parent path handling', () => {
  it('defines below a key containing a slash', () => {
    const result = applyYOps({ 'db/prod': {} }, [{ define: { path: '"db/prod"/connection' } }]);

    expect(result.ok).toBe(true);
    expect(result.doc).toEqual({ 'db/prod': { connection: {} } });
  });

  it('renames below a key containing a slash', () => {
    const result = applyYOps({ 'db/prod': { old: 1 } }, [
      { rename: { path: '"db/prod"/old', to: 'current' } },
    ]);

    expect(result.ok).toBe(true);
    expect(result.doc).toEqual({ 'db/prod': { current: 1 } });
  });

  it('unsets below a key containing a slash', () => {
    const result = applyYOps({ 'db/prod': { remove: true, keep: true } }, [
      { unset: { path: '"db/prod"/remove' } },
    ]);

    expect(result.ok).toBe(true);
    expect(result.doc).toEqual({ 'db/prod': { keep: true } });
  });

  it('folds below a key containing a slash', () => {
    const result = applyYOps({ 'db/prod': { wrapper: { connection: { port: 5432 } } } }, [
      { fold: { path: '"db/prod"/wrapper' } },
    ]);

    expect(result.ok).toBe(true);
    expect(result.doc).toEqual({ 'db/prod': { connection: { port: 5432 } } });
  });
});
