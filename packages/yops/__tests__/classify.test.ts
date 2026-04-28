import { describe, expect, it } from 'vitest';
import { classifyYOp } from '../src/index';
import type { YOp } from '../src/types';

describe('classifyYOp', () => {
  it('classifies plain ops by spec category', () => {
    expect(classifyYOp({ define: { path: 'x' } } as YOp)).toBe('ddl');
    expect(classifyYOp({ set: { path: 'x', value: 1 } } as YOp)).toBe('dml');
    expect(classifyYOp({ sort: { path: 'x' } } as YOp)).toBe('dtl');
    expect(classifyYOp({ assert: { path: 'x', exists: true } } as YOp)).toBe('dcl');
  });

  it('classifies an op even when source appears before the op key', () => {
    // The engine resolves the op key by skipping `source`; the classifier
    // must agree, otherwise an alphabetical-key YAML emitter that puts
    // `source` first ends up with `set` ops that classify as DTL fallback.
    const op = {
      source: { type: 'human', author: 'tester' },
      set: { path: 'x', value: 1 },
    } as unknown as YOp;
    expect(classifyYOp(op)).toBe('dml');
  });

  it('falls back to dtl for an op with no recognisable key', () => {
    expect(classifyYOp({ source: { type: 'human', author: 't' } } as unknown as YOp)).toBe('dtl');
    expect(classifyYOp(null as unknown as YOp)).toBe('dtl');
    expect(classifyYOp({} as unknown as YOp)).toBe('dtl');
  });
});
