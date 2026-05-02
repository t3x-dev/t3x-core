/**
 * Adapter: lift the strict `ExtractAndApplyResult` (or any
 * `ExtractionV2PipelineResult`-shaped success/failure pair) into the
 * canonical `ExtractionOutcome` envelope the API exposes on the wire.
 *
 * This adapter exists so callers (the `/v1/extract-yops` route, future
 * MCP tools, tests) consume one stable wire shape without any layer
 * needing to know about the pipeline's internal `ok | failure` shape.
 *
 * Implementation notes:
 * - The pipeline's salvage path (see `pipeline.ts` "Partial-compile
 *   salvage") returns `ok: true` with a marker warning string. We detect
 *   that marker here and promote the result to `kind: 'partial'` with
 *   the original failure code (`compile`) preserved.
 * - Per-item `dropped` tracking is not yet plumbed through the pipeline.
 *   Until it is, `dropped: []` for partial outcomes; the human-readable
 *   record lives in `warnings`. A follow-up PR can populate this.
 * - Warnings on `ok` are intentional: style cap, mode override, and
 *   compiler advisories are non-fatal. Promoting any-warnings → partial
 *   would mis-classify clean successes.
 */

import type { ExtractAndApplyResult } from './extract-and-apply';
import {
  type DroppedExtractionItem,
  type ExtractionOutcome,
  type ExtractionWarning,
  isPartialCompileWarning,
  PARTIAL_COMPILE_SALVAGE_PREFIX,
} from './outcome';
import type { ExtractionV2PipelineResult } from './pipeline';

/**
 * Subset of the pipeline result shape the adapter consumes. Accepting a
 * structural type keeps the adapter usable for both `extractAndApply`
 * (which extends the pipeline result with `snapshot`) and
 * `runExtractionV2Pipeline` directly, without forcing a wider import.
 */
export type ExtractToOutcomeInput = ExtractAndApplyResult | ExtractionV2PipelineResult;

function toWarnings(messages: readonly string[]): ExtractionWarning[] {
  return messages.map((message) => ({ message }));
}

function variantsToOpsByName(
  variants: Extract<ExtractionV2PipelineResult, { ok: true }>['variants']
): Record<string, import('../../t3x-yops/types').SourcedYOp[]> | undefined {
  if (!variants) return undefined;
  const out: Record<string, import('../../t3x-yops/types').SourcedYOp[]> = {};
  for (const [name, plan] of Object.entries(variants)) {
    out[name] = plan.ops;
  }
  return out;
}

export function extractToOutcome(result: ExtractToOutcomeInput): ExtractionOutcome {
  if (!result.ok) {
    return {
      kind: 'failed',
      reason: result.failure.code,
      message: result.failure.message,
      ...(result.failure.details ? { details: result.failure.details } : {}),
    };
  }

  const allWarnings = result.compiled.warnings;
  const partialMarker = allWarnings.find(isPartialCompileWarning);

  if (partialMarker) {
    // Strip the marker prefix to recover the underlying compile failure
    // message; keep the rest of the warnings (style cap, mode notes,
    // compiler advisories) as informational alongside.
    const message = partialMarker.slice(PARTIAL_COMPILE_SALVAGE_PREFIX.length).trim();
    const otherWarnings = allWarnings.filter((w) => !isPartialCompileWarning(w));
    const dropped: DroppedExtractionItem[] = [];

    return {
      kind: 'partial',
      ops: result.compiled.ops,
      warnings: toWarnings(otherWarnings),
      dropped,
      reason: 'compile',
      message,
    };
  }

  const ok: Extract<ExtractionOutcome, { kind: 'ok' }> = {
    kind: 'ok',
    ops: result.compiled.ops,
    warnings: toWarnings(allWarnings),
  };

  const variants = variantsToOpsByName(result.variants);
  if (variants) {
    ok.variants = variants;
  }

  return ok;
}
