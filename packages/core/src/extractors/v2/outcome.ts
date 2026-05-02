/**
 * Canonical wire envelope for /v1/extract-yops responses.
 *
 * Three outcomes — `ok | partial | failed` — sharing one `ExtractionFailureCode`
 * vocabulary. `partial` exists because the v2 pipeline can salvage a usable
 * subset after exhausting reask budget on a compile failure (see
 * `pipeline.ts` salvage branch). Today that path returns `{ ok: true, ... }`
 * with a marker warning string; this envelope lifts the partial-success
 * signal into a first-class discriminator so clients no longer have to
 * sniff warning text or invent a parallel "degraded" notion.
 *
 * Warnings are orthogonal to outcome kind: `ok` may carry warnings (style
 * cap, mode override, advisory), `partial` always does. Only `partial`
 * promises a salvage explanation in `reason`.
 *
 * `runExtractionV2Pipeline`'s internal `ok|failure` shape is intentionally
 * unchanged — this lives one layer above as an adapter target.
 */

import type { SourcedYOp } from '../../t3x-yops/types';
import type { ExtractionFailureCode } from './failures';

/**
 * Free-form details from the underlying `ExtractionFailure`. Kept as a
 * passthrough `Record` so this PR doesn't invent a per-code typed shape;
 * a follow-up can tighten this if a UI surface needs structured access.
 */
export type FailureDetails = Record<string, unknown>;

/**
 * A draft item that the pipeline dropped during salvage. Populated when
 * salvage tracks per-item drops; until then the array may be empty even
 * for `partial` outcomes (the warning text is the human-readable record).
 */
export interface DroppedExtractionItem {
  /** Draft item id from `ExtractionDraftItem.id`. */
  item_id: string;
  /** Short reason — typically the underlying compile failure message. */
  reason: string;
}

/**
 * A non-fatal advisory the pipeline emits alongside ops. Examples:
 * - "Capped by style: dropping 3 of 9 items"
 * - "Mode coerced from incremental to bootstrap (no baseline)"
 * - Compiler-level advisories from `compileExtractionDraft`.
 */
export interface ExtractionWarning {
  message: string;
}

export type ExtractionOutcome =
  | {
      kind: 'ok';
      ops: SourcedYOp[];
      warnings: ExtractionWarning[];
      /**
       * Optional preset-keyed alternative compilations (e.g. concise /
       * balanced / detailed). Only emitted on clean `ok` — partial and
       * failed outcomes never carry variants.
       */
      variants?: Record<string, SourcedYOp[]>;
    }
  | {
      kind: 'partial';
      ops: SourcedYOp[];
      warnings: ExtractionWarning[];
      dropped: DroppedExtractionItem[];
      reason: ExtractionFailureCode;
      message: string;
      details?: FailureDetails;
    }
  | {
      kind: 'failed';
      reason: ExtractionFailureCode;
      message: string;
      details?: FailureDetails;
    };

/**
 * Salvage path marker. The v2 pipeline's partial-compile salvage emits a
 * warning string with this prefix when it returns `ok:true` after reask
 * exhaustion. The adapter uses this to distinguish a clean `ok` outcome
 * from a salvaged `partial` outcome without reshaping the pipeline's
 * internal return type.
 */
export const PARTIAL_COMPILE_SALVAGE_PREFIX = 'Partial compile after reask exhaustion:';

export function isPartialCompileWarning(message: string): boolean {
  return message.startsWith(PARTIAL_COMPILE_SALVAGE_PREFIX);
}
