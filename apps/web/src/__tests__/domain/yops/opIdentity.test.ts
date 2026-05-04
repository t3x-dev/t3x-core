import type { SourcedYOp, YOp } from '@t3x-dev/core';
import { describe, expect, it } from 'vitest';
import { buildOpIdentity, stripYOpSource } from '@/domain/yops/opIdentity';

describe('buildOpIdentity', () => {
  it('ignores source metadata', () => {
    const a: SourcedYOp = {
      set: { path: 'trip/destination', value: 'Tokyo' },
      source: { type: 'llm', model: 'gpt-x', at: '2026-01-01T00:00:00.000Z' },
    };
    const b: SourcedYOp = {
      set: { path: 'trip/destination', value: 'Tokyo' },
      source: { type: 'human', author: 'ethan', at: '2026-01-02T00:00:00.000Z' },
    };
    expect(buildOpIdentity(a)).toEqual(buildOpIdentity(b));
  });

  it('changes when the payload changes', () => {
    const tokyo = { set: { path: 'trip/destination', value: 'Tokyo' } } satisfies YOp;
    const kyoto = { set: { path: 'trip/destination', value: 'Kyoto' } } satisfies YOp;
    expect(buildOpIdentity(tokyo)).not.toEqual(buildOpIdentity(kyoto));
  });

  it('sorts object keys before hashing', () => {
    const a = {
      populate: { path: 'trip', values: { b: 2, a: 1 } },
    } satisfies YOp;
    const b = {
      populate: { path: 'trip', values: { a: 1, b: 2 } },
    } satisfies YOp;
    expect(buildOpIdentity(a)).toEqual(buildOpIdentity(b));
  });

  it('returns source-free op body', () => {
    const op: SourcedYOp = {
      define: { path: 'trip' },
      source: { type: 'human', author: 'ethan', at: '2026-01-01T00:00:00.000Z' },
    };
    expect(stripYOpSource(op)).toEqual({ define: { path: 'trip' } });
  });

  it('accepts bare parsed YOps without source metadata', () => {
    const op = { set: { path: 'trip/destination', value: 'Tokyo' } } satisfies YOp;
    expect(buildOpIdentity(op)).toMatchObject({
      kind: 'set',
      primaryPath: 'trip/destination',
    });
  });
});
