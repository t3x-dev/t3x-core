/**
 * highlightBuilder - Builds colored highlight ranges for source context display
 *
 * Merges node highlights with constraint highlights. Constraint colors override node green.
 */

import type { Constraint } from '@/lib/api';
import type {
  ColoredHighlightRange,
  HighlightColor,
  HighlightRange,
  NodeWithSource,
} from '@/types/sourceContext';

// ═══════════════════════════════════════════════════════════════════════════
// Internal Types
// ═══════════════════════════════════════════════════════════════════════════

export interface NodeWithHighlight {
  node: NodeWithSource;
  turnHash: string;
  highlight: HighlightRange;
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

export function groupNodesByTurn(nodes: NodeWithSource[]): {
  byTurn: Map<string, NodeWithHighlight[]>;
  withoutSource: NodeWithSource[];
} {
  const byTurn = new Map<string, NodeWithHighlight[]>();
  const withoutSource: NodeWithSource[] = [];

  for (const node of nodes) {
    if (!node.source || !node.source.turn_hash) {
      withoutSource.push(node);
      continue;
    }

    const turnHash = node.source.turn_hash;
    const group = byTurn.get(turnHash) || [];
    group.push({
      node,
      turnHash,
      highlight: {
        start: node.source.start_char,
        end: node.source.end_char,
      },
    });
    byTurn.set(turnHash, group);
  }

  return { byTurn, withoutSource };
}

/**
 * Find which node a character offset belongs to within a turn.
 * Returns the node ID or null if not within any node range.
 */
export function findNodeAtTurnOffset(
  offset: number,
  nodeHighlights: NodeWithHighlight[]
): string | null {
  for (const sh of nodeHighlights) {
    if (offset >= sh.highlight.start && offset < sh.highlight.end) {
      return sh.node.id;
    }
  }
  return null;
}

/**
 * Calculate the absolute character offset of a DOM selection point
 * within a container element. Handles text split across <mark> tags.
 */
export function getAbsoluteOffset(container: Node, targetNode: Node, targetOffset: number): number {
  let offset = 0;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (node === targetNode) {
      return offset + targetOffset;
    }
    offset += node.textContent?.length ?? 0;
    node = walker.nextNode();
  }
  return offset + targetOffset;
}

/**
 * Build ColoredHighlightRange[] for a single turn, merging node highlights
 * with constraint highlights. Constraint colors override node green.
 */
export function buildColoredHighlights(
  turnContent: string,
  nodeHighlights: NodeWithHighlight[],
  constraints: Constraint[],
  nodes: NodeWithSource[]
): ColoredHighlightRange[] {
  // Step 1: Find constraint match ranges within this turn
  const constraintRanges: { start: number; end: number; color: HighlightColor }[] = [];

  for (const c of constraints) {
    const color: HighlightColor = c.type === 'require' ? 'deepGreen' : 'deepRed';
    let found = false;

    // Strategy 1: Try linked node first (most precise)
    const linkedId = (c.type === 'require' && c.source_node) || null;
    const linkedByDesc = c.description
      ? nodes.find((s) => c.description?.includes(s.id))?.id
      : null;
    const linkedByReason =
      c.type === 'exclude' && c.reason ? nodes.find((s) => c.reason?.includes(s.id))?.id : null;
    const targetNodeId = linkedId || linkedByDesc || linkedByReason;

    if (targetNodeId) {
      const sh = nodeHighlights.find((s) => s.node.id === targetNodeId);
      if (sh) {
        const nodeText = turnContent.slice(sh.highlight.start, sh.highlight.end);
        let searchFrom = 0;
        while (searchFrom < nodeText.length) {
          const idx = nodeText.indexOf(c.value, searchFrom);
          if (idx === -1) break;
          constraintRanges.push({
            start: sh.highlight.start + idx,
            end: sh.highlight.start + idx + c.value.length,
            color,
          });
          found = true;
          searchFrom = idx + c.value.length;
        }
      }
    }

    // Strategy 2: Search all node ranges in this turn
    if (!found) {
      for (const sh of nodeHighlights) {
        const nodeText = turnContent.slice(sh.highlight.start, sh.highlight.end);
        let searchFrom = 0;
        while (searchFrom < nodeText.length) {
          const idx = nodeText.indexOf(c.value, searchFrom);
          if (idx === -1) break;
          constraintRanges.push({
            start: sh.highlight.start + idx,
            end: sh.highlight.start + idx + c.value.length,
            color,
          });
          found = true;
          searchFrom = idx + c.value.length;
        }
      }
    }

    // Strategy 3: Search entire turn content (last resort, for text between nodes)
    if (!found) {
      let searchFrom = 0;
      while (searchFrom < turnContent.length) {
        const idx = turnContent.indexOf(c.value, searchFrom);
        if (idx === -1) break;
        constraintRanges.push({
          start: idx,
          end: idx + c.value.length,
          color,
        });
        searchFrom = idx + c.value.length;
      }
    }
  }

  // Step 2: Build base green ranges from node highlights
  const baseRanges: { start: number; end: number }[] = nodeHighlights.map((sh) => ({
    start: sh.highlight.start,
    end: sh.highlight.end,
  }));

  // Step 3: Split base green ranges, removing portions covered by constraints
  const result: ColoredHighlightRange[] = [];

  for (const base of baseRanges) {
    // Collect constraint ranges that overlap with this base range
    const overlapping = constraintRanges
      .filter((cr) => cr.start < base.end && cr.end > base.start)
      .sort((a, b) => a.start - b.start);

    if (overlapping.length === 0) {
      // No constraints overlap — entire range stays green
      result.push({ start: base.start, end: base.end, color: 'green' });
      continue;
    }

    // Walk through the base range, filling gaps with green
    let cursor = base.start;
    for (const cr of overlapping) {
      const crStart = Math.max(cr.start, base.start);
      const crEnd = Math.min(cr.end, base.end);

      if (crStart > cursor) {
        result.push({ start: cursor, end: crStart, color: 'green' });
      }
      result.push({ start: crStart, end: crEnd, color: cr.color });
      cursor = Math.max(cursor, crEnd);
    }
    if (cursor < base.end) {
      result.push({ start: cursor, end: base.end, color: 'green' });
    }
  }

  // Step 4: Add constraint ranges not fully inside any node range
  // (from Strategy 3 — full turn content search)
  // Partial overlaps with base ranges may cause duplicate coverage, but
  // TurnBubble's overlap handling (Math.max(rawStart, lastEnd)) resolves this.
  for (const cr of constraintRanges) {
    const insideBase = baseRanges.some((b) => cr.start >= b.start && cr.end <= b.end);
    if (!insideBase) {
      result.push({ start: cr.start, end: cr.end, color: cr.color });
    }
  }

  // Sort by start position
  result.sort((a, b) => a.start - b.start);
  return result;
}
