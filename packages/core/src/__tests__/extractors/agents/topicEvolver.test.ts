import { beforeEach, describe, expect, it } from 'vitest';
import { topicEvolverAgent } from '../../../extractors/agents/topicEvolverAgent';
import type { PipelineContext } from '../../../extractors/meaningPipeline';
import { createFrameWithSlots, createSemanticContent, resetFrameIds } from '../../factories';
import { flattenTrees } from '../../../semantic/tree';
import { StubLLMProvider } from '../../stubs';

function makeCtx(rootType: string, isFirst: boolean): PipelineContext {
  resetFrameIds();
  return {
    turns: [
      { role: 'user', content: 'Now I want to focus on cultural experiences in Tokyo' },
    ] as any[],
    previousSnapshot: undefined,
    content: createSemanticContent([createFrameWithSlots(rootType, { destination: 'Japan' })]),
    topicName: rootType,
    conversationSummary: 'Cultural experiences in Tokyo',
    meta: {
      isFirstExtraction: isFirst,
      turnCount: 5,
      frameCount: 1,
      completedAgents: [],
      agentErrors: [],
      totalUsage: { inputTokens: 0, outputTokens: 0 },
      stepSnapshots: [],
    },
  };
}

let provider: StubLLMProvider;

beforeEach(() => {
  provider = new StubLLMProvider();
});

describe('topicEvolverAgent', () => {
  it('shouldRun returns false on first extraction', () => {
    const ctx = makeCtx('travel_plan', true);
    expect(topicEvolverAgent.shouldRun(ctx)).toBe(false);
  });

  it('shouldRun returns true on delta update with frames', () => {
    const ctx = makeCtx('travel_plan', false);
    expect(topicEvolverAgent.shouldRun(ctx)).toBe(true);
  });

  it('shouldRun returns false when no trees', () => {
    const ctx = makeCtx('travel_plan', false);
    ctx.content.trees = [];
    expect(topicEvolverAgent.shouldRun(ctx)).toBe(false);
  });

  it('evolves topic when LLM suggests a different name', async () => {
    const ctx = makeCtx('travel_plan', false);
    provider.enqueue('tokyo_cultural_immersion');

    const result = await topicEvolverAgent.run(ctx, provider);

    expect(result.topicName).toBe('tokyo_cultural_immersion');
    expect(flattenTrees(result.content.trees)[0].type).toBe('tokyo_cultural_immersion');
  });

  it('keeps topic when LLM returns the same name', async () => {
    const ctx = makeCtx('travel_plan', false);
    provider.enqueue('travel_plan');

    const result = await topicEvolverAgent.run(ctx, provider);

    // Same name → no change
    expect(result.topicName).toBe('travel_plan');
    expect(flattenTrees(result.content.trees)[0].type).toBe('travel_plan');
  });

  it('rejects names longer than 60 chars', async () => {
    const ctx = makeCtx('travel_plan', false);
    provider.enqueue('a'.repeat(61));

    const result = await topicEvolverAgent.run(ctx, provider);
    expect(flattenTrees(result.content.trees)[0].type).toBe('travel_plan');
  });
});
