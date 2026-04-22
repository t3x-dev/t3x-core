/**
 * F10 — Resilient extraction contract.
 *
 * The strict `extractAndApply` variant returns `{ ok: false, failure }` on any
 * failure at any stage. That contract forces callers to branch on success vs.
 * failure and surface "broken" states in the UI.
 *
 * The resilient variant below ALWAYS returns `{ ok: true, ... }`. When the
 * pipeline cannot produce a real extraction, the result carries an empty
 * draft, an empty compiled plan, the unchanged base snapshot, and a
 * `degraded` field that describes what went wrong and at which stage.
 *
 * Callers don't need an if/else on ok; the draft may just happen to be empty
 * with a warning. This meets the product bar: "nearly always get something
 * back, instead of broken" — the user sees an empty result + diagnostic
 * message rather than a hard error.
 *
 * The strict `extractAndApply` stays available for callers that genuinely
 * need to distinguish success from failure (tests, internal retry logic).
 */

import type { SemanticContent } from '../../semantic/types';
import { type ExtractAndApplyInput, extractAndApply } from './extract-and-apply';
import type { ExtractionFailure, ExtractionFailureCode } from './failures';
import type { CompiledMutationPlan, ExtractionDraft } from './types';

export type DegradationStage =
  | 'transport'
  | 'refusal'
  | 'draft_parse'
  | 'draft_schema'
  | 'provenance'
  | 'compile'
  | 'domain_schema'
  | 'apply';

export interface ExtractionDegradation {
  stage: DegradationStage;
  code: ExtractionFailureCode;
  message: string;
  provider?: string;
  rawText?: string;
  /**
   * F14: when a provider explicitly refuses to produce structured output
   * (OpenAI `message.refusal`), the refusal text is the most meaningful
   * thing the UI can surface — far more useful than a generic
   * "extraction failed" message. Populated only on refusal.
   */
  refusalText?: string;
}

export interface ResilientExtractAndApplyResult {
  ok: true;
  draft: ExtractionDraft;
  compiled: CompiledMutationPlan;
  snapshot: SemanticContent;
  turnHashByTag: Record<string, string>;
  /**
   * Present when the pipeline could not produce a real extraction. When
   * present, `draft.items` is empty and `compiled.ops` is empty — the caller
   * still has a safe, non-destructive result to show the user plus a
   * diagnostic describing what failed.
   */
  degraded?: ExtractionDegradation;
}

function inferStage(code: ExtractionFailureCode): DegradationStage {
  switch (code) {
    case 'transport':
    case 'draft_parse':
    case 'draft_schema':
    case 'provenance':
    case 'compile':
    case 'domain_schema':
      return code;
    case 'executable_structure':
      return 'apply';
    default:
      return 'transport';
  }
}

function buildDegradation(failure: ExtractionFailure): ExtractionDegradation {
  const rawText =
    failure.details && typeof failure.details.rawText === 'string'
      ? failure.details.rawText
      : undefined;

  // F14: OpenAI's REFUSAL code (via LLMProviderError → providerCode in
  // failure.details) promotes the stage from generic "transport" to a
  // dedicated "refusal" stage, and the refusal text is carried through
  // for UI surfaces to render verbatim.
  const providerCode =
    failure.details && typeof failure.details.providerCode === 'string'
      ? failure.details.providerCode
      : undefined;
  const refusalText =
    failure.details && typeof failure.details.refusalText === 'string'
      ? failure.details.refusalText
      : undefined;

  if (providerCode === 'REFUSAL' || refusalText) {
    return {
      stage: 'refusal',
      code: failure.code,
      message: failure.message,
      provider: failure.provider,
      rawText,
      refusalText,
    };
  }

  return {
    stage: inferStage(failure.code),
    code: failure.code,
    message: failure.message,
    provider: failure.provider,
    rawText,
  };
}

function buildEmptyDraft(mode: ExtractAndApplyInput['mode'], warning: string): ExtractionDraft {
  return {
    schema: 't3x/extraction-draft',
    version: 1,
    mode,
    items: [],
    warnings: [warning],
  };
}

export async function extractAndApplyResilient(
  input: ExtractAndApplyInput
): Promise<ResilientExtractAndApplyResult> {
  const baseSnapshot: SemanticContent = input.snapshot ?? { trees: [], relations: [] };
  const result = await extractAndApply(input);

  if (result.ok) {
    return {
      ok: true,
      draft: result.draft,
      compiled: result.compiled,
      snapshot: result.snapshot,
      turnHashByTag: result.turnHashByTag,
    };
  }

  const degraded = buildDegradation(result.failure);
  const warning = `Extraction degraded at ${degraded.stage} (${degraded.code}): ${degraded.message}`;

  return {
    ok: true,
    draft: buildEmptyDraft(input.mode, warning),
    compiled: { ops: [], warnings: [warning] },
    snapshot: baseSnapshot,
    turnHashByTag: result.turnHashByTag,
    degraded,
  };
}
