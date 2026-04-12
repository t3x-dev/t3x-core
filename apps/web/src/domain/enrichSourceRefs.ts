/**
 * L3 — pure pre-commit enrichment helper: inject `source_ref` into tree
 * slots so the server stores authoritative provenance alongside the
 * materialized commit.
 *
 * Lives in `queries/` because it is a pure function (deep-clone + index
 * read). The actual commit write happens in commitStore via the commits
 * API; this helper only transforms the payload.
 *
 * Reads provenance straight from `sourceIndex` (produced by replay). No
 * double-dip: the old path walked runtime `slot_quotes`, located quotes in
 * message text to compute char offsets, then wrote them into `source_ref`.
 * The new extraction pipeline already records `{ turn_hash, start_char,
 * end_char }` on every LLMSource, so enrichment is a direct index → tree
 * injection.
 *
 * Only LLMSource entries produce a source_ref; HumanSource entries are
 * skipped (no turn anchor).
 */

import { isLLMSource, type Source, type TreeNode } from '@t3x-dev/core';

export interface SlotSourceRef {
  conversation_id: string;
  turn_hash: string;
  start_char: number;
  end_char: number;
}

type TreeNodeWithSourceRef = TreeNode & {
  slots: TreeNode['slots'] & { source_ref?: SlotSourceRef };
};

function splitNodePath(path: string): string[] {
  return path.split('/').filter((p) => p.length > 0);
}

/**
 * Walk down `trees` along `segments` and return the matching node, or null.
 */
function findNode(trees: TreeNode[], segments: readonly string[]): TreeNode | null {
  if (segments.length === 0) return null;
  let nodes: TreeNode[] = trees;
  let match: TreeNode | null = null;
  for (const key of segments) {
    match = nodes.find((n) => n.key === key) ?? null;
    if (!match) return null;
    nodes = match.children;
  }
  return match;
}

export function enrichTreesWithSourceRefs(
  trees: TreeNode[],
  conversationId: string,
  sourceIndex: Map<string, Source>
): TreeNode[] {
  if (sourceIndex.size === 0) return trees;

  const cloned: TreeNode[] = JSON.parse(JSON.stringify(trees));

  for (const [path, src] of sourceIndex) {
    if (!isLLMSource(src)) continue;
    const ref = src.turn_ref;
    if (ref.start_char == null || ref.end_char == null) continue;

    // Walk to the deepest node on the path. Slot-level sources anchor on
    // their owning node (last segment is the slot key, not a node).
    const segments = splitNodePath(path);
    const nodeSegments =
      segments.length > 1 && !findNode(cloned, segments) ? segments.slice(0, -1) : segments;

    const node = findNode(cloned, nodeSegments) as TreeNodeWithSourceRef | null;
    if (!node) continue;

    // First LLMSource on a given node wins — matches the legacy behaviour
    // where the first slot_quotes match was pinned.
    if (node.slots.source_ref) continue;
    node.slots.source_ref = {
      conversation_id: conversationId,
      turn_hash: ref.turn_hash,
      start_char: ref.start_char,
      end_char: ref.end_char,
    };
  }

  return cloned;
}
