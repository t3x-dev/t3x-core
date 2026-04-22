/**
 * extractOp — canonical API orchestration for semantic extraction.
 *
 * This op is the non-streaming extraction boundary used by HTTP callers that
 * need a completed extraction result rather than incremental pipeline events.
 * It delegates to the shared API-side v2 helper and keeps op semantics limited
 * to pipeline envelopes plus a concise step summary.
 */

import type { Operation, PipelineEvent } from '@t3x-dev/core';
import { type ApiExtractionV2Result, runApiExtractionV2 } from '../lib/extraction-v2';
import type { ApiPipelineContext } from './context';

export interface ExtractInput {
  conversationId: string;
  turnHashes?: string[];
  provider?: string;
  model?: string;
  userId?: string;
}

export type ExtractOutput = ApiExtractionV2Result;

function summarizeExtraction(result: ExtractOutput): Record<string, unknown> {
  if (result.ok) {
    return {
      ok: true,
      mode: result.mode,
      op_count: result.ops.length,
      last_turn_hash: result.lastTurnHash,
    };
  }

  return {
    ok: false,
    kind: result.kind,
    failure_code: result.failure?.code,
  };
}

export const extractOp: Operation<ExtractInput, ExtractOutput> = {
  name: 'extract',
  async *run(input: ExtractInput, ctx): AsyncGenerator<PipelineEvent, ExtractOutput> {
    const apiCtx = ctx as ApiPipelineContext;

    yield { type: 'step_start', step: 'extract', timestamp: Date.now() };

    const result = await runApiExtractionV2({
      db: apiCtx.db,
      conversationId: input.conversationId,
      turnHashes: input.turnHashes,
      provider: input.provider,
      model: input.model,
      userId: input.userId,
    });

    yield {
      type: 'step_done',
      step: 'extract',
      data: summarizeExtraction(result),
      timestamp: Date.now(),
    };

    return result;
  },
};
