/**
 * Slot Polisher Agent — LLM
 *
 * ONE job: clean up slot key names and values in each frame.
 * Makes them human-readable, concise, and consistent.
 *
 * Examples:
 * - "travel_dates_and_season" → "preferred_season"
 * - "first_time_visitor" → "first_visit"
 * - "budget is around $7000" → 7000 (normalize to number)
 */

import type { LLMProvider } from '../../llm/types';
import type { FlatNode, SlotValue } from '../../semantic/types';
import { flattenTrees, unflattenToTrees } from '../../semantic/tree';
import type { MeaningAgent, PipelineContext } from '../meaningPipeline';

const SYSTEM_PROMPT = `You clean up YAML key names and values to be concise and readable.

Given a frame with slots, return the SAME slots with improved key names and values.

Rules:
1. Key names: short, clear, snake_case (2-3 words max)
2. String values: concise but preserve meaning. Don't lose information.
3. Numbers: extract numeric values where appropriate ("$5000" → 5000)
4. Don't remove or add slots — only rename/clean existing ones
5. Preserve arrays and nested structures

Output valid JSON: { "slots": { "key": "value", ... } }
Output ONLY the JSON. No explanation.`;

export const slotPolisherAgent: MeaningAgent = {
  name: 'slot_polisher',
  description: 'Clean up slot names and values for readability',
  usesLLM: true,

  shouldRun(ctx: PipelineContext): boolean {
    if (ctx.meta.mode === 'incremental') return false;
    return ctx.content.trees.length > 0;
  },

  async run(ctx: PipelineContext, provider: LLMProvider): Promise<PipelineContext> {
    const frames: FlatNode[] = flattenTrees(ctx.content.trees);
    const polishedFrames: FlatNode[] = [];

    for (const frame of frames) {
      try {
        const slotsJson = JSON.stringify(frame.slots, null, 2);
        const userPrompt = `Frame type: ${frame.type}\nSlots:\n${slotsJson}\n\nPolished:`;

        const result = await provider.generate(`${SYSTEM_PROMPT}\n\n${userPrompt}`, {
          temperature: 0.1,
          maxTokens: 2048,
        });

        ctx.meta.totalUsage.inputTokens += result.usage.inputTokens;
        ctx.meta.totalUsage.outputTokens += result.usage.outputTokens;

        const jsonMatch = result.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as { slots?: Record<string, SlotValue> };
          if (parsed.slots && Object.keys(parsed.slots).length > 0) {
            polishedFrames.push({ ...frame, slots: parsed.slots });
            continue;
          }
        }
      } catch {
        // Polish failed for this frame — keep original
      }

      polishedFrames.push(frame);
    }

    ctx.content = { trees: unflattenToTrees(polishedFrames), relations: ctx.content.relations };
    return ctx;
  },
};
