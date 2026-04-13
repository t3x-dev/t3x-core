/**
 * L2 — adapter that turns the worker's LLMCall contract into a call against
 * the API's extract-yops endpoint.
 *
 * NOTE: The exact endpoint (`/v1/extract-yops` or similar) is finalized in
 * Commit 5 when the pipeline rewire lands. For now this module defines the
 * shape; tests mock `fetch`. Component wiring in Commit 5 will pick this up.
 */

import type { FailingOp, SourcedYOp, ValidationTurn } from '@t3x-dev/core';

const API_BASE =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_URL) || 'http://localhost:8000';

export interface CallExtractionLLMInput {
  conversationId: string;
  turns: ValidationTurn[];
  failingOps?: FailingOp[];
}

export async function callExtractionLLM(input: CallExtractionLLMInput): Promise<SourcedYOp[]> {
  const res = await fetch(`${API_BASE}/api/v1/extract-yops`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      conversation_id: input.conversationId,
      turns: input.turns,
      ...(input.failingOps ? { failing_ops: input.failingOps } : {}),
    }),
  });
  if (!res.ok) {
    const text = typeof res.text === 'function' ? await res.text().catch(() => '') : '';
    throw new Error(`extract-yops HTTP ${res.status}: ${text}`);
  }
  const body = (await res.json()) as { ops: SourcedYOp[] };
  return body.ops;
}
