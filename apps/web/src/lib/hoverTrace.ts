/**
 * Hover Trace — bidirectional mapping between YAML tree and conversation text.
 *
 * YAML → Chat: given a hovered YAML path + slot, find the source turn and quote text
 * Chat → YAML: given a hovered turn index, find all YAML paths sourced from that turn
 */

import type { SemanticContent, TreeNode } from '@t3x-dev/core';

// ── YAML → Chat direction ──

export interface TraceResult {
  /** Which turn this came from (1-based: T1, T2, ...) */
  sourceTurnIndex: number | null;
  /** The verbatim quote from slot_quotes */
  quote: string | null;
  /** All quotes if hovering a node header */
  allQuotes: string[];
}

/**
 * Given a hovered YAML path and optional slot key, find the source turn and quote.
 */
export function traceYamlToChat(
  draft: SemanticContent,
  hoveredPath: string,
  hoveredSlotKey: string | null
): TraceResult {
  // Collect all slot_quotes from the tree (they may be on root with dot-path keys)
  const allQuotesMap: Record<string, string> = {};
  for (const tree of draft.trees) {
    collectQuotes(tree, '', allQuotesMap);
  }

  // Find the source turn for this path — walk up ancestors if node has no source
  const sourceTurnIndex = findSourceTurn(draft, hoveredPath);

  // Normalize path to dot notation for quote lookup
  const dotPath = hoveredPath.replace(/\//g, '.');

  if (hoveredSlotKey) {
    // Specific slot — try multiple key formats
    const quote =
      allQuotesMap[hoveredSlotKey] ??
      allQuotesMap[`${dotPath}.${hoveredSlotKey}`] ??
      allQuotesMap[stripRoot(dotPath) + '.' + hoveredSlotKey] ??
      null;
    return { sourceTurnIndex, quote, allQuotes: quote ? [quote] : [] };
  }

  // Node header — find all quotes under this path
  const prefix = stripRoot(dotPath);
  const matchingQuotes: string[] = [];
  for (const [key, value] of Object.entries(allQuotesMap)) {
    if (prefix && (key.startsWith(prefix + '.') || key === prefix)) {
      matchingQuotes.push(value);
    } else if (!prefix && !key.includes('.')) {
      // Root level slots
      matchingQuotes.push(value);
    }
  }

  return { sourceTurnIndex, quote: null, allQuotes: matchingQuotes };
}

// ── Chat → YAML direction ──

/**
 * Given a turn index (1-based), find all YAML paths sourced from that turn.
 */
export function traceChatToYaml(
  draft: SemanticContent,
  turnIndex: number
): string[] {
  const tag = `T${turnIndex}`;
  const paths: string[] = [];

  function walk(node: TreeNode, parentPath: string, inheritedSource: string | undefined) {
    const path = parentPath ? `${parentPath}/${node.key}` : node.key;
    const effectiveSource = node.source ?? inheritedSource;
    if (effectiveSource === tag) {
      paths.push(path);
    }
    for (const child of node.children) {
      walk(child, path, effectiveSource);
    }
  }

  for (const tree of draft.trees) {
    walk(tree, '', undefined);
  }

  return paths;
}

// ── Helpers ──

function collectQuotes(node: TreeNode, prefix: string, out: Record<string, string>) {
  if (node.slot_quotes) {
    for (const [k, v] of Object.entries(node.slot_quotes)) {
      const fullKey = prefix ? `${prefix}.${k}` : k;
      out[fullKey] = v;
      out[k] = v; // also without prefix for direct lookup
    }
  }
  for (const child of node.children) {
    collectQuotes(child, prefix ? `${prefix}.${child.key}` : child.key, out);
  }
}

/**
 * Find the source turn index for a path — walks up ancestors if the exact node has no source.
 */
function findSourceTurn(draft: SemanticContent, path: string): number | null {
  const segments = path.replace(/\//g, '.').split('.');
  for (const tree of draft.trees) {
    if (tree.key === segments[0]) {
      // Walk down, tracking the last node that had a source
      let node: TreeNode = tree;
      let lastSource = parseSourceTag(tree.source);
      for (let i = 1; i < segments.length; i++) {
        const child = node.children.find((c) => c.key === segments[i]);
        if (!child) break;
        node = child;
        if (node.source) {
          lastSource = parseSourceTag(node.source);
        }
      }
      // If the exact node has a source, use it; otherwise use nearest ancestor's
      return parseSourceTag(node.source) ?? lastSource;
    }
  }
  return null;
}

function findNodeByPath(draft: SemanticContent, path: string): TreeNode | null {
  const segments = path.replace(/\//g, '.').split('.');
  for (const tree of draft.trees) {
    if (tree.key === segments[0]) {
      let node: TreeNode = tree;
      for (let i = 1; i < segments.length; i++) {
        const child = node.children.find((c) => c.key === segments[i]);
        if (!child) return node; // return closest ancestor
        node = child;
      }
      return node;
    }
  }
  return null;
}

function parseSourceTag(source: string | undefined): number | null {
  if (!source) return null;
  const match = source.match(/^T(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

function stripRoot(dotPath: string): string {
  const idx = dotPath.indexOf('.');
  return idx === -1 ? '' : dotPath.slice(idx + 1);
}
