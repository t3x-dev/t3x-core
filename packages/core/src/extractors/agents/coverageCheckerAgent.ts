/**
 * Coverage Checker Agent — LLM
 *
 * ONE job: compare user turns against extracted frames and find missing points.
 * If the user said "I'm allergic to peanuts" but no frame captures this,
 * the agent auto-adds it to the appropriate frame (or creates a new one).
 *
 * Runs after reviewer — needs fully structured YAML to compare against.
 */

import type { LLMProvider } from '../../llm/types';
import type { Frame, SlotValue } from '../../semantic/types';
import type { MeaningAgent, PipelineContext } from '../meaningPipeline';

const SYSTEM_PROMPT = `You verify that ALL important points from the user's messages are captured in the extracted frames.

Focus ONLY on what the USER said (ignore assistant responses). Check for:
1. Constraints — allergies, avoidances, rejections, hard limits
2. Preferences — stated wants, likes, dislikes, interests
3. Facts — dates, numbers, group details, logistics
4. Open questions — things the user asked but remain unresolved

For each missing point, specify which frame type it belongs to and what slot to add.

Output JSON:
{
  "coverage_score": 0.8,
  "missing_points": [
    {
      "text": "peanut allergy",
      "quote": "One friend is allergic to peanuts",
      "frame_type": "constraints",
      "slot_key": "dietary",
      "slot_value": { "type": "peanut_allergy", "applies_to": "friend" }
    }
  ]
}

If nothing is missing: { "coverage_score": 1.0, "missing_points": [] }
Output ONLY JSON. No explanation.`;

/** Find an existing frame by type */
function findFrameByType(frames: Frame[], type: string): Frame | undefined {
  return frames.find((f) => f.type === type);
}

/** Generate the next frame ID */
function nextFrameId(frames: Frame[]): string {
  let max = 0;
  for (const f of frames) {
    const match = f.id.match(/^f_(\d+)$/);
    if (match) {
      const num = Number.parseInt(match[1], 10);
      if (num > max) max = num;
    }
  }
  return `f_${String(max + 1).padStart(3, '0')}`;
}

export const coverageCheckerAgent: MeaningAgent = {
  name: 'coverage_checker',
  description: 'Verify all user-stated points are captured in frames',
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

    const userPrompt = `## User Messages\n${userTurns}\n\n## Current Frames\n${framesDescription}\n\nCheck coverage:`;

    const result = await provider.generate(`${SYSTEM_PROMPT}\n\n${userPrompt}`, {
      temperature: 0.1,
      maxTokens: 2048,
    });

    ctx.meta.totalUsage.inputTokens += result.usage.inputTokens;
    ctx.meta.totalUsage.outputTokens += result.usage.outputTokens;

    try {
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return ctx;

      const parsed = JSON.parse(jsonMatch[0]) as {
        coverage_score?: number;
        missing_points?: Array<{
          text: string;
          quote?: string;
          frame_type: string;
          slot_key: string;
          slot_value: SlotValue;
        }>;
      };

      if (!parsed.missing_points || parsed.missing_points.length === 0) return ctx;

      // Apply missing points — add to existing frames or create new ones
      const frames = [...ctx.content.frames];

      for (const point of parsed.missing_points) {
        const existing = findFrameByType(frames, point.frame_type);

        if (existing) {
          // Add slot to existing frame
          const currentValue = existing.slots[point.slot_key];
          if (Array.isArray(currentValue)) {
            // Append to existing array
            existing.slots[point.slot_key] = [...currentValue, point.slot_value];
          } else if (currentValue === undefined) {
            // New slot
            existing.slots[point.slot_key] = point.slot_value;
          }
          // If slot already exists with a non-array value, don't overwrite
        } else {
          // Create new frame
          const newFrame: Frame = {
            id: nextFrameId(frames),
            type: point.frame_type,
            slots: { [point.slot_key]: point.slot_value },
            confidence: 0.95,
            source: 'coverage_checker',
          };
          frames.push(newFrame);
        }
      }

      ctx.content = { ...ctx.content, frames };
    } catch {
      // Parse failed — non-fatal, continue with what we have
    }

    return ctx;
  },
};
