/**
 * Reviewer Agent — LLM
 *
 * Runs LAST. Reviews the final meaning document and flags issues:
 * - Does the structure make sense?
 * - Are there still duplicates?
 * - Is the topic name good?
 * - Any slots that should be merged or renamed?
 *
 * Output: pass/fail + list of issues. If issues found, attempts auto-fix.
 * This is the quality gate before the result is returned.
 */

import type { LLMProvider } from '../../llm/types';
import type { Frame, SlotValue } from '../../semantic/types';
import type { MeaningAgent, PipelineContext } from '../meaningPipeline';

const SYSTEM_PROMPT = `You review a structured meaning document for quality. Check:

1. Is the root topic name specific and meaningful? (not generic like "conversation" or "discussion")
2. Are there any obvious duplicates that should be merged?
3. Are slot names clear and consistent? (all snake_case, no abbreviations)
4. Is the nesting logical? (sub-topics under correct parents)
5. Are arrays used for lists of similar items?

If issues found, output JSON with fixes:
\`\`\`json
{
  "status": "needs_fixes",
  "issues": ["description of each issue"],
  "fixes": {
    "rename_root": "better_topic_name",
    "rename_slots": { "old_key": "new_key" },
    "merge_frames": [["f_001", "f_002"]]
  }
}
\`\`\`

If everything looks good:
\`\`\`json
{ "status": "approved", "issues": [] }
\`\`\`

Output ONLY JSON. No explanation.`;

export const reviewerAgent: MeaningAgent = {
  name: 'reviewer',
  description: 'Quality review of final meaning document — flags and fixes issues',
  usesLLM: true,

  shouldRun(ctx: PipelineContext): boolean {
    // Always run if we have content
    return ctx.content.frames.length > 0;
  },

  async run(ctx: PipelineContext, provider: LLMProvider): Promise<PipelineContext> {
    const framesDescription = ctx.content.frames
      .map((f) => {
        const slotsStr = JSON.stringify(f.slots, null, 1).slice(0, 300);
        return `${f.id} ${f.type}: ${slotsStr}`;
      })
      .join('\n\n');

    const userPrompt = `## Meaning Document to Review

${framesDescription}

## Conversation Summary
${ctx.conversationSummary}

Review this document:`;

    const result = await provider.generate(`${SYSTEM_PROMPT}\n\n${userPrompt}`, {
      temperature: 0.1,
      maxTokens: 1024,
    });

    ctx.meta.totalUsage.inputTokens += result.usage.inputTokens;
    ctx.meta.totalUsage.outputTokens += result.usage.outputTokens;

    try {
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return ctx;

      const review = JSON.parse(jsonMatch[0]) as {
        status: 'approved' | 'needs_fixes';
        issues?: string[];
        fixes?: {
          rename_root?: string;
          rename_slots?: Record<string, string>;
          merge_frames?: string[][];
        };
      };

      if (review.status === 'approved') return ctx;

      // Apply fixes
      if (review.fixes) {
        // Fix 1: Rename root frame type
        if (review.fixes.rename_root && ctx.content.frames.length > 0) {
          ctx.content.frames[0] = {
            ...ctx.content.frames[0],
            type: review.fixes.rename_root,
          };
          ctx.topicName = review.fixes.rename_root;
        }

        // Fix 2: Rename slots across all frames
        if (review.fixes.rename_slots) {
          const renames = review.fixes.rename_slots;
          ctx.content.frames = ctx.content.frames.map((frame) => {
            const newSlots: Record<string, SlotValue> = {};
            for (const [key, value] of Object.entries(frame.slots)) {
              const newKey = renames[key] ?? key;
              newSlots[newKey] = value;
            }
            return { ...frame, slots: newSlots };
          });
        }

        // Fix 3: Merge frames (simple: keep first, add slots from second)
        if (review.fixes.merge_frames) {
          for (const pair of review.fixes.merge_frames) {
            if (pair.length !== 2) continue;
            const [keepId, removeId] = pair;
            const keepFrame = ctx.content.frames.find((f) => f.id === keepId);
            const removeFrame = ctx.content.frames.find((f) => f.id === removeId);
            if (keepFrame && removeFrame) {
              // Merge slots from removed frame into kept frame
              for (const [key, value] of Object.entries(removeFrame.slots)) {
                if (!(key in keepFrame.slots)) {
                  keepFrame.slots[key] = value;
                }
              }
              // Remove the merged frame
              ctx.content.frames = ctx.content.frames.filter((f) => f.id !== removeId);
            }
          }
        }
      }
    } catch {
      // Review parse failed — non-fatal, continue with what we have
    }

    return ctx;
  },
};
