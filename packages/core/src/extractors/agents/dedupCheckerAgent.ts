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
import type { MeaningAgent, PipelineContext } from '../meaningPipeline';

const SYSTEM_PROMPT = `You check if two semantic frames describe the same concept and should be merged.

Rules:
1. "merge" if they describe the SAME thing (even with different names)
2. "keep_separate" if they describe DIFFERENT things
3. If merging, output the merged slots (union of both)

Output JSON: { "decision": "merge" | "keep_separate", "merged_slots": { ... } | null }
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
    return ctx.content.frames.length >= 4;
  },

  async run(ctx: PipelineContext, provider: LLMProvider): Promise<PipelineContext> {
    const frames = [...ctx.content.frames];
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
            decision: 'merge' | 'keep_separate';
            merged_slots?: Record<string, unknown>;
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
          }
        }
      } catch {
        // Skip this pair if LLM fails
      }
    }

    // Remove merged frames
    if (toRemove.size > 0) {
      ctx.content = {
        ...ctx.content,
        frames: frames.filter((_, idx) => !toRemove.has(idx)),
      };
    }

    return ctx;
  },
};
