/**
 * domain/commitContent — pure helpers for reading / summarising a
 * commit's SemanticContent field.
 *
 * v2 §2.2 — pure functions, no React, no I/O. Previously lived in
 * @/infrastructure/commits; components were reaching them through a
 * @/queries/commits re-export (v2 §1 ban). Domain is the right home.
 *
 * Types are narrowed via structural typing so this module does not
 * need to import ApiCommit from infrastructure. Any object with a
 * `content?: SemanticContent | null` field is a valid input.
 */

import type { SemanticContent } from '@t3x-dev/core';

interface CommitWithContent {
  content?: SemanticContent | null;
}

/**
 * Extract SemanticContent from a commit-shaped object.
 * Returns a default empty SemanticContent if the field is missing/null.
 */
export function getSemanticContent(commit: CommitWithContent): SemanticContent {
  return commit.content ?? { trees: [], relations: [] };
}

/**
 * Generate human-readable summary text from a commit's trees.
 * Used by export / insights flows.
 */
export function treeSummaryText(commit: CommitWithContent): string {
  const { trees } = getSemanticContent(commit);
  function flattenNodes(nodes: SemanticContent['trees']): string[] {
    const result: string[] = [];
    for (const node of nodes) {
      const slots = Object.entries(node.slots)
        .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
        .join(', ');
      result.push(`${node.key}: ${slots}`);
      if (node.children.length > 0) {
        result.push(...flattenNodes(node.children));
      }
    }
    return result;
  }
  return flattenNodes(trees).join('. ');
}
