import type { TreeNode } from '@t3x-dev/core';

export interface UncoveredRange {
  start: number;
  end: number;
}

/**
 * Given all slot_quotes from trees and a message's text,
 * compute the character ranges that are NOT covered by any quote.
 * Filters out segments < 10 chars and pure whitespace.
 */
export function computeUncoveredRanges(
  messageText: string,
  quotedTexts: string[]
): UncoveredRange[] {
  if (!messageText || quotedTexts.length === 0) return [];

  const covered: Array<{ start: number; end: number }> = [];
  const lowerMessage = messageText.toLowerCase();

  for (const quote of quotedTexts) {
    if (!quote || quote.length < 3) continue;
    const lowerQuote = quote.toLowerCase();
    let from = 0;
    while (from < lowerMessage.length) {
      const idx = lowerMessage.indexOf(lowerQuote, from);
      if (idx === -1) break;
      covered.push({ start: idx, end: idx + quote.length });
      from = idx + quote.length;
    }
  }

  if (covered.length === 0) {
    const trimmed = messageText.trim();
    if (trimmed.length < 10) return [];
    return [{ start: 0, end: messageText.length }];
  }

  // Sort and merge covered ranges
  covered.sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [covered[0]];
  for (let i = 1; i < covered.length; i++) {
    const last = merged[merged.length - 1];
    if (covered[i].start <= last.end) {
      last.end = Math.max(last.end, covered[i].end);
    } else {
      merged.push({ ...covered[i] });
    }
  }

  // Compute gaps
  const uncovered: UncoveredRange[] = [];
  let pos = 0;
  for (const range of merged) {
    if (range.start > pos) {
      uncovered.push({ start: pos, end: range.start });
    }
    pos = range.end;
  }
  if (pos < messageText.length) {
    uncovered.push({ start: pos, end: messageText.length });
  }

  // Filter short or whitespace-only segments
  return uncovered.filter((r) => {
    const text = messageText.slice(r.start, r.end).trim();
    return text.length >= 10;
  });
}

/**
 * Collect all slot_quotes values from trees, grouped by source turn index.
 */
export function collectQuotesByTurn(trees: TreeNode[]): Map<number, string[]> {
  const result = new Map<number, string[]>();

  function walk(node: TreeNode, inheritedTurn: number | null): void {
    const turnIndex = parseSource(node.source) ?? inheritedTurn;

    if (node.slot_quotes && turnIndex != null) {
      const existing = result.get(turnIndex) ?? [];
      for (const quote of Object.values(node.slot_quotes)) {
        if (typeof quote === 'string' && quote.length > 0) {
          existing.push(quote);
        }
      }
      result.set(turnIndex, existing);
    }

    for (const child of node.children ?? []) {
      walk(child, turnIndex);
    }
  }

  for (const tree of trees) {
    walk(tree, null);
  }
  return result;
}

function parseSource(source: string | undefined): number | null {
  if (!source) return null;
  const match = source.match(/^T(\d+)/);
  return match ? Number.parseInt(match[1], 10) : null;
}
