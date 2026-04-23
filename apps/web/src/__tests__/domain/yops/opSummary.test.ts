import type { YOp } from '@t3x-dev/core';
import { describe, expect, it } from 'vitest';
import { summarizeOp, verbOf } from '@/domain/yops/opSummary';

describe('summarizeOp', () => {
  it('describes a define op', () => {
    expect(summarizeOp({ define: { path: 'trip' } } as YOp)).toBe('Created trip');
  });

  it('describes a drop op', () => {
    expect(summarizeOp({ drop: { path: 'sights' } } as YOp)).toBe('Removed sights');
  });

  it('describes a rename op', () => {
    expect(summarizeOp({ rename: { path: 'trip', to: 'journey' } } as YOp)).toBe(
      'Renamed trip → journey'
    );
  });

  it('describes a set op with a nested slot path', () => {
    const op = { set: { path: 'trip/destination', value: 'Hangzhou' } } as YOp;
    expect(summarizeOp(op)).toBe('Set trip.destination to "Hangzhou"');
  });

  it('describes a set op on a root slot', () => {
    const op = { set: { path: 'budget', value: 8000 } } as YOp;
    expect(summarizeOp(op)).toBe('Set budget to 8000');
  });

  it('describes an unset op', () => {
    expect(summarizeOp({ unset: { path: 'trip/notes' } } as YOp)).toBe('Removed trip/notes');
  });

  it('describes a populate op with <=3 keys by listing them', () => {
    const op = {
      populate: { path: 'trip', values: { destination: 'Hangzhou', duration_days: 5 } },
    } as YOp;
    expect(summarizeOp(op)).toBe('Added destination, duration_days to trip');
  });

  it('describes a populate op with >3 keys by counting them', () => {
    const op = {
      populate: {
        path: 'trip',
        values: { a: 1, b: 2, c: 3, d: 4 },
      },
    } as YOp;
    expect(summarizeOp(op)).toBe('Added 4 details to trip');
  });

  it('describes a relate op with source and target', () => {
    const op = { relate: { from: 'budget', to: 'trip', type: 'causes' } } as YOp;
    expect(summarizeOp(op)).toBe('Linked budget → trip (causes)');
  });

  it('falls back to a generic form for less common verbs', () => {
    const op = { sort: { path: 'sights/value' } } as YOp;
    expect(summarizeOp(op)).toBe('Sorted sights/value');
  });

  it('handles an op with no recognised shape', () => {
    expect(summarizeOp({} as YOp)).toBe('unknown operation');
  });
});

describe('verbOf', () => {
  it('returns the verb of the op', () => {
    expect(verbOf({ set: { path: 'a/b', value: 1 } } as YOp)).toBe('set');
    expect(verbOf({ define: { path: 'x' } } as YOp)).toBe('define');
  });

  it('returns unknown for a malformed op', () => {
    expect(verbOf({} as YOp)).toBe('unknown');
  });
});
