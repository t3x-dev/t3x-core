import type { SourcedYOp, ValidationTurn } from '@t3x-dev/core';
import { describe, expect, it } from 'vitest';
import { YOpsReplayError } from '@/commands/yops/errors';
import { replay } from '../replay';

const turns: ValidationTurn[] = [{ turn_hash: 'sha256:t1', content: 'Budget is $10k.' }];

const humanSrc = (at = '2026-04-12T00:00:00Z') => ({ type: 'human' as const, author: 'ethan', at });

const opsA: SourcedYOp[] = [
  { define: { path: 'trip' }, source: humanSrc('2026-04-12T00:00:00Z') },
  {
    populate: { path: 'trip', values: { budget: '10k' } },
    source: humanSrc('2026-04-12T00:00:01Z'),
  },
];

describe('replay', () => {
  it('produces empty tree for no ops', () => {
    const { tree, sourceIndex } = replay([], turns);
    expect(tree.trees).toEqual([]);
    expect(tree.relations).toEqual([]);
    expect(sourceIndex.size).toBe(0);
  });

  it('is deterministic — same inputs produce same outputs', () => {
    const r1 = replay(opsA, turns);
    const r2 = replay(opsA, turns);
    expect(r1.tree).toEqual(r2.tree);
    expect([...r1.sourceIndex.entries()].sort()).toEqual([...r2.sourceIndex.entries()].sort());
  });

  it('indexes source by op path (define)', () => {
    const { sourceIndex } = replay(opsA, turns);
    expect(sourceIndex.has('trip')).toBe(true);
    expect(sourceIndex.get('trip')?.type).toBe('human');
  });

  it('indexes source by op path (set)', () => {
    const ops: SourcedYOp[] = [
      { define: { path: 'x' }, source: humanSrc() },
      { set: { path: 'x/k', value: 'v' }, source: humanSrc('2026-04-12T00:00:01Z') },
    ];
    const { sourceIndex } = replay(ops, turns);
    expect(sourceIndex.get('x/k')?.type).toBe('human');
  });

  it('later op overwrites earlier source at same path', () => {
    const ops: SourcedYOp[] = [
      { define: { path: 'x' }, source: humanSrc() },
      {
        set: { path: 'x/k', value: '1' },
        source: { type: 'human', author: 'alice', at: '2026-04-12T00:00:01Z' },
      },
      {
        set: { path: 'x/k', value: '2' },
        source: { type: 'human', author: 'bob', at: '2026-04-12T00:00:02Z' },
      },
    ];
    const { sourceIndex } = replay(ops, turns);
    const src = sourceIndex.get('x/k');
    expect(src?.type).toBe('human');
    expect((src as { author: string }).author).toBe('bob');
  });

  it('indexes move target path', () => {
    const ops: SourcedYOp[] = [
      { define: { path: 'a' }, source: humanSrc() },
      { populate: { path: 'a', values: { k: 'v' } }, source: humanSrc() },
      { move: { from: 'a', to: 'b' }, source: humanSrc('2026-04-12T00:00:02Z') },
    ];
    const { sourceIndex } = replay(ops, turns);
    expect(sourceIndex.has('b')).toBe(true);
  });

  it('indexes rename target path', () => {
    const ops: SourcedYOp[] = [
      { define: { path: 'old_name' }, source: humanSrc() },
      { rename: { path: 'old_name', to: 'new_name' }, source: humanSrc('2026-04-12T00:00:01Z') },
    ];
    const { sourceIndex } = replay(ops, turns);
    expect(sourceIndex.has('new_name')).toBe(true);
  });

  it('throws when engine fails instead of returning partial apply', () => {
    // Invalid: populate on a path that doesn't exist
    const ops: SourcedYOp[] = [
      { define: { path: 'ok' }, source: humanSrc() },
      {
        populate: { path: 'nonexistent', values: { k: 'v' } },
        source: humanSrc('2026-04-12T00:00:01Z'),
      },
    ];
    expect(() => replay(ops, turns)).toThrow(YOpsReplayError);
  });
});
