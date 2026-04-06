/**
 * DCL Operations Tests: assert
 */

import { describe, it, expect } from 'vitest';
import { applyYOps } from '../src/index';
import { resolvePath } from '../src/paths';
import type { YValue } from '../src/types';

describe('assert', () => {
  it('passes when value equals expected', () => {
    const doc: YValue = { name: 'alice', age: 30 };
    const result = applyYOps(doc, [{ assert: { path: 'name', equals: 'alice' } }]);
    expect(result.ok).toBe(true);
    expect(result.applied).toBe(1);
    expect(result.doc).toEqual(doc);
  });

  it('fails when value does not equal expected (ASSERTION_FAILED)', () => {
    const doc: YValue = { name: 'alice' };
    const result = applyYOps(doc, [{ assert: { path: 'name', equals: 'bob' } }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('ASSERTION_FAILED');
    expect(result.error?.op_index).toBe(0);
  });

  it('fails with ASSERTION_FAILED when path does not exist for equals', () => {
    const doc: YValue = { name: 'alice' };
    const result = applyYOps(doc, [{ assert: { path: 'missing', equals: 'anything' } }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('ASSERTION_FAILED');
  });

  it('passes when path exists (exists: true)', () => {
    const doc: YValue = { name: 'alice' };
    const result = applyYOps(doc, [{ assert: { path: 'name', exists: true } }]);
    expect(result.ok).toBe(true);
    expect(result.applied).toBe(1);
  });

  it('fails when path does not exist (exists: true → ASSERTION_FAILED)', () => {
    const doc: YValue = { name: 'alice' };
    const result = applyYOps(doc, [{ assert: { path: 'missing', exists: true } }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('ASSERTION_FAILED');
    expect(result.error?.op_index).toBe(0);
  });

  it('passes when path does not exist (exists: false)', () => {
    const doc: YValue = { name: 'alice' };
    const result = applyYOps(doc, [{ assert: { path: 'missing', exists: false } }]);
    expect(result.ok).toBe(true);
    expect(result.applied).toBe(1);
  });

  it('fails when path exists but exists: false', () => {
    const doc: YValue = { name: 'alice' };
    const result = applyYOps(doc, [{ assert: { path: 'name', exists: false } }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('ASSERTION_FAILED');
  });

  it('checks type is mapping', () => {
    const doc: YValue = { config: { host: 'localhost' } };
    const result = applyYOps(doc, [{ assert: { path: 'config', type: 'mapping' } }]);
    expect(result.ok).toBe(true);
    expect(result.applied).toBe(1);
  });

  it('checks type is sequence', () => {
    const doc: YValue = { tags: ['a', 'b', 'c'] };
    const result = applyYOps(doc, [{ assert: { path: 'tags', type: 'sequence' } }]);
    expect(result.ok).toBe(true);
    expect(result.applied).toBe(1);
  });

  it('checks type is scalar', () => {
    const doc: YValue = { name: 'alice', count: 42, active: true, nothing: null };
    const result = applyYOps(doc, [
      { assert: { path: 'name', type: 'scalar' } },
      { assert: { path: 'count', type: 'scalar' } },
      { assert: { path: 'active', type: 'scalar' } },
      { assert: { path: 'nothing', type: 'scalar' } },
    ]);
    expect(result.ok).toBe(true);
    expect(result.applied).toBe(4);
  });

  it('fails type check when wrong type (ASSERTION_FAILED)', () => {
    const doc: YValue = { config: { host: 'localhost' } };
    const result = applyYOps(doc, [{ assert: { path: 'config', type: 'sequence' } }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('ASSERTION_FAILED');
    expect(result.error?.op_index).toBe(0);
  });

  it('fails type check when path does not exist (ASSERTION_FAILED)', () => {
    const doc: YValue = { name: 'alice' };
    const result = applyYOps(doc, [{ assert: { path: 'missing', type: 'mapping' } }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('ASSERTION_FAILED');
  });

  it('no-op when no condition is specified', () => {
    const doc: YValue = { name: 'alice' };
    const result = applyYOps(doc, [{ assert: { path: 'name' } }]);
    expect(result.ok).toBe(true);
    expect(result.applied).toBe(1);
    expect(result.doc).toEqual(doc);
  });

  it('does not mutate the document', () => {
    const doc: YValue = { name: 'alice' };
    applyYOps(doc, [{ assert: { path: 'name', equals: 'alice' } }]);
    expect((doc as any).name).toBe('alice');
  });

  it('stops execution on failure (fail-fast) — assert fails → next set op should NOT apply', () => {
    const doc: YValue = { name: 'alice', count: 0 };
    const result = applyYOps(doc, [
      { assert: { path: 'name', equals: 'bob' } }, // fails
      { set: { path: 'count', value: 999 } },       // never reached
    ]);
    expect(result.ok).toBe(false);
    expect(result.error?.op_index).toBe(0);
    // Verify the set op was NOT applied
    const count = resolvePath(result.doc, 'count');
    expect(count).toBe(0);
  });
});
