/**
 * Dedup Checker Agent — LLM
 *
 * ONE job: look at pairs of frames and decide if they're duplicates.
 * Input: two frames
 * Output: "merge" or "keep_separate" + reason
 *
 * Only runs when there are 4+ frames (likely some overlap).
 * Checks pairs with similar types or overlapping slot keys.
 */

import type { LLMProvider } from '../../llm/types';
import type { Frame } from '../../semantic/types';
import { flattenTrees, unflattenToTrees } from '../../semantic/tree';
import type { MeaningAgent, PipelineContext } from '../meaningPipeline';

const SYSTEM_PROMPT = `You check if two semantic frames describe the same concept, are different, or contradict each other.

Rules:
1. "merge" if they describe the SAME thing (even with different names) — output merged slots
2. "keep_separate" if they describe DIFFERENT things
3. "contradicts" if they contain CONFLICTING information (e.g., one says "avoid X" and the other recommends X) — output which frame to keep ("A" or "B"), prefer the one with higher confidence or from the user

Output JSON: { "decision": "merge" | "keep_separate" | "contradicts", "merged_slots": { ... } | null, "keep": "A" | "B" | null }
Output ONLY JSON. No explanation.`;

/** Find candidate pairs that might be duplicates */
function findCandidatePairs(frames: Frame[]): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];

  for (let i = 0; i < frames.length; i++) {
    for (let j = i + 1; j < frames.length; j++) {
      const a = frames[i];
      const b = frames[j];

      // Same type → likely duplicate
      if (a.type === b.type) {
        pairs.push([i, j]);
        continue;
      }

      // Overlapping slot keys → might be duplicate
      const aKeys = new Set(Object.keys(a.slots));
      const bKeys = Object.keys(b.slots);
      const overlap = bKeys.filter((k) => aKeys.has(k)).length;
      if (overlap >= 2) {
        pairs.push([i, j]);
      }
    }
  }

  return pairs;
}

export const dedupCheckerAgent: MeaningAgent = {
  name: 'dedup_checker',
  description: 'Find and merge duplicate frames',
  usesLLM: true,

  shouldRun(ctx: PipelineContext): boolean {
    // Only run if we have 4+ frames (likely some overlap)
    return flattenTrees(ctx.content.trees).length >= 4;
  },

  async run(ctx: PipelineContext, provider: LLMProvider): Promise<PipelineContext> {
    const frames = [...flattenTrees(ctx.content.trees)];
    const pairs = findCandidatePairs(frames);

    if (pairs.length === 0) return ctx;

    const toRemove = new Set<number>();

    for (const [i, j] of pairs) {
      if (toRemove.has(i) || toRemove.has(j)) continue;

      const frameA = frames[i];
      const frameB = frames[j];

      const userPrompt = `Frame A (${frameA.type}): ${JSON.stringify(frameA.slots)}\nFrame B (${frameB.type}): ${JSON.stringify(frameB.slots)}\n\nDecision:`;

      try {
        const result = await provider.generate(`${SYSTEM_PROMPT}\n\n${userPrompt}`, {
          temperature: 0.1,
          maxTokens: 1024,
        });

        ctx.meta.totalUsage.inputTokens += result.usage.inputTokens;
        ctx.meta.totalUsage.outputTokens += result.usage.outputTokens;

        const jsonMatch = result.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as {
            decision: 'merge' | 'keep_separate' | 'contradicts';
            merged_slots?: Record<string, unknown>;
            keep?: 'A' | 'B';
          };

          if (parsed.decision === 'merge' && parsed.merged_slots) {
            // Merge into frame A, mark frame B for removal
            frames[i] = {
              ...frameA,
              slots: parsed.merged_slots as Record<
                string,
                import('../../semantic/types').SlotValue
              >,
              confidence: Math.min(frameA.confidence ?? 1, frameB.confidence ?? 1),
            };
            toRemove.add(j);
          } else if (parsed.decision === 'contradicts') {
            // Keep the frame with higher confidence (user-sourced), remove the other
            if (parsed.keep === 'A') {
              toRemove.add(j);
            } else if (parsed.keep === 'B') {
              toRemove.add(i);
            } else {
              // Default: keep the one with higher confidence
              const confA = frameA.confidence ?? 0.5;
              const confB = frameB.confidence ?? 0.5;
              toRemove.add(confA >= confB ? j : i);
            }
          }
        }
      } catch {
        // Skip this pair if LLM fails
      }
    }

    // Remove merged frames
    if (toRemove.size > 0) {
      ctx.content = {
        trees: unflattenToTrees(frames.filter((_: Frame, idx: number) => !toRemove.has(idx))),
        relations: ctx.content.relations,
      };
    }

    return ctx;
  },
};
