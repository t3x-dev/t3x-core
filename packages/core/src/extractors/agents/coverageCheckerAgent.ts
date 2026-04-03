/**
 * Coverage Checker Agent — LLM (Two-Step)
 *
 * Step 1: Extract ALL user-stated key points from conversation (without seeing frames).
 * Step 2: Compare key points against extracted frames, find missing ones, auto-add.
 *
 * Two-step approach is more reliable than single-step because the LLM extracts
 * user points without being biased by seeing existing frames first.
 *
 * Runs after reviewer — needs fully structured YAML to compare against.
 */

import type { LLMProvider } from '../../llm/types';
import { flattenTrees, unflattenToTrees } from '../../semantic/tree';
import type { FlatNode, SlotValue } from '../../semantic/types';
import type { MeaningAgent, PipelineContext } from '../meaningPipeline';

// ── Step 1: Extract user key points (no frames shown) ──

const STEP1_PROMPT = `You extract ALL important points from the USER's messages. Ignore assistant responses completely.

Categorize each point into one of these types:
- constraint: allergies, avoidances, rejections, hard limits, dealbreakers
- preference: stated wants, likes, dislikes, interests, style preferences
- fact: dates, numbers, group details, budget, logistics, transport
- question: things the user asked but remain unresolved

Output JSON:
{
  "points": [
    { "type": "constraint", "text": "peanut allergy for one friend", "quote": "One friend is allergic to peanuts" },
    { "type": "preference", "text": "wants bar or live music at night", "quote": "we'd love to check out a nice bar or live music spot" },
    { "type": "fact", "text": "group of 3 people", "quote": "three of us" },
    { "type": "question", "text": "weather inquiry", "quote": "What's the weather like in early April?" }
  ]
}

Be thorough — capture EVERY point the user made, no matter how small.
Output ONLY JSON. No explanation.`;

// ── Step 2: Compare points against frames ──

const STEP2_PROMPT = `You compare a list of user-stated points against extracted semantic frames to find what's MISSING.

For each point, check if it is captured in any frame's slots. A point is "captured" if the frame contains the essential meaning — exact wording match is not required.

For each MISSING point, specify how to add it:
- frame_type: which frame type it belongs to (constraints, preferences, logistics, open_questions, etc.)
- slot_key: the slot key to use
- slot_value: the value to add

CRITICAL: The slot_value MUST come directly from the user's words. Do NOT invent numbers, names, prices, or details not explicitly stated by the user. If the user said "in-laws offered to help" the value is "in-laws offered to help" — do NOT infer an amount like 10000.

Output JSON:
{
  "coverage_score": 0.7,
  "missing_points": [
    {
      "text": "peanut allergy for one friend",
      "quote": "One friend is allergic to peanuts",
      "frame_type": "constraints",
      "slot_key": "dietary",
      "slot_value": [{ "type": "peanut_allergy", "applies_to": "friend", "severity": "must avoid" }]
    }
  ]
}

If nothing is missing: { "coverage_score": 1.0, "missing_points": [] }
Output ONLY JSON. No explanation.`;

/** Find an existing frame by type */
function findFrameByType(frames: FlatNode[], type: string): FlatNode | undefined {
  return frames.find((f) => f.type === type);
}

/** Generate the next frame ID */
function nextFrameId(frames: FlatNode[]): string {
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
  description: 'Two-step coverage verification: extract user points then compare against frames',
  usesLLM: true,

  shouldRun(ctx: PipelineContext): boolean {
    if (ctx.meta.mode === 'incremental') return false;
    return ctx.content.trees.length > 0 && ctx.turns.some((t) => t.role === 'user');
  },

  async run(ctx: PipelineContext, provider: LLMProvider): Promise<PipelineContext> {
    const userTurns = ctx.turns
      .filter((t) => t.role === 'user')
      .map((t, i) => `[U${i + 1}]: ${t.content}`)
      .join('\n');

    // ── Step 1: Extract user key points (LLM does NOT see frames) ──
    const step1Prompt = `${STEP1_PROMPT}\n\n## User Messages\n${userTurns}\n\nExtract all points:`;

    const step1Result = await provider.generate(step1Prompt, {
      temperature: 0.1,
      maxTokens: 2048,
    });

    ctx.meta.totalUsage.inputTokens += step1Result.usage.inputTokens;
    ctx.meta.totalUsage.outputTokens += step1Result.usage.outputTokens;

    let userPoints: Array<{ type: string; text: string; quote?: string }>;
    try {
      const jsonMatch = step1Result.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return ctx;
      const parsed = JSON.parse(jsonMatch[0]) as {
        points?: Array<{ type: string; text: string; quote?: string }>;
      };
      if (!parsed.points || parsed.points.length === 0) return ctx;
      userPoints = parsed.points;
    } catch {
      return ctx; // Step 1 parse failed — non-fatal
    }

    // ── Step 2: Compare points against frames (LLM sees both) ──
    const frames: FlatNode[] = flattenTrees(ctx.content.trees);
    const framesDescription = frames
      .map((f: FlatNode) => `${f.id} ${f.type}: ${JSON.stringify(f.slots, null, 1).slice(0, 400)}`)
      .join('\n\n');

    const pointsList = userPoints
      .map((p, i) => `${i + 1}. [${p.type}] ${p.text}${p.quote ? ` — "${p.quote}"` : ''}`)
      .join('\n');

    const step2Prompt = `${STEP2_PROMPT}\n\n## User Key Points\n${pointsList}\n\n## Current Frames\n${framesDescription}\n\nCompare and find missing:`;

    const step2Result = await provider.generate(step2Prompt, {
      temperature: 0.1,
      maxTokens: 2048,
    });

    ctx.meta.totalUsage.inputTokens += step2Result.usage.inputTokens;
    ctx.meta.totalUsage.outputTokens += step2Result.usage.outputTokens;

    try {
      const jsonMatch = step2Result.text.match(/\{[\s\S]*\}/);
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
      const modifiedFrames = [...frames];

      for (const point of parsed.missing_points) {
        const existing = findFrameByType(modifiedFrames, point.frame_type);

        if (existing) {
          // Add slot to existing frame
          const currentValue = existing.slots[point.slot_key];
          if (Array.isArray(currentValue)) {
            // Append to existing array, dedup by stringified value
            const newItems = Array.isArray(point.slot_value)
              ? point.slot_value
              : [point.slot_value];
            const existingSet = new Set(
              currentValue.map((v) => (typeof v === 'string' ? v : JSON.stringify(v)))
            );
            const deduped = newItems.filter((v) => {
              const key = typeof v === 'string' ? v : JSON.stringify(v);
              return !existingSet.has(key);
            });
            existing.slots[point.slot_key] = [...currentValue, ...deduped];
          } else if (currentValue === undefined) {
            // New slot
            existing.slots[point.slot_key] = point.slot_value;
          }
          // If slot already exists with a non-array value, don't overwrite
        } else {
          // Create new frame — nest under main topic root if possible
          const rootFrame = modifiedFrames[0];
          const nestedType = rootFrame ? `${rootFrame.type}/${point.frame_type}` : point.frame_type;
          const newFrame: FlatNode = {
            id: nextFrameId(modifiedFrames),
            type: nestedType,
            slots: { [point.slot_key]: point.slot_value },
            confidence: 0.95,
            source: 'coverage_checker',
          };
          modifiedFrames.push(newFrame);
        }
      }

      ctx.content = { trees: unflattenToTrees(modifiedFrames), relations: ctx.content.relations };
    } catch {
      // Step 2 parse failed — non-fatal, continue with what we have
    }

    return ctx;
  },
};
