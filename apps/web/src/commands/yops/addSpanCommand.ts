/**
 * L3 — addSpan: ask the LLM where a single user-quoted span should land
 * and return the resulting SourcedYOps.
 *
 * The server's /v1/extract-yops route already replays the committed
 * yops_log into a snapshot and hands it to the extractor with
 * `mode='incremental'`, so the LLM sees the existing tree when it
 * decides placement. We just need to feed it the selected span as a
 * synthetic single-turn payload.
 *
 * Coordinate fix-up: the LLM is shown only the selected substring as
 * the turn's content, so any start_char/end_char it emits are relative
 * to that substring. We shift them by the selection's start offset so
 * they line up with the full turn content once stored.
 */

import type { SourcedYOp } from '@t3x-dev/core';
import { callExtractionLLM } from './llmAdapter';

export interface AddSpanInput {
  conversationId: string;
  turnHash: string;
  /** Full selected substring (verbatim) */
  text: string;
  /** Start offset inside the full turn content */
  start: number;
  /** End offset (exclusive) inside the full turn content */
  end: number;
  provider?: string;
  model?: string;
}

interface TurnRefLike {
  turn_hash?: string;
  quote?: string;
  start_char?: number;
  end_char?: number;
}

/**
 * Shift LLM-reported char offsets from selection-relative to turn-relative.
 * Mutates the op's source.turn_ref in place; returns the op for chaining.
 */
function shiftOffsets(op: SourcedYOp, startOffset: number): SourcedYOp {
  const src = (op as unknown as { source?: { turn_ref?: TurnRefLike } }).source;
  const ref = src?.turn_ref;
  if (!ref) return op;
  if (typeof ref.start_char === 'number') ref.start_char = ref.start_char + startOffset;
  if (typeof ref.end_char === 'number') ref.end_char = ref.end_char + startOffset;
  return op;
}

export async function addSpanAsYOps(input: AddSpanInput): Promise<SourcedYOp[]> {
  const trimmed = input.text.trim();
  if (trimmed.length === 0) return [];

  const ops = await callExtractionLLM({
    conversationId: input.conversationId,
    turns: [{ turn_hash: input.turnHash, content: input.text }],
    ...(input.provider ? { provider: input.provider } : {}),
    ...(input.model ? { model: input.model } : {}),
  });

  for (const op of ops) shiftOffsets(op, input.start);
  return ops;
}
