/**
 * Build committed highlight ranges from commit tree source_refs.
 * Used to show persistent green underlines on conversation text.
 */
import type { ApiCommit } from './api/commits';

export interface CommittedHighlight {
  /** Character start position in turn content */
  start: number;
  /** Character end position */
  end: number;
  /** The extracted knowledge text (slot value) */
  nodeText: string;
  /** Branch this commit belongs to */
  branch: string;
  /** Commit hash (for tooltip display) */
  commitHash: string;
}

interface TreeSlots {
  text?: string;
  source_ref?: {
    conversation_id?: string;
    turn_hash?: string;
    start_char?: number;
    end_char?: number;
  };
  [key: string]: unknown;
}

interface TreeNodeShape {
  key?: string;
  slots?: TreeSlots;
  children?: TreeNodeShape[];
}

/**
 * Walk commit trees and extract all source_refs, grouped by turn_hash.
 */
function walkTrees(
  nodes: TreeNodeShape[],
  commitHash: string,
  branch: string,
  out: Map<string, CommittedHighlight[]>
): void {
  for (const node of nodes) {
    const ref = node.slots?.source_ref;
    if (ref?.turn_hash && typeof ref.start_char === 'number' && typeof ref.end_char === 'number') {
      const nodeText = typeof node.slots?.text === 'string' ? node.slots.text : '';

      const arr = out.get(ref.turn_hash) ?? [];
      arr.push({
        start: ref.start_char,
        end: ref.end_char,
        nodeText,
        branch,
        commitHash,
      });
      out.set(ref.turn_hash, arr);
    }

    if (node.children) {
      walkTrees(node.children, commitHash, branch, out);
    }
  }
}

/**
 * Build committed highlights from a list of commits.
 * Filters commits by conversation source, walks trees, extracts source_refs.
 *
 * @returns Map<turn_hash, CommittedHighlight[]> sorted by start position
 */
export function buildCommittedHighlights(
  commits: ApiCommit[],
  conversationId: string
): Map<string, CommittedHighlight[]> {
  const result = new Map<string, CommittedHighlight[]>();

  const relevant = commits.filter((c) =>
    c.sources?.some((s) => s.type === 'conversation' && s.id === conversationId)
  );

  for (const commit of relevant) {
    const trees = (commit.content?.trees ?? []) as TreeNodeShape[];
    walkTrees(trees, commit.hash, commit.branch, result);
  }

  for (const highlights of result.values()) {
    highlights.sort((a, b) => a.start - b.start);
  }

  return result;
}
