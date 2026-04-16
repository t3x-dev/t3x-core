/**
 * L2 — LLM extraction with deterministic retry loop.
 *
 * Policy (locked): surgical retry payload (only failing ops go back to LLM),
 * budget 2 retries (3 LLM calls max), hard fail on exhaustion. No degraded
 * commit — if we can't produce fully-sourced ops, we surface the error.
 */

import type { FailingOp, SourcedYOp, ValidationTurn } from '@t3x-dev/core';
import { normalizeOpTurnHashes, repairOpQuotes, validateSource } from '@t3x-dev/core';
import { ExtractionFailedError } from './errors';
import { commitOps } from './yopsService';

const MAX_RETRIES = 2;

export interface LLMCallInput {
  turns: ValidationTurn[];
  /** Present on retry — failing ops from the previous attempt, for surgical repair */
  failingOps?: FailingOp[];
}

export type LLMCall = (input: LLMCallInput) => Promise<SourcedYOp[]>;

export interface ExtractionInput {
  conversationId: string;
  turns: ValidationTurn[];
  llm: LLMCall;
}

function pickReason(failingOps: FailingOp[]): ExtractionFailedError['reason'] {
  if (failingOps.every((f) => f.reason === 'unverifiable_quote')) return 'unverifiable_quote';
  if (failingOps.every((f) => f.reason === 'missing_source')) return 'missing_source';
  return 'exhausted_retries';
}

export async function runExtraction({
  conversationId,
  turns,
  llm,
}: ExtractionInput): Promise<void> {
  let attempt = 0;
  let prevFailing: FailingOp[] | undefined;

  while (true) {
    let ops: SourcedYOp[];
    try {
      ops = await llm({ turns, failingOps: prevFailing });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new ExtractionFailedError([], attempt, 'llm_error', msg);
    }

    normalizeOpTurnHashes(ops, turns);
    repairOpQuotes(ops, turns);
    const result = validateSource(ops, turns);
    if (result.ok) {
      await commitOps(conversationId, ops);
      return;
    }

    attempt++;
    prevFailing = result.failingOps;

    if (attempt > MAX_RETRIES) {
      throw new ExtractionFailedError(result.failingOps, attempt, pickReason(result.failingOps));
    }
  }
}
