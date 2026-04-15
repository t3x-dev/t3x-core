/**
 * Flag Contradictions — detect slots that may contradict user's explicit avoidances.
 *
 * Scans user messages for negative patterns ("avoid X", "don't want Y", "allergic to Z"),
 * then checks if those terms appear in tree slots. Adds _conflicts metadata — never deletes.
 *
 * Pure deterministic transform. No LLM.
 */

import type { SemanticContent, SlotValue, TreeNode } from '../../semantic/types';

const NEGATIVE_PATTERNS = [
  /\bavoid(?:ing)?\s+(.+?)(?:\.|,|$)/gi,
  /\bdon'?t\s+(?:want|like|need|go to|visit|eat|use)\s+(.+?)(?:\.|,|$)/gi,
  /\bskip(?:ping)?\s+(.+?)(?:\.|,|$)/gi,
  /\ballergic\s+(?:to\s+)?(.+?)(?:\.|,|$)/gi,
  /\bno\s+(.+?)(?:\.|,|$)/gi,
  /\bhate\s+(.+?)(?:\.|,|$)/gi,
  /\bnot\s+interested\s+in\s+(.+?)(?:\.|,|$)/gi,
];

function extractAvoidedTerms(userMessages: string[]): string[] {
  const terms: string[] = [];
  for (const msg of userMessages) {
    for (const pattern of NEGATIVE_PATTERNS) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(msg)) !== null) {
        const term = match[1].trim().toLowerCase();
        if (term.length >= 2 && term.length <= 50) {
          terms.push(term);
        }
      }
    }
  }
  return [...new Set(terms)];
}

function slotContainsTerm(value: SlotValue, term: string): boolean {
  const str = typeof value === 'string' ? value.toLowerCase() : JSON.stringify(value).toLowerCase();
  return str.includes(term);
}

function flagTree(node: TreeNode, avoidedTerms: string[]): TreeNode {
  const conflicts: Array<{ slotKey: string; term: string }> = [];
  for (const [key, value] of Object.entries(node.slots)) {
    if (key === '_conflicts') continue;
    for (const term of avoidedTerms) {
      if (slotContainsTerm(value, term)) {
        conflicts.push({ slotKey: key, term });
      }
    }
  }

  const flaggedChildren = node.children.map((c) => flagTree(c, avoidedTerms));

  if (conflicts.length === 0) {
    return { ...node, children: flaggedChildren };
  }

  return {
    ...node,
    slots: {
      ...node.slots,
      _conflicts: conflicts
        .map((c) => `${c.slotKey} contains "${c.term}" (user wants to avoid)`)
        .join('; '),
    },
    children: flaggedChildren,
  };
}

export function flagContradictions(
  content: SemanticContent,
  turns: Array<{ role: string; content: string }>
): SemanticContent {
  const userMessages = turns.filter((t) => t.role === 'user').map((t) => t.content);
  const avoidedTerms = extractAvoidedTerms(userMessages);

  if (avoidedTerms.length === 0) return content;

  return {
    trees: content.trees.map((t) => flagTree(t, avoidedTerms)),
    relations: content.relations,
  };
}
