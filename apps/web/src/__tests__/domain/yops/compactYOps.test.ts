import type { YOp } from '@t3x-dev/core';
import { describe, expect, it } from 'vitest';
import { compactYOps } from '@/domain/yops/compactYOps';

describe('compactYOps', () => {
  describe('set/unset state machine', () => {
    it('removes set + unset on same path', () => {
      const ops: YOp[] = [{ set: { path: 'a/x', value: 1 } }, { unset: { path: 'a/x' } }];
      expect(compactYOps(ops)).toEqual([]);
    });

    it('keeps last set on same path (last-write-wins)', () => {
      const ops: YOp[] = [{ set: { path: 'a/x', value: 1 } }, { set: { path: 'a/x', value: 2 } }];
      expect(compactYOps(ops)).toEqual([{ set: { path: 'a/x', value: 2 } }]);
    });

    it('keeps last set after set+unset+set', () => {
      const ops: YOp[] = [
        { set: { path: 'a/x', value: 1 } },
        { unset: { path: 'a/x' } },
        { set: { path: 'a/x', value: 3 } },
      ];
      expect(compactYOps(ops)).toEqual([{ set: { path: 'a/x', value: 3 } }]);
    });

    it('keeps one unset after set+unset+unset (second unset targets base)', () => {
      const ops: YOp[] = [
        { set: { path: 'a/x', value: 1 } },
        { unset: { path: 'a/x' } },
        { unset: { path: 'a/x' } },
      ];
      expect(compactYOps(ops)).toEqual([{ unset: { path: 'a/x' } }]);
    });

    it('keeps set when unset comes first (override base)', () => {
      const ops: YOp[] = [{ unset: { path: 'a/x' } }, { set: { path: 'a/x', value: 5 } }];
      expect(compactYOps(ops)).toEqual([{ set: { path: 'a/x', value: 5 } }]);
    });

    it('preserves standalone unset (targets base)', () => {
      const ops: YOp[] = [{ unset: { path: 'a/x' } }];
      expect(compactYOps(ops)).toEqual([{ unset: { path: 'a/x' } }]);
    });

    it('preserves standalone set', () => {
      const ops: YOp[] = [{ set: { path: 'a/x', value: 1 } }];
      expect(compactYOps(ops)).toEqual([{ set: { path: 'a/x', value: 1 } }]);
    });

    it('deduplicates consecutive unsets on same path', () => {
      const ops: YOp[] = [{ unset: { path: 'a/x' } }, { unset: { path: 'a/x' } }];
      expect(compactYOps(ops)).toEqual([{ unset: { path: 'a/x' } }]);
    });
  });

  describe('relate/unrelate state machine', () => {
    it('removes relate + unrelate on same triple', () => {
      const ops: YOp[] = [
        { relate: { from: 'a', to: 'b', type: 'depends' } },
        { unrelate: { from: 'a', to: 'b', type: 'depends' } },
      ];
      expect(compactYOps(ops)).toEqual([]);
    });

    it('keeps relate when unrelate comes first', () => {
      const ops: YOp[] = [
        { unrelate: { from: 'a', to: 'b', type: 'depends' } },
        { relate: { from: 'a', to: 'b', type: 'depends' } },
      ];
      expect(compactYOps(ops)).toEqual([{ relate: { from: 'a', to: 'b', type: 'depends' } }]);
    });

    it('preserves standalone relate', () => {
      const ops: YOp[] = [{ relate: { from: 'a', to: 'b', type: 'depends' } }];
      expect(compactYOps(ops)).toEqual([{ relate: { from: 'a', to: 'b', type: 'depends' } }]);
    });

    it('preserves standalone unrelate', () => {
      const ops: YOp[] = [{ unrelate: { from: 'a', to: 'b', type: 'depends' } }];
      expect(compactYOps(ops)).toEqual([{ unrelate: { from: 'a', to: 'b', type: 'depends' } }]);
    });
  });

  describe('pass-through and ordering', () => {
    it('preserves non-compact ops (define, drop, rename, etc.)', () => {
      const ops: YOp[] = [
        { define: { path: 'hotel' } },
        { rename: { path: 'hotel', to: 'accommodation' } },
      ];
      expect(compactYOps(ops)).toEqual([
        { define: { path: 'hotel' } },
        { rename: { path: 'hotel', to: 'accommodation' } },
      ]);
    });

    it('returns empty array for empty input', () => {
      expect(compactYOps([])).toEqual([]);
    });

    it('returns identical ops when no cancellable pairs exist', () => {
      const ops: YOp[] = [{ set: { path: 'a/x', value: 1 } }, { set: { path: 'b/y', value: 2 } }];
      expect(compactYOps(ops)).toEqual(ops);
    });

    it('handles multiple paths with independent cancellations', () => {
      const ops: YOp[] = [
        { set: { path: 'a/x', value: 1 } },
        { set: { path: 'b/y', value: 2 } },
        { unset: { path: 'a/x' } },
      ];
      expect(compactYOps(ops)).toEqual([{ set: { path: 'b/y', value: 2 } }]);
    });

    it('preserves relative order of surviving ops', () => {
      const ops: YOp[] = [
        { define: { path: 'hotel' } },
        { set: { path: 'a/x', value: 1 } },
        { set: { path: 'b/y', value: 2 } },
        { unset: { path: 'a/x' } },
        { rename: { path: 'hotel', to: 'h' } },
      ];
      expect(compactYOps(ops)).toEqual([
        { define: { path: 'hotel' } },
        { set: { path: 'b/y', value: 2 } },
        { rename: { path: 'hotel', to: 'h' } },
      ]);
    });

    it('interleaved paths: set A, set B, unset A → keep set B only', () => {
      const ops: YOp[] = [
        { set: { path: 'a/x', value: 1 } },
        { set: { path: 'b/y', value: 2 } },
        { unset: { path: 'a/x' } },
      ];
      expect(compactYOps(ops)).toEqual([{ set: { path: 'b/y', value: 2 } }]);
    });

    it('handles mixed set/unset and relate/unrelate in same ops list', () => {
      const ops: YOp[] = [
        { set: { path: 'a/x', value: 1 } },
        { relate: { from: 'a', to: 'b', type: 'depends' } },
        { unset: { path: 'a/x' } },
        { set: { path: 'c/y', value: 2 } },
        { unrelate: { from: 'a', to: 'b', type: 'depends' } },
      ];
      // a/x: set+unset cancel → nothing
      // relate+unrelate cancel → nothing
      // c/y: standalone set → keep
      expect(compactYOps(ops)).toEqual([{ set: { path: 'c/y', value: 2 } }]);
    });
  });
});

// commandStore.compactOps integration tests removed — commandStore was deleted in Task 5.5.
// yops_log is append-only; undo/redo is deferred to a future PR.
// compactYOps unit tests above cover the algorithm directly.
