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
import { flattenTrees, unflattenToTrees } from '../../semantic/tree';
import type { MeaningAgent, PipelineContext } from '../meaningPipeline';

const SYSTEM_PROMPT = `You review a structured meaning document for quality. Check:

1. Is the root topic name specific and meaningful? (not generic like "conversation" or "discussion")
2. Are there any obvious duplicates that should be merged?
3. Are slot names clear and consistent? (all snake_case, no abbreviations)
4. Is the nesting logical? (sub-topics under correct parents)
5. Are arrays used for lists of similar items?
6. Are the user's explicit CONSTRAINTS captured? (allergies, avoidances, rejections, hard limits — these MUST exist as a separate "constraints" frame if the user stated any)
7. Does any frame content CONTRADICT what the user explicitly said? (e.g., user said "avoid X" but a frame recommends X)
8. If the user asked unresolved questions, is there an "open_questions" frame?

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
    if (ctx.meta.mode === 'incremental') return false;
    return ctx.content.trees.length > 0;
  },

  async run(ctx: PipelineContext, provider: LLMProvider): Promise<PipelineContext> {
    const frames: Frame[] = flattenTrees(ctx.content.trees);
    const framesDescription = frames
      .map((f: Frame) => {
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
        let modifiedFrames = [...frames];

        // Fix 1: Rename root frame type
        if (review.fixes.rename_root && modifiedFrames.length > 0) {
          modifiedFrames[0] = {
            ...modifiedFrames[0],
            type: review.fixes.rename_root,
          };
          ctx.topicName = review.fixes.rename_root;
        }

        // Fix 2: Rename slots across all frames
        if (review.fixes.rename_slots) {
          const renames = review.fixes.rename_slots;
          modifiedFrames = modifiedFrames.map((frame: Frame) => {
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
            const keepFrame = modifiedFrames.find((f: Frame) => f.id === keepId);
            const removeFrame = modifiedFrames.find((f: Frame) => f.id === removeId);
            if (keepFrame && removeFrame) {
              for (const [key, value] of Object.entries(removeFrame.slots)) {
                if (!(key in keepFrame.slots)) {
                  keepFrame.slots[key] = value;
                }
              }
              modifiedFrames = modifiedFrames.filter((f: Frame) => f.id !== removeId);
            }
          }
        }

        ctx.content = { trees: unflattenToTrees(modifiedFrames), relations: ctx.content.relations };
      }
    } catch {
      // Review parse failed — non-fatal, continue with what we have
    }

    return ctx;
  },
};
