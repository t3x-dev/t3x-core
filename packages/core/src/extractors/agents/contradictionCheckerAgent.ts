/**
 * Contradiction Checker Agent — CODE
 *
 * ONE job: detect if any tree content might contradict the user's explicit statements.
 * Scans for negative keywords ("avoid", "no", "don't", "skip", "allergic", "not", "hate")
 * in user messages, then checks if matching terms appear in tree slots.
 *
 * KEY PRINCIPLE: NEVER deletes data. Only ADDS a _conflicts metadata slot
 * so the user can review in triage. The user decides what to keep.
 */

import type { SlotValue, TreeNode } from '../../semantic/types';
import type { MeaningAgent, PipelineContext } from '../meaningPipeline';

/** Negative patterns: keyword + captured term */
const NEGATIVE_PATTERNS = [
  /\bavoid(?:ing)?\s+(.+?)(?:\.|,|$)/gi,
  /\bdon'?t\s+(?:want|like|need|go to|visit|eat|use)\s+(.+?)(?:\.|,|$)/gi,
  /\bskip(?:ping)?\s+(.+?)(?:\.|,|$)/gi,
  /\ballergic\s+(?:to\s+)?(.+?)(?:\.|,|$)/gi,
  /\bno\s+(.+?)(?:\.|,|$)/gi,
  /\bhate\s+(.+?)(?:\.|,|$)/gi,
  /\bnot\s+interested\s+in\s+(.+?)(?:\.|,|$)/gi,
];

/** Extract avoided terms from user messages */
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

/** Check if a slot value contains an avoided term */
function slotContainsTerm(value: SlotValue, term: string): boolean {
  const str = typeof value === 'string' ? value.toLowerCase() : JSON.stringify(value).toLowerCase();
  return str.includes(term);
}

/** Scan a tree for conflicts */
function findConflicts(
  node: TreeNode,
  avoidedTerms: string[]
): Array<{ slotKey: string; term: string; value: string }> {
  const conflicts: Array<{ slotKey: string; term: string; value: string }> = [];
  for (const [key, value] of Object.entries(node.slots)) {
    if (key === '_conflicts') continue;
    for (const term of avoidedTerms) {
      if (slotContainsTerm(value, term)) {
        conflicts.push({ slotKey: key, term, value: String(value) });
      }
    }
  }
  return conflicts;
}

export const contradictionCheckerAgent: MeaningAgent = {
  name: 'contradiction_checker',
  description: 'Flag (never delete) content that may contradict user statements',
  usesLLM: false,

  shouldRun(ctx: PipelineContext): boolean {
    if (ctx.meta.mode === 'incremental') return false;
    return ctx.content.trees.length > 0 && ctx.turns.some((t) => t.role === 'user');
  },

  async run(ctx: PipelineContext): Promise<PipelineContext> {
    const userMessages = ctx.turns.filter((t) => t.role === 'user').map((t) => t.content);

    const avoidedTerms = extractAvoidedTerms(userMessages);
    if (avoidedTerms.length === 0) return ctx;

    function flagTree(node: TreeNode): TreeNode {
      const conflicts = findConflicts(node, avoidedTerms);
      const flaggedChildren = node.children.map(flagTree);

      if (conflicts.length === 0) {
        return { ...node, children: flaggedChildren };
      }

      const updatedSlots = { ...node.slots };
      updatedSlots._conflicts = conflicts
        .map((c) => `${c.slotKey} contains "${c.term}" (user wants to avoid)`)
        .join('; ');

      return { ...node, slots: updatedSlots, children: flaggedChildren };
    }

    ctx.content = {
      trees: ctx.content.trees.map(flagTree),
      relations: ctx.content.relations,
    };

    return ctx;
  },
};
