/**
 * L3 command adapter — turns the worker's LLMCall contract into a call
 * against the API's extract-yops endpoint. HTTP happens in L1
 * (infrastructure/llm#postExtractYops); this module stays pure to the
 * command layer so commands/ never contains a literal fetch().
 */

import {
  createExtractionFailure,
  EXTRACTION_FAILURE_CODES,
  type ExtractionFailureCode,
  type ExtractionOutcome,
  type SourcedYOp,
  type ValidationTurn,
} from '@t3x-dev/core';
import { postExtractYops } from '@/infrastructure/llm';
import { ExtractionRequestError } from './errors';
import type {
  ExtractionLLMResult,
  ExtractionPreset,
  ExtractionVariants,
  RetryFailingOp,
} from './types';

export interface CallExtractionLLMInput {
  conversationId: string;
  turns: ValidationTurn[];
  failingOps?: RetryFailingOp[];
  provider?: string;
  model?: string;
  /**
   * Extraction granularity preset. Forwarded to /v1/extract-yops as
   * `preset`. The API maps it to `PRESETS[preset]` and passes the full
   * ExtractionStyleConfig into the v2 pipeline, which prepends a
   * granularity-aware budget block to the system prompt. Omitting
   * `preset` reproduces the historical "no style guidance" call.
   */
  preset?: ExtractionPreset;
}

interface ExtractYopsErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

function isExtractionFailureCode(value: unknown): value is ExtractionFailureCode {
  return (
    typeof value === 'string' && (EXTRACTION_FAILURE_CODES as readonly string[]).includes(value)
  );
}

/**
 * Non-domain HTTP error codes the API now uses for genuine transport /
 * configuration / infrastructure failures. The post-#949 contract keeps
 * these on 4xx/5xx (success:false) so generic client error handlers
 * (retry-after, re-auth, "provider not configured" toast) can branch
 * on HTTP status; pipeline domain failures travel as 200 + kind:'failed'.
 *
 * The worker treats `transport` as retryable, which matches the spirit
 * of these (transient or recoverable-by-config), so we map them all
 * onto the `transport` ExtractionFailureCode rather than inventing a
 * parallel client-side classification.
 */
const NON_DOMAIN_TRANSPORT_API_CODES = new Set([
  'PROVIDER_KEY_MISSING',
  'PROVIDER_UNAVAILABLE',
  'INTERNAL_ERROR',
  'AUTH_ERROR',
  'RATE_LIMITED',
]);

function buildRequestError(
  status: number,
  body: ExtractYopsErrorBody | null,
  fallbackText: string
): ExtractionRequestError {
  const failureCode = body?.error.details?.failure_code;

  if (isExtractionFailureCode(failureCode)) {
    return new ExtractionRequestError(
      createExtractionFailure(failureCode, body?.error.message ?? fallbackText, {
        details: { statusCode: status, ...(body?.error.details ?? {}) },
      }),
      status,
      body?.error.code
    );
  }

  const apiCode = body?.error.code;
  const isTransportApiCode =
    typeof apiCode === 'string' && NON_DOMAIN_TRANSPORT_API_CODES.has(apiCode);
  const fallbackFailure = createExtractionFailure(
    isTransportApiCode || status === 429 || status === 401 || status === 403
      ? 'transport'
      : 'draft_parse',
    body?.error.message ?? fallbackText,
    {
      details: { statusCode: status, ...(body?.error.details ?? {}) },
    }
  );

  return new ExtractionRequestError(fallbackFailure, status, body?.error.code);
}

export async function callExtractionLLM(
  input: CallExtractionLLMInput
): Promise<ExtractionLLMResult> {
  // `failingOps` is intentionally NOT forwarded to the server. The v2
  // `extractAndApply` pipeline owns retry semantics internally and the
  // server schema no longer accepts a surgical-retry payload. The
  // worker still passes failingOps in for *client-side* logging /
  // failure-classification (see extractionWorker.ts), but the wire
  // payload is just turns + provider + model.
  const res = await postExtractYops({
    conversation_id: input.conversationId,
    turns: input.turns,
    ...(input.provider ? { provider: input.provider } : {}),
    ...(input.model ? { model: input.model } : {}),
    ...(input.preset ? { preset: input.preset } : {}),
  });

  let parsedBody: unknown;
  try {
    parsedBody = await res.json();
  } catch {
    parsedBody = null;
  }

  if (!res.ok) {
    const text =
      parsedBody && typeof parsedBody === 'object'
        ? JSON.stringify(parsedBody)
        : await res.text().catch(() => '');
    throw buildRequestError(
      res.status,
      parsedBody && typeof parsedBody === 'object' ? (parsedBody as ExtractYopsErrorBody) : null,
      `extract-yops HTTP ${res.status}: ${text}`
    );
  }
  const body = parsedBody as { success: true; data: ExtractionOutcome } | ExtractYopsErrorBody;
  if (!body.success) {
    throw buildRequestError(
      res.status,
      body,
      `extract-yops ${body.error.code}: ${body.error.message}`
    );
  }

  // 200 envelope carries an ExtractionOutcome discriminator. `failed`
  // means the pipeline ran but couldn't produce a usable result —
  // surface as ExtractionRequestError so the worker / UI flow handles
  // it the same way it handles a 4xx-class failure today. `partial`
  // and `ok` both yield ops; partial-vs-ok UX is a follow-up PR (PR 2)
  // and the warnings are logged here so they don't silently disappear.
  const outcome = body.data;
  if (outcome.kind === 'failed') {
    throw new ExtractionRequestError(
      createExtractionFailure(outcome.reason as ExtractionFailureCode, outcome.message, {
        details: { statusCode: 200, ...(outcome.details ?? {}) },
      }),
      200
    );
  }

  if (outcome.kind === 'partial') {
    console.warn('[extract-yops] partial outcome', {
      reason: outcome.reason,
      message: outcome.message,
      droppedCount: outcome.dropped.length,
      warningCount: outcome.warnings.length,
    });
  } else if (outcome.warnings.length > 0) {
    console.info('[extract-yops] non-fatal warnings', {
      warnings: outcome.warnings.map((w) => w.message),
    });
  }

  // For ops shape on the wire, variants come keyed by preset name. The
  // existing `ExtractionVariants` shape is { concise, balanced, detailed }
  // so we narrow the record back to that surface for downstream callers.
  const variants =
    outcome.kind === 'ok' && outcome.variants
      ? (outcome.variants as ExtractionVariants)
      : undefined;

  return {
    ops: outcome.ops as SourcedYOp[],
    ...(variants ? { variants } : {}),
  };
}
