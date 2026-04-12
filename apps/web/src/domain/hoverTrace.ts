/**
 * L3 — bidirectional YAML ↔ chat hover traces, derived from sourceIndex.
 *
 * YAML → Chat: given a hovered YAML path + slot, find the source turn index
 *              and quote. Walks ancestors if the exact path isn't indexed.
 * Chat → YAML: given a turn index, list all YAML paths whose source points
 *              at that turn.
 *
 * Pure functions — no store access, no I/O. sourceIndex + turns come from
 * the store at the call site.
 */

import { isLLMSource, type Source } from '@t3x-dev/core';
import { getSlotSource } from './source';

export interface WorkspaceTurn {
  turn_hash: string;
  content: string;
}

export interface TraceResult {
  /** 1-based turn index where the source of this slot/node lives */
  sourceTurnIndex: number | null;
  /** The verbatim quote for the exact slot (null if only a node match) */
  quote: string | null;
  /** All quotes anchored under the hovered path (for node headers) */
  allQuotes: string[];
}

function turnIndexFor(turnHash: string, turns: readonly WorkspaceTurn[]): number | null {
  const i = turns.findIndex((t) => t.turn_hash === turnHash);
  return i === -1 ? null : i + 1;
}

function quoteOf(source: Source): string | null {
  return isLLMSource(source) ? source.turn_ref.quote : null;
}

function turnHashOf(source: Source): string | null {
  return isLLMSource(source) ? source.turn_ref.turn_hash : null;
}

/**
 * Find the source + quote for a hovered YAML location. If a slot key is
 * given, prefer the exact slot's source; otherwise fall back to the node's
 * source (and collect all descendant quotes for "node header" highlighting).
 */
export function traceYamlToChat(
  sourceIndex: Map<string, Source>,
  turns: readonly WorkspaceTurn[],
  hoveredPath: string,
  hoveredSlotKey: string | null
): TraceResult {
  if (hoveredSlotKey) {
    const slotPath = `${hoveredPath}/${hoveredSlotKey}`;
    const src = getSlotSource(sourceIndex, slotPath);
    const hash = src ? turnHashOf(src) : null;
    const quote = src ? quoteOf(src) : null;
    return {
      sourceTurnIndex: hash ? turnIndexFor(hash, turns) : null,
      quote,
      allQuotes: quote ? [quote] : [],
    };
  }

  // Node header hover — find any source under this path (exact or descendants).
  const prefix = `${hoveredPath}/`;
  const descendantQuotes: string[] = [];
  let nodeSource: Source | null = getSlotSource(sourceIndex, hoveredPath);

  for (const [path, src] of sourceIndex) {
    if (path !== hoveredPath && !path.startsWith(prefix)) continue;
    const q = quoteOf(src);
    if (q) descendantQuotes.push(q);
    if (!nodeSource) nodeSource = src;
  }

  const hash = nodeSource ? turnHashOf(nodeSource) : null;
  return {
    sourceTurnIndex: hash ? turnIndexFor(hash, turns) : null,
    quote: null,
    allQuotes: descendantQuotes,
  };
}

/**
 * Reverse trace: list every indexed path whose source points at the given
 * 1-based turn index.
 */
export function traceChatToYaml(
  sourceIndex: Map<string, Source>,
  turns: readonly WorkspaceTurn[],
  turnIndex: number
): string[] {
  const target = turns[turnIndex - 1];
  if (!target) return [];
  const hash = target.turn_hash;

  const paths: string[] = [];
  for (const [path, src] of sourceIndex) {
    if (turnHashOf(src) === hash) paths.push(path);
  }
  return paths;
}
