/**
 * Contradiction Checker Agent — LLM
 *
 * ONE job: detect if any frame content contradicts the user's explicit statements.
 * Example: user says "avoid Hefang Street" but a frame includes Hefang Street in an itinerary.
 *
 * Runs LAST in the pipeline — needs the final structured content to check against.
 */

import type { LLMProvider } from '../../llm/types';
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
    return ctx.content.frames.length > 0 && ctx.turns.some((t) => t.role === 'user');
  },

  async run(ctx: PipelineContext, provider: LLMProvider): Promise<PipelineContext> {
    const userTurns = ctx.turns
      .filter((t) => t.role === 'user')
      .map((t, i) => `[U${i + 1}]: ${t.content}`)
      .join('\n');

    const framesDescription = ctx.content.frames
      .map((f) => `${f.id} ${f.type}: ${JSON.stringify(f.slots, null, 1).slice(0, 400)}`)
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

      let frames = [...ctx.content.frames];

      for (const c of parsed.contradictions) {
        if (c.action === 'remove_frame') {
          frames = frames.filter((f) => f.id !== c.frame_id);
        } else if (c.action === 'remove_slot') {
          const frame = frames.find((f) => f.id === c.frame_id);
          if (frame && c.slot_key in frame.slots) {
            const { [c.slot_key]: _, ...remainingSlots } = frame.slots;
            frame.slots = remainingSlots;
            // If frame has no slots left, remove it entirely
            if (Object.keys(frame.slots).length === 0) {
              frames = frames.filter((f) => f.id !== c.frame_id);
            }
          }
        }
      }

      ctx.content = { ...ctx.content, frames };
    } catch {
      // Parse failed — non-fatal, continue with what we have
    }

    return ctx;
  },
};
