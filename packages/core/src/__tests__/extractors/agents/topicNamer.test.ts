import { beforeEach, describe, expect, it } from 'vitest';
import { topicNamerAgent } from '../../../extractors/agents/topicNamerAgent';
import type { PipelineContext } from '../../../extractors/meaningPipeline';
import { createFrameWithSlots, createSemanticContent, resetFrameIds } from '../../factories';
import { flattenTrees } from '../../../semantic/tree';
import { StubLLMProvider } from '../../stubs';

function makeCtx(
  frames: ReturnType<typeof createFrameWithSlots>[],
  isFirst = true,
  topicName: string | null = null
): PipelineContext {
  return {
    turns: [{ role: 'user', content: 'I want to plan a trip to Japan' }] as any[],
    previousSnapshot: undefined,
    content: createSemanticContent(frames),
    topicName,
    conversationSummary: 'User wants to plan a trip to Japan',
    meta: {
      isFirstExtraction: isFirst,
      turnCount: 1,
      frameCount: frames.length,
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
  resetFrameIds();
});

describe('topicNamerAgent', () => {
  it('shouldRun on first extraction', () => {
    const ctx = makeCtx([createFrameWithSlots('a', { x: 1 })], true);
    expect(topicNamerAgent.shouldRun(ctx)).toBe(true);
  });

  it('shouldRun when 3+ frames and no topic name', () => {
    const ctx = makeCtx(
      [createFrameWithSlots('a', {}), createFrameWithSlots('b', {}), createFrameWithSlots('c', {})],
      false,
      null
    );
    expect(topicNamerAgent.shouldRun(ctx)).toBe(true);
  });

  it('shouldRun returns false on delta with existing topic', () => {
    const ctx = makeCtx([createFrameWithSlots('a', {})], false, 'existing_topic');
    expect(topicNamerAgent.shouldRun(ctx)).toBe(false);
  });

  it('sets topic name and renames first frame', async () => {
    const ctx = makeCtx([
      createFrameWithSlots('travel_planning', { destination: 'Japan' }),
      createFrameWithSlots('budget', { amount: 5000 }),
    ]);

    provider.enqueue('japan_trip_plan');

    const result = await topicNamerAgent.run(ctx, provider);

    expect(result.topicName).toBe('japan_trip_plan');
    expect(flattenTrees(result.content.trees)[0].type).toBe('japan_trip_plan');
    // Second frame unchanged
    expect(flattenTrees(result.content.trees)[1].type).toBe('budget');
  });

  it('cleans up LLM output: removes quotes, normalizes whitespace', async () => {
    const ctx = makeCtx([createFrameWithSlots('a', { x: 1 })]);
    provider.enqueue('"Japan  Trip   Plan"');

    const result = await topicNamerAgent.run(ctx, provider);
    expect(result.topicName).toBe('japan_trip_plan');
  });

  it('rejects names longer than 60 chars', async () => {
    const ctx = makeCtx([createFrameWithSlots('a', { x: 1 })]);
    provider.enqueue('a'.repeat(61));

    const result = await topicNamerAgent.run(ctx, provider);
    expect(result.topicName).toBeNull();
  });

  it('rejects empty names', async () => {
    const ctx = makeCtx([createFrameWithSlots('a', { x: 1 })]);
    provider.enqueue('   ');

    const result = await topicNamerAgent.run(ctx, provider);
    expect(result.topicName).toBeNull();
  });

  it('tracks LLM usage', async () => {
    const ctx = makeCtx([createFrameWithSlots('a', { x: 1 })]);
    provider.enqueue('test_topic');

    const result = await topicNamerAgent.run(ctx, provider);
    expect(result.meta.totalUsage.inputTokens).toBe(10);
    expect(result.meta.totalUsage.outputTokens).toBe(5);
  });
});
