import { describe, expect, it } from 'vitest';
import { autoFixYOp } from '../../ops/gates/autofix';

describe('autoFixYOp', () => {
  it('strips extra fields from unset (source/from)', () => {
    const raw = {
      unset: {
        path: 'tokyo_trip/accommodation/ryokan',
        source: 'cancel the ryokan idea',
        from: 'T5',
      },
    };

    const result = autoFixYOp(raw);
    expect(result).not.toBeNull();
    expect(result!.fixed).toEqual({
      unset: { path: 'tokyo_trip/accommodation/ryokan' },
    });
    expect(result!.fixes).toContain('stripped extra fields [source, from] from unset');
  });

  it('strips extra fields from drop (source/from)', () => {
    const raw = {
      drop: {
        path: 'tokyo_trip/old_node',
        source: 'remove this',
        from: 'T3',
        reason: 'outdated',
      },
    };

    const result = autoFixYOp(raw);
    expect(result).not.toBeNull();
    expect(result!.fixed).toEqual({
      drop: { path: 'tokyo_trip/old_node', reason: 'outdated' },
    });
  });

  it('replaces . with / in path', () => {
    const raw = {
      unset: { path: 'tokyo_trip.accommodation.ryokan' },
    };

    const result = autoFixYOp(raw);
    expect(result).not.toBeNull();
    expect(result!.fixed).toEqual({
      unset: { path: 'tokyo_trip/accommodation/ryokan' },
    });
    expect(result!.fixes).toContain('replaced . with / in path');
  });

  it('converts camelCase path to snake_case', () => {
    const raw = {
      unset: { path: 'tokyoTrip/accommodation' },
    };

    const result = autoFixYOp(raw);
    expect(result).not.toBeNull();
    expect(result!.fixed).toEqual({
      unset: { path: 'tokyo_trip/accommodation' },
    });
  });

  it('returns null for ops that need no fixing', () => {
    const raw = {
      set: {
        path: 'tokyo_trip/budget',
        value: 7000,
        source: 'increase budget',
        from: 'T5',
      },
    };

    const result = autoFixYOp(raw);
    expect(result).toBeNull();
  });

  it('returns null for unrecognized op type', () => {
    const raw = { unknown_op: { foo: 'bar' } };
    const result = autoFixYOp(raw);
    expect(result).toBeNull();
  });

  it('handles multiple fixes at once', () => {
    const raw = {
      rename: {
        path: 'tokyoTrip.accommodation',
        to: 'lodging',
        source: 'rename it',
        from: 'T5',
      },
    };

    const result = autoFixYOp(raw);
    expect(result).not.toBeNull();
    expect(result!.fixed).toEqual({
      rename: { path: 'tokyo_trip/accommodation', to: 'lodging' },
    });
    expect(result!.fixes.length).toBeGreaterThanOrEqual(2);
  });
});
