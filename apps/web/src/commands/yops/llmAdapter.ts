/**
 * L3 command adapter — turns the worker's LLMCall contract into a call
 * against the API's extract-yops endpoint. HTTP happens in L1
 * (infrastructure/llm#postExtractYops); this module stays pure to the
 * command layer so commands/ never contains a literal fetch().
 */

import type { SourcedYOp, ValidationTurn } from '@t3x-dev/core';
import { postExtractYops } from '@/infrastructure/llm';
import type { RetryFailingOp } from './types';

export interface CallExtractionLLMInput {
  conversationId: string;
  turns: ValidationTurn[];
  failingOps?: RetryFailingOp[];
}

export async function callExtractionLLM(input: CallExtractionLLMInput): Promise<SourcedYOp[]> {
  const res = await postExtractYops({
    conversation_id: input.conversationId,
    turns: input.turns,
    ...(input.failingOps ? { failing_ops: input.failingOps } : {}),
  });
  if (!res.ok) {
    const text = typeof res.text === 'function' ? await res.text().catch(() => '') : '';
    throw new Error(`extract-yops HTTP ${res.status}: ${text}`);
  }
  const body = (await res.json()) as
    | { success: true; data: { ops: SourcedYOp[] } }
    | { success: false; error: { code: string; message: string } };
  if (!body.success) {
    throw new Error(`extract-yops ${body.error.code}: ${body.error.message}`);
  }
  return body.data.ops;
}
