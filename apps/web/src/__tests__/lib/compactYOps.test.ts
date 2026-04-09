import { describe, expect, it } from 'vitest';
import type { YOp } from '@t3x-dev/core';
import { compactYOps } from '@/lib/compactYOps';

describe('compactYOps', () => {
  describe('set/unset state machine', () => {
    it('removes set + unset on same path', () => {
      const ops: YOp[] = [
        { set: { path: 'a/x', value: 1 } },
        { unset: { path: 'a/x' } },
      ];
      expect(compactYOps(ops)).toEqual([]);
    });

    it('keeps last set on same path (last-write-wins)', () => {
      const ops: YOp[] = [
        { set: { path: 'a/x', value: 1 } },
        { set: { path: 'a/x', value: 2 } },
      ];
      expect(compactYOps(ops)).toEqual([
        { set: { path: 'a/x', value: 2 } },
      ]);
    });

    it('keeps last set after set+unset+set', () => {
      const ops: YOp[] = [
        { set: { path: 'a/x', value: 1 } },
        { unset: { path: 'a/x' } },
        { set: { path: 'a/x', value: 3 } },
      ];
      expect(compactYOps(ops)).toEqual([
        { set: { path: 'a/x', value: 3 } },
      ]);
    });

    it('keeps one unset after set+unset+unset (second unset targets base)', () => {
      const ops: YOp[] = [
        { set: { path: 'a/x', value: 1 } },
        { unset: { path: 'a/x' } },
        { unset: { path: 'a/x' } },
      ];
      expect(compactYOps(ops)).toEqual([
        { unset: { path: 'a/x' } },
      ]);
    });

    it('keeps set when unset comes first (override base)', () => {
      const ops: YOp[] = [
        { unset: { path: 'a/x' } },
        { set: { path: 'a/x', value: 5 } },
      ];
      expect(compactYOps(ops)).toEqual([
        { set: { path: 'a/x', value: 5 } },
      ]);
    });

    it('preserves standalone unset (targets base)', () => {
      const ops: YOp[] = [
        { unset: { path: 'a/x' } },
      ];
      expect(compactYOps(ops)).toEqual([
        { unset: { path: 'a/x' } },
      ]);
    });

    it('preserves standalone set', () => {
      const ops: YOp[] = [
        { set: { path: 'a/x', value: 1 } },
      ];
      expect(compactYOps(ops)).toEqual([
        { set: { path: 'a/x', value: 1 } },
      ]);
    });

    it('deduplicates consecutive unsets on same path', () => {
      const ops: YOp[] = [
        { unset: { path: 'a/x' } },
        { unset: { path: 'a/x' } },
      ];
      expect(compactYOps(ops)).toEqual([
        { unset: { path: 'a/x' } },
      ]);
    });
  });
});
