/**
 * L3 — build per-turn source-mapping spans from `sourceIndex` + `turns`.
 *
 * Replaces the legacy `lib/sourceMap.ts` which walked denormalized
 * `slot_quotes` on runtime tree nodes. The new extraction pipeline already
 * records `{ turn_hash, quote, start_char, end_char }` on every LLMSource,
 * so we just flip the index: for each indexed path, emit a `SourceMapping`
 * keyed by the 1-based turn index that matches the source's `turn_hash`.
 *
 * Pure function. HumanSource entries (no turn_ref) are skipped.
 */

import { isLLMSource, type Source } from '@t3x-dev/core';

export interface WorkspaceTurn {
  turn_hash: string;
  content: string;
}

export interface SourceMapping {
  /** 1-based turn index the source points at */
  turnIndex: number;
  /** Character start inside the turn content */
  start: number;
  /** Character end (exclusive) */
  end: number;
  /** Node path (everything before the last '/') — or the full path for root nodes */
  treePath: string;
  /** Slot key (last path segment) — null when the source targets a node itself */
  slotKey: string | null;
  /** Verbatim quote that produced this mapping */
  quote: string;
}

function splitNodeAndSlot(path: string): [treePath: string, slotKey: string | null] {
  const slash = path.lastIndexOf('/');
  if (slash === -1) return [path, null];
  return [path.slice(0, slash), path.slice(slash + 1)];
}

export function buildSourceMap(
  sourceIndex: Map<string, Source>,
  turns: readonly WorkspaceTurn[]
): Map<number, SourceMapping[]> {
  const turnIndexByHash = new Map<string, number>();
  for (let i = 0; i < turns.length; i++) {
    turnIndexByHash.set(turns[i].turn_hash, i + 1);
  }

  const result = new Map<number, SourceMapping[]>();

  for (const [path, src] of sourceIndex) {
    if (!isLLMSource(src)) continue;
    const ref = src.turn_ref;
    const turnIndex = turnIndexByHash.get(ref.turn_hash);
    if (turnIndex == null) continue;
    if (ref.start_char == null || ref.end_char == null) continue;

    const [treePath, slotKey] = splitNodeAndSlot(path);
    const mapping: SourceMapping = {
      turnIndex,
      start: ref.start_char,
      end: ref.end_char,
      treePath,
      slotKey,
      quote: ref.quote,
    };
    const list = result.get(turnIndex);
    if (list) list.push(mapping);
    else result.set(turnIndex, [mapping]);
  }

  // Stable ordering within a turn for deterministic rendering
  for (const list of result.values()) {
    list.sort((a, b) => a.start - b.start || a.end - b.end);
  }

  return result;
}
