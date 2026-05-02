import { describe, expect, it } from 'vitest';
import type { SourcedYOp } from '../../../t3x-yops/types';
import type { ExtractAndApplyResult } from '../extract-and-apply';
import { extractToOutcome } from '../extractToOutcome';
import { createExtractionFailure } from '../failures';
import { PARTIAL_COMPILE_SALVAGE_PREFIX } from '../outcome';
import type { ExtractionDraft } from '../types';

const STUB_TURN_MAP = { T1: 'sha256:t1' };

const STUB_DRAFT: ExtractionDraft = {
  schema: 't3x/extraction-draft',
  version: 1,
  mode: 'bootstrap',
  items: [],
};

const STUB_OP_A = {
  define: { path: 'trip_plan', kind: 'group' },
  source: {
    method: 'llm_extraction',
    model: 'gpt-test',
    extracted_at: '2026-05-02T00:00:00Z',
    turn_ref: { turn_hash: 'sha256:t1', quote: 'q' },
  },
} as unknown as SourcedYOp;

const STUB_OP_B = {
  populate: { path: 'trip_plan', slots: { city: 'Hangzhou' } },
  source: {
    method: 'llm_extraction',
    model: 'gpt-test',
    extracted_at: '2026-05-02T00:00:00Z',
    turn_ref: { turn_hash: 'sha256:t1', quote: 'q' },
  },
} as unknown as SourcedYOp;

function okResult(overrides: {
  ops?: SourcedYOp[];
  warnings?: string[];
  variants?: ExtractAndApplyResult extends infer R
    ? R extends { ok: true; variants?: infer V }
      ? V
      : never
    : never;
}): ExtractAndApplyResult {
  return {
    ok: true,
    draft: STUB_DRAFT,
    compiled: { ops: overrides.ops ?? [], warnings: overrides.warnings ?? [] },
    snapshot: { trees: [], relations: [] },
    turnHashByTag: STUB_TURN_MAP,
    ...(overrides.variants ? { variants: overrides.variants } : {}),
  } as ExtractAndApplyResult;
}

describe('extractToOutcome', () => {
  it('maps clean success to kind:ok with no warnings', () => {
    const outcome = extractToOutcome(okResult({ ops: [STUB_OP_A] }));

    expect(outcome.kind).toBe('ok');
    if (outcome.kind !== 'ok') return;
    expect(outcome.ops).toHaveLength(1);
    expect(outcome.warnings).toEqual([]);
    expect(outcome.variants).toBeUndefined();
  });

  it('preserves non-salvage warnings on kind:ok (style cap, mode advisory, ...)', () => {
    const outcome = extractToOutcome(
      okResult({
        ops: [STUB_OP_A],
        warnings: ['Style cap dropped 3 of 9 items', 'Mode coerced from incremental to bootstrap'],
      })
    );

    expect(outcome.kind).toBe('ok');
    if (outcome.kind !== 'ok') return;
    expect(outcome.warnings).toEqual([
      { message: 'Style cap dropped 3 of 9 items' },
      { message: 'Mode coerced from incremental to bootstrap' },
    ]);
  });

  it('promotes results carrying the salvage marker to kind:partial', () => {
    const outcome = extractToOutcome(
      okResult({
        ops: [STUB_OP_A, STUB_OP_B],
        warnings: [
          'Style cap dropped 1 of 4 items',
          `${PARTIAL_COMPILE_SALVAGE_PREFIX} compile failed for item_2: missing parent define`,
        ],
      })
    );

    expect(outcome.kind).toBe('partial');
    if (outcome.kind !== 'partial') return;
    expect(outcome.reason).toBe('compile');
    expect(outcome.ops).toHaveLength(2);
    expect(outcome.message).toBe('compile failed for item_2: missing parent define');
    // Salvage marker is consumed; sibling warnings stay.
    expect(outcome.warnings).toEqual([{ message: 'Style cap dropped 1 of 4 items' }]);
    expect(outcome.dropped).toEqual([]);
  });

  it('forwards variants on kind:ok keyed by preset name', () => {
    const outcome = extractToOutcome(
      okResult({
        ops: [STUB_OP_A],
        variants: {
          concise: { ops: [STUB_OP_A], warnings: [] },
          balanced: { ops: [STUB_OP_A, STUB_OP_B], warnings: [] },
          detailed: { ops: [STUB_OP_A, STUB_OP_B], warnings: [] },
        } as ReturnType<typeof okResult>['variants'] extends infer V ? V : never,
      })
    );

    expect(outcome.kind).toBe('ok');
    if (outcome.kind !== 'ok') return;
    expect(outcome.variants).toBeDefined();
    expect(Object.keys(outcome.variants ?? {}).sort()).toEqual(['balanced', 'concise', 'detailed']);
    expect(outcome.variants?.balanced).toHaveLength(2);
  });

  it('does not surface variants on partial outcomes even if pipeline returns them', () => {
    // The pipeline shouldn't, but the adapter is the wire's last defence.
    const outcome = extractToOutcome(
      okResult({
        ops: [STUB_OP_A],
        warnings: [`${PARTIAL_COMPILE_SALVAGE_PREFIX} compile failed`],
        variants: {
          concise: { ops: [STUB_OP_A], warnings: [] },
          balanced: { ops: [STUB_OP_A], warnings: [] },
          detailed: { ops: [STUB_OP_A], warnings: [] },
        } as ReturnType<typeof okResult>['variants'] extends infer V ? V : never,
      })
    );

    expect(outcome.kind).toBe('partial');
    if (outcome.kind !== 'partial') return;
    // partial outcome shape has no `variants` key
    expect((outcome as Record<string, unknown>).variants).toBeUndefined();
  });

  it('maps strict failure to kind:failed and preserves details', () => {
    const failure = createExtractionFailure(
      'unverifiable_quote',
      'Could not verify 2 source quotes',
      {
        details: { failingOps: [{ opIndex: 0, path: 'trip_plan', turnTag: 'T1' }] },
      }
    );
    const failedResult: ExtractAndApplyResult = {
      ok: false,
      failure,
      turnHashByTag: STUB_TURN_MAP,
    };

    const outcome = extractToOutcome(failedResult);
    expect(outcome.kind).toBe('failed');
    if (outcome.kind !== 'failed') return;
    expect(outcome.reason).toBe('unverifiable_quote');
    expect(outcome.message).toBe('Could not verify 2 source quotes');
    expect(outcome.details).toEqual({
      failingOps: [{ opIndex: 0, path: 'trip_plan', turnTag: 'T1' }],
    });
  });

  it('omits details field entirely when failure has no details', () => {
    const failure = createExtractionFailure('compile', 'Compile failed: ...');
    const outcome = extractToOutcome({
      ok: false,
      failure,
      turnHashByTag: STUB_TURN_MAP,
    });

    expect(outcome.kind).toBe('failed');
    if (outcome.kind !== 'failed') return;
    expect(outcome.message).toBe('Compile failed: ...');
    expect(outcome).not.toHaveProperty('details');
  });
});
