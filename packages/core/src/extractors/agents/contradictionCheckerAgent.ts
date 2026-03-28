/**
 * Contradiction Checker Agent — LLM
 *
 * ONE job: detect if any frame content contradicts the user's explicit statements.
 * Example: user says "avoid Hefang Street" but a frame includes Hefang Street in an itinerary.
 *
 * Runs LAST in the pipeline — needs the final structured content to check against.
 */

import type { LLMProvider } from '../../llm/types';
import type { FlatNode } from '../../semantic/types';
import { flattenTrees, unflattenToTrees } from '../../semantic/tree';
import type { MeaningAgent, PipelineContext } from '../meaningPipeline';

const SYSTEM_PROMPT = `You detect contradictions between the user's explicit statements and the extracted frames.

Step 1: Extract all user CONSTRAINTS from their messages:
- "avoid X", "don't want X", "allergic to X", "skip X", "not interested in X"
- Budget limits, date restrictions, group limitations

Step 2: Check each frame's slots for content that VIOLATES these constraints.

A contradiction is when:
- User said "avoid X" but a frame includes X in a list or recommendation
- User said "allergic to X" but a frame suggests food containing X
- User said "no more than $X" but a frame shows cost exceeding X
- User rejected a suggestion but a frame still contains it

Output JSON:
{
  "user_constraints": ["avoid Hefang Street", "peanut allergy"],
  "contradictions": [
    {
      "user_said": "avoid the Hefang Street tourist area",
      "frame_id": "f_003",
      "slot_key": "activities",
      "contradicting_value": "Hefang Street evening food tour",
      "action": "remove_slot"
    }
  ]
}

action must be one of:
- "remove_slot" — delete just the contradicting slot from the frame
- "remove_frame" — delete the entire frame (when the whole frame contradicts)

If no contradictions: { "user_constraints": [...], "contradictions": [] }
Output ONLY JSON. No explanation.`;

export const contradictionCheckerAgent: MeaningAgent = {
  name: 'contradiction_checker',
  description: 'Detect and remove content that contradicts user statements',
  usesLLM: true,

  shouldRun(ctx: PipelineContext): boolean {
    if (ctx.meta.mode === 'incremental') return false;
    return ctx.content.trees.length > 0 && ctx.turns.some((t) => t.role === 'user');
  },

  async run(ctx: PipelineContext, provider: LLMProvider): Promise<PipelineContext> {
    const frames: FlatNode[] = flattenTrees(ctx.content.trees);
    const userTurns = ctx.turns
      .filter((t) => t.role === 'user')
      .map((t, i) => `[U${i + 1}]: ${t.content}`)
      .join('\n');

    const framesDescription = frames
      .map((f: FlatNode) => `${f.id} ${f.type}: ${JSON.stringify(f.slots, null, 1).slice(0, 400)}`)
      .join('\n\n');

    const userPrompt = `## User Messages\n${userTurns}\n\n## Current Frames\n${framesDescription}\n\nCheck for contradictions:`;

    const result = await provider.generate(`${SYSTEM_PROMPT}\n\n${userPrompt}`, {
      temperature: 0.1,
      maxTokens: 1024,
    });

    ctx.meta.totalUsage.inputTokens += result.usage.inputTokens;
    ctx.meta.totalUsage.outputTokens += result.usage.outputTokens;

    try {
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return ctx;

      const parsed = JSON.parse(jsonMatch[0]) as {
        contradictions?: Array<{
          frame_id: string;
          slot_key: string;
          action: 'remove_slot' | 'remove_frame';
        }>;
      };

      if (!parsed.contradictions || parsed.contradictions.length === 0) return ctx;

      let modifiedNodes = [...frames];

      for (const c of parsed.contradictions) {
        if (c.action === 'remove_frame') {
          modifiedNodes = modifiedNodes.filter((f: FlatNode) => f.id !== c.frame_id);
        } else if (c.action === 'remove_slot') {
          const node = modifiedNodes.find((f: FlatNode) => f.id === c.frame_id);
          if (node && c.slot_key in node.slots) {
            const { [c.slot_key]: _, ...remainingSlots } = node.slots;
            node.slots = remainingSlots;
            if (Object.keys(node.slots).length === 0) {
              modifiedNodes = modifiedNodes.filter((f: FlatNode) => f.id !== c.frame_id);
            }
          }
        }
      }

      ctx.content = { trees: unflattenToTrees(modifiedNodes), relations: ctx.content.relations };
    } catch {
      // Parse failed — non-fatal, continue with what we have
    }

    return ctx;
  },
};
