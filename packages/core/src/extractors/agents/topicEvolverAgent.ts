/**
 * Topic Evolver Agent — LLM
 *
 * ONE job: check if the root topic name still fits the conversation.
 * As conversations evolve, the topic might need updating:
 *   "travel_planning" → "japan_trip" → "tokyo_cultural_immersion"
 *
 * Only runs on delta updates (not first extraction).
 * Very cheap — tiny prompt, one word output.
 */

import type { LLMProvider } from '../../llm/types';
import type { MeaningAgent, PipelineContext } from '../meaningPipeline';

const SYSTEM_PROMPT = `You check if a topic name still fits a conversation.

Given the current topic name and the latest conversation content, decide:
1. If the topic name is still good → output the SAME name
2. If it should be more specific → output a better name
3. If the conversation shifted → output a new name

Rules:
- Output ONLY a snake_case topic name (2-4 words)
- Be specific ("japan_cultural_trip" not "travel")
- Reflect the user's INTENT
- No quotes, no explanation`;

export const topicEvolverAgent: MeaningAgent = {
  name: 'topic_evolver',
  description: 'Update root topic name as conversation evolves',
  usesLLM: true,

  shouldRun(ctx: PipelineContext): boolean {
    // Only on delta updates (not first extraction), and when we have a topic
    return !ctx.meta.isFirstExtraction && ctx.content.frames.length > 0;
  },

  async run(ctx: PipelineContext, provider: LLMProvider): Promise<PipelineContext> {
    const currentName = ctx.content.frames[0]?.type ?? 'unknown';
    const recentTurns = ctx.turns
      .slice(-4)
      .map((t) => `[${t.role}]: ${t.content.slice(0, 200)}`)
      .join('\n');

    const userPrompt = `Current topic: ${currentName}\n\nRecent conversation:\n${recentTurns}\n\nBest topic name:`;

    const result = await provider.generate(`${SYSTEM_PROMPT}\n\n${userPrompt}`, {
      temperature: 0.1,
      maxTokens: 30,
    });

    ctx.meta.totalUsage.inputTokens += result.usage.inputTokens;
    ctx.meta.totalUsage.outputTokens += result.usage.outputTokens;

    const name = result.text.trim().replace(/["'`]/g, '').replace(/\s+/g, '_').toLowerCase();

    if (name && name.length > 0 && name.length < 60 && name !== currentName) {
      ctx.topicName = name;
      if (ctx.content.frames.length > 0) {
        ctx.content.frames[0] = { ...ctx.content.frames[0], type: name };
      }
    }

    return ctx;
  },
};
