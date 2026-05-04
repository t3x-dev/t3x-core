import type { HumanSource, SourcedYOp, YOp } from '@t3x-dev/core';
import { describe, expect, it } from 'vitest';
import { reconcileScriptSources } from '@/domain/yops/sourceReconciliation';

const llmSource = {
  type: 'llm',
  model: 'gpt-test',
  at: '2026-01-01T00:00:00.000Z',
  turn_ref: { turn_hash: 'turn_1', quote: 'Tokyo', start_char: 0, end_char: 5 },
} as const;

const humanSource: HumanSource = {
  type: 'human',
  author: 'ethan',
  at: '2026-01-02T00:00:00.000Z',
  surface: 'script',
};

describe('reconcileScriptSources', () => {
  it('preserves LLM source for unchanged ops and marks changed ops human/script', () => {
    const previous: SourcedYOp[] = [
      { define: { path: 'trip' }, source: llmSource },
      { set: { path: 'trip/destination', value: 'Tokyo' }, source: llmSource },
    ];
    const next: YOp[] = [
      { define: { path: 'trip' } },
      { set: { path: 'trip/destination', value: 'Kyoto' } },
    ];

    const result = reconcileScriptSources(previous, next, humanSource);

    expect(result.ops[0].source).toEqual(llmSource);
    expect(result.ops[1].source).toEqual(humanSource);
    expect(result.summary).toMatchObject({ unchanged: 1, changed: 1, inserted: 0, deleted: 0 });
  });

  it('marks inserted ops human/script', () => {
    const previous: SourcedYOp[] = [{ define: { path: 'trip' }, source: llmSource }];
    const next: YOp[] = [{ define: { path: 'trip' } }, { define: { path: 'trip/hotel' } }];

    const result = reconcileScriptSources(previous, next, humanSource);

    expect(result.ops[0].source).toEqual(llmSource);
    expect(result.ops[1].source).toEqual(humanSource);
    expect(result.summary.inserted).toBe(1);
  });

  it('preserves sources across reorder when identities are unique', () => {
    const previous: SourcedYOp[] = [
      { define: { path: 'trip' }, source: llmSource },
      { define: { path: 'trip/hotel' }, source: humanSource },
    ];
    const next: YOp[] = [{ define: { path: 'trip/hotel' } }, { define: { path: 'trip' } }];

    const result = reconcileScriptSources(previous, next, humanSource);

    expect(result.ops[0].source).toEqual(humanSource);
    expect(result.ops[1].source).toEqual(llmSource);
    expect(result.summary.reordered).toBe(2);
  });

  it('increments reordered for each reordered op', () => {
    const previous: SourcedYOp[] = [
      { define: { path: 'trip' }, source: llmSource },
      { define: { path: 'trip/hotel' }, source: humanSource },
      { define: { path: 'trip/flights' }, source: llmSource },
    ];
    const next: YOp[] = [
      { define: { path: 'trip/flights' } },
      { define: { path: 'trip/hotel' } },
      { define: { path: 'trip' } },
    ];

    const result = reconcileScriptSources(previous, next, humanSource);

    expect(result.summary.reordered).toBe(2);
    expect(result.info.map((entry) => entry.reordered)).toEqual([true, false, true]);
  });

  it('preserves a unique unchanged identity even when old ops share kind and path', () => {
    const previous: SourcedYOp[] = [
      { set: { path: 'trip/destination', value: 'Tokyo' }, source: llmSource },
      { set: { path: 'trip/destination', value: 'Kyoto' }, source: humanSource },
    ];
    const next: YOp[] = [{ set: { path: 'trip/destination', value: 'Tokyo' } }];

    const result = reconcileScriptSources(previous, next, humanSource);

    expect(result.ops[0].source).toEqual(llmSource);
    expect(result.summary).toMatchObject({ unchanged: 1, ambiguous: 0, deleted: 1 });
    expect(result.deleted[0]).toMatchObject({ path: 'trip/destination', previousIndex: 1 });
  });

  it('classifies the remaining one-to-one same-path edit as changed after exact matches', () => {
    const previous: SourcedYOp[] = [
      { set: { path: 'trip/destination', value: 'Tokyo' }, source: llmSource },
      { set: { path: 'trip/destination', value: 'Kyoto' }, source: llmSource },
    ];
    const next: YOp[] = [
      { set: { path: 'trip/destination', value: 'Tokyo' } },
      { set: { path: 'trip/destination', value: 'Osaka' } },
    ];

    const result = reconcileScriptSources(previous, next, humanSource);

    expect(result.ops[0].source).toEqual(llmSource);
    expect(result.ops[1].source).toEqual(humanSource);
    expect(result.info.map((entry) => entry.kind)).toEqual(['unchanged', 'changed']);
    expect(result.summary).toMatchObject({ unchanged: 1, changed: 1, ambiguous: 0, deleted: 0 });
    expect(result.summary.changedPaths).toEqual(['trip/destination']);
  });

  it('leaves surplus duplicate previous identities to be summarized as deleted', () => {
    const previous: SourcedYOp[] = [
      { define: { path: 'trip' }, source: llmSource },
      { define: { path: 'trip' }, source: llmSource },
    ];
    const next: YOp[] = [{ define: { path: 'trip' } }];

    const result = reconcileScriptSources(previous, next, humanSource);

    expect(result.ops[0].source).toEqual(humanSource);
    expect(result.summary).toMatchObject({ ambiguous: 1, deleted: 1 });
    expect(result.deleted).toHaveLength(1);
    expect(result.deleted[0]).toMatchObject({ path: 'trip' });
  });

  it('increments reordered for changed ops when the matched previous index differs', () => {
    const previous: SourcedYOp[] = [
      { define: { path: 'trip' }, source: llmSource },
      { set: { path: 'trip/destination', value: 'Tokyo' }, source: llmSource },
    ];
    const next: YOp[] = [
      { set: { path: 'trip/destination', value: 'Kyoto' } },
      { define: { path: 'trip' } },
    ];

    const result = reconcileScriptSources(previous, next, humanSource);

    expect(result.info.map((entry) => entry.kind)).toEqual(['changed', 'unchanged']);
    expect(result.info.map((entry) => entry.reordered)).toEqual([true, true]);
    expect(result.summary).toMatchObject({ changed: 1, unchanged: 1, reordered: 2 });
  });

  it('marks ambiguous duplicate identities as human/script', () => {
    const previous: SourcedYOp[] = [
      { define: { path: 'trip' }, source: llmSource },
      { define: { path: 'trip' }, source: llmSource },
    ];
    const next: YOp[] = [{ define: { path: 'trip' } }, { define: { path: 'trip' } }];

    const result = reconcileScriptSources(previous, next, humanSource);

    expect(result.ops.every((op) => op.source === humanSource)).toBe(true);
    expect(result.summary.ambiguous).toBe(2);
  });

  it('summarizes deleted ops without emitting them', () => {
    const previous: SourcedYOp[] = [
      { define: { path: 'trip' }, source: llmSource },
      { define: { path: 'trip/hotel' }, source: llmSource },
    ];
    const next: YOp[] = [{ define: { path: 'trip' } }];

    const result = reconcileScriptSources(previous, next, humanSource);

    expect(result.ops).toHaveLength(1);
    expect(result.deleted).toHaveLength(1);
    expect(result.deleted[0]).toMatchObject({ path: 'trip/hotel', previousIndex: 1 });
    expect(result.summary.deleted).toBe(1);
    expect(result.summary.deletedPaths).toEqual(['trip/hotel']);
  });
});
