/**
 * Source Map — precomputes ALL quote positions in ALL messages on page load.
 *
 * Walks the semantic draft trees, collects slot_quotes with their tree paths
 * and source turn tags, then finds each quote in the corresponding message.
 *
 * Used for bidirectional highlighting between YAML panel and chat messages.
 */

import type { SemanticContent, TreeNode } from '@t3x-dev/core';

export interface SourceMapping {
  /** Turn index (1-based) where this quote appears */
  turnIndex: number;
  /** Character start position in the message content */
  start: number;
  /** Character end position */
  end: number;
  /** The YAML tree path this maps to */
  treePath: string;
  /** The slot key (null for node-level) */
  slotKey: string | null;
  /** The verbatim quote text */
  quote: string;
}

interface CollectedQuote {
  treePath: string;
  slotKey: string;
  quote: string;
  turnIndex: number;
}

/**
 * Parse a source tag like "T3" into a 1-based turn index.
 */
function parseSourceTag(source: string | undefined): number | null {
  if (!source) return null;
  const match = source.match(/^T(\d+)/);
  return match ? Number.parseInt(match[1], 10) : null;
}

/**
 * Walk all trees, collecting every slot_quote with its tree path and source turn.
 */
function collectAllQuotes(
  node: TreeNode,
  parentPath: string,
  inheritedTurnIndex: number | null,
  out: CollectedQuote[]
): void {
  const path = parentPath ? `${parentPath}/${node.key}` : node.key;
  const nodeTurnIndex = parseSourceTag(node.source) ?? inheritedTurnIndex;

  if (node.slot_quotes && nodeTurnIndex != null) {
    for (const [slotKey, quote] of Object.entries(node.slot_quotes)) {
      if (quote && typeof quote === 'string') {
        out.push({
          treePath: path,
          slotKey,
          quote,
          turnIndex: nodeTurnIndex,
        });
      }
    }
  }

  for (const child of node.children ?? []) {
    collectAllQuotes(child, path, nodeTurnIndex, out);
  }
}

/**
 * Build all source mappings by finding slot_quotes in conversation messages.
 * Returns mappings grouped by turn index.
 */
export function buildSourceMap(
  draft: SemanticContent,
  messages: Array<{ content: string; turnIndex: number }>
): Map<number, SourceMapping[]> {
  const result = new Map<number, SourceMapping[]>();

  if (!draft || draft.trees.length === 0 || messages.length === 0) {
    return result;
  }

  // Step 1: collect all quotes from trees
  const allQuotes: CollectedQuote[] = [];
  for (const tree of draft.trees) {
    collectAllQuotes(tree, '', null, allQuotes);
  }

  if (allQuotes.length === 0) return result;

  // Build a lookup: turnIndex → message content (lowercased)
  const messageByTurn = new Map<number, { content: string; lower: string }>();
  for (const msg of messages) {
    messageByTurn.set(msg.turnIndex, {
      content: msg.content,
      lower: msg.content.toLowerCase(),
    });
  }

  // Step 2: find each quote in its corresponding message
  for (const q of allQuotes) {
    const msg = messageByTurn.get(q.turnIndex);
    if (!msg) continue;

    const lowerQuote = q.quote.toLowerCase();
    let searchFrom = 0;

    while (searchFrom < msg.lower.length) {
      const idx = msg.lower.indexOf(lowerQuote, searchFrom);
      if (idx === -1) break;

      const mapping: SourceMapping = {
        turnIndex: q.turnIndex,
        start: idx,
        end: idx + q.quote.length,
        treePath: q.treePath,
        slotKey: q.slotKey,
        quote: q.quote,
      };

      if (!result.has(q.turnIndex)) {
        result.set(q.turnIndex, []);
      }
      result.get(q.turnIndex)!.push(mapping);

      // Only match first occurrence per quote to avoid duplicates
      break;
    }
  }

  // Sort mappings within each turn by start position
  for (const mappings of result.values()) {
    mappings.sort((a, b) => a.start - b.start);
  }

  return result;
}
