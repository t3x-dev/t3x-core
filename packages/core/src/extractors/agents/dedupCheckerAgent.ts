/**
 * Dedup Checker Agent — CODE
 *
 * ONE job: find and merge trees with identical keys or high slot overlap.
 * Pure code — no LLM needed. Uses exact key matching + Jaccard similarity.
 *
 * Only runs when there are 4+ trees (likely some overlap).
 */

import type { TreeNode } from '../../semantic/types';
import type { MeaningAgent, PipelineContext } from '../meaningPipeline';

/** Jaccard similarity: |A ∩ B| / |A ∪ B| */
function jaccardKeys(a: Record<string, unknown>, b: Record<string, unknown>): number {
  const aKeys = new Set(Object.keys(a));
  const bKeys = new Set(Object.keys(b));
  let intersection = 0;
  for (const k of bKeys) {
    if (aKeys.has(k)) intersection++;
  }
  const union = aKeys.size + bKeys.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Merge two trees: combine slots (b overwrites a on conflict), combine children */
function mergeTrees(a: TreeNode, b: TreeNode): TreeNode {
  return {
    key: a.key,
    slots: { ...a.slots, ...b.slots },
    children: [...a.children, ...b.children],
    slot_quotes: { ...a.slot_quotes, ...b.slot_quotes },
    source: a.source ?? b.source,
    confidence: Math.max(a.confidence ?? 0.5, b.confidence ?? 0.5),
  };
}

const JACCARD_MERGE_THRESHOLD = 0.8;

export const dedupCheckerAgent: MeaningAgent = {
  name: 'dedup_checker',
  description: 'Find and merge duplicate trees (code-based: exact key + Jaccard similarity)',
  usesLLM: false,

  shouldRun(ctx: PipelineContext): boolean {
    // Run with 2+ trees — even 2 trees can have duplicate keys
    return ctx.content.trees.length >= 2;
  },

  async run(ctx: PipelineContext): Promise<PipelineContext> {
    const trees = [...ctx.content.trees];
    const merged = new Set<number>();

    for (let i = 0; i < trees.length; i++) {
      if (merged.has(i)) continue;
      for (let j = i + 1; j < trees.length; j++) {
        if (merged.has(j)) continue;

        const shouldMerge =
          trees[i].key === trees[j].key ||
          jaccardKeys(trees[i].slots, trees[j].slots) >= JACCARD_MERGE_THRESHOLD;

        if (shouldMerge) {
          trees[i] = mergeTrees(trees[i], trees[j]);
          merged.add(j);
        }
      }
    }

    if (merged.size > 0) {
      ctx.content = {
        trees: trees.filter((_, idx) => !merged.has(idx)),
        relations: ctx.content.relations,
      };
    }

    return ctx;
  },
};
