/**
 * Topic Namer Agent — LLM
 *
 * ONE job: look at the frames and conversation, suggest a good root topic name.
 * Input: frame types + first few slots + conversation summary
 * Output: ONE topic name (string, snake_case)
 *
 * Examples:
 * - "travel_plan", "budget_constraint", "accommodation_preference" → "japan_trip_plan"
 * - "feature_request", "user_story", "priority" → "product_roadmap"
 * - "candidate_profile", "interview_schedule" → "engineering_hiring"
 */

import type { LLMProvider } from '../../llm/types';
import type { FlatNode } from '../../semantic/types';
import { flattenTrees, unflattenToTrees } from '../../semantic/tree';
import type { MeaningAgent, PipelineContext } from '../meaningPipeline';

const SYSTEM_PROMPT = `You name the main topic of a conversation based on extracted semantic frames.

Rules:
1. Return ONLY a snake_case topic name (e.g., "japan_trip_plan")
2. Be specific, not generic ("japan_trip_plan" not "conversation_summary")
3. Reflect the user's INTENT, not just the subject ("hiring_plan" not "people")
4. Use 2-4 words maximum
5. Output ONLY the topic name, nothing else. No quotes, no explanation.`;

export const topicNamerAgent: MeaningAgent = {
  name: 'topic_namer',
  description: 'Suggest a good root topic name for the meaning document',
  usesLLM: true,

  shouldRun(ctx: PipelineContext): boolean {
    // Run on first extraction or when we have 3+ frames without a topic
    const frames: FlatNode[] = flattenTrees(ctx.content.trees);
    return ctx.meta.isFirstExtraction || (frames.length >= 3 && !ctx.topicName);
  },

  async run(ctx: PipelineContext, provider: LLMProvider): Promise<PipelineContext> {
    const frames: FlatNode[] = flattenTrees(ctx.content.trees);
    const frameInfo = frames
      .map((f: FlatNode) => {
        const topSlots = Object.entries(f.slots)
          .slice(0, 3)
          .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
          .join(', ');
        return `  ${f.type}: { ${topSlots} }`;
      })
      .join('\n');

    const userPrompt = `Frames:\n${frameInfo}\n\nConversation: ${ctx.conversationSummary}\n\nTopic name:`;

    const result = await provider.generate(`${SYSTEM_PROMPT}\n\n${userPrompt}`, {
      temperature: 0.1,
      maxTokens: 50,
    });

    ctx.meta.totalUsage.inputTokens += result.usage.inputTokens;
    ctx.meta.totalUsage.outputTokens += result.usage.outputTokens;

    const name = result.text.trim().replace(/["'`]/g, '').replace(/\s+/g, '_').toLowerCase();

    if (name && name.length > 0 && name.length < 60) {
      ctx.topicName = name;

      // Rename root tree(s) to the topic name
      if (ctx.content.trees.length > 0) {
        ctx.content.trees[0] = {
          ...ctx.content.trees[0],
          key: name,
        };
      }
    }

    return ctx;
  },
};
