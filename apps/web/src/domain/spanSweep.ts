/**
 * L2 — pure helpers for turning a chat-side text span into a batch of
 * inverse YOps that remove every tree path derived from that span.
 *
 * Used by the Chat-side Remove verb: given the current sourceIndex and a
 * (turnHash, start, end) triple from useTextSelection, find every path
 * whose LLMSource cites an overlapping quote range, then emit `drop`
 * for node paths and `unset` for slot paths — deduping slots whose
 * parent node is already being dropped.
 *
 * Pure. No React, no I/O.
 */

import { isLLMSource, type Source, type YOp } from '@t3x-dev/core';

/** A path touched by a span, with whether it's a node (no '/') or slot. */
export interface SpanMatch {
  path: string;
  /** True when path has no '/' — i.e. a root node, so remove with `drop`. */
  isNode: boolean;
}

/**
 * Find every path in `sourceIndex` whose LLMSource turn matches `turnHash`
 * and whose [start_char, end_char) quote range overlaps [start, end).
 * Non-LLM sources and sources lacking char offsets are skipped.
 */
export function findPathsOverlappingSpan(
  sourceIndex: Map<string, Source>,
  turnHash: string,
  start: number,
  end: number
): SpanMatch[] {
  const matches: SpanMatch[] = [];
  for (const [path, src] of sourceIndex) {
    if (!isLLMSource(src)) continue;
    const ref = src.turn_ref;
    if (ref.turn_hash !== turnHash) continue;
    if (ref.start_char == null || ref.end_char == null) continue;
    // Half-open interval overlap: [a,b) ∩ [c,d) ≠ ∅ iff a < d && c < b.
    if (ref.start_char >= end) continue;
    if (ref.end_char <= start) continue;
    matches.push({ path, isNode: !path.includes('/') });
  }
  return matches;
}

/**
 * Build a minimal set of inverse YOps for a list of matches. Slot paths
 * whose parent node is also being dropped are filtered out (the drop
 * cascades through the engine, so a redundant unset would fail).
 */
export function buildSweepOps(matches: readonly SpanMatch[]): YOp[] {
  const droppedNodes = new Set<string>();
  for (const m of matches) {
    if (m.isNode) droppedNodes.add(m.path);
  }

  const ops: YOp[] = [];
  const seen = new Set<string>();
  for (const m of matches) {
    if (seen.has(m.path)) continue;
    seen.add(m.path);
    if (m.isNode) {
      ops.push({ drop: { path: m.path } } as YOp);
      continue;
    }
    const slash = m.path.indexOf('/');
    const parent = slash === -1 ? m.path : m.path.slice(0, slash);
    if (droppedNodes.has(parent)) continue;
    ops.push({ unset: { path: m.path } } as YOp);
  }
  return ops;
}
