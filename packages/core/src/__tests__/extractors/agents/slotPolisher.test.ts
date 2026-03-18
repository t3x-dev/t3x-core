import { beforeEach, describe, expect, it } from 'vitest';
import { slotPolisherAgent } from '../../../extractors/agents/slotPolisherAgent';
import type { PipelineContext } from '../../../extractors/meaningPipeline';
import { createFrameWithSlots, createSemanticContent, resetFrameIds } from '../../factories';
import { StubLLMProvider } from '../../stubs';

function makeCtx(
  frames: ReturnType<typeof createFrameWithSlots>[],
  isFirst = true
): PipelineContext {
  return {
    turns: [],
    previousSnapshot: undefined,
    content: createSemanticContent(frames),
    topicName: null,
    conversationSummary: '',
    meta: {
      isFirstExtraction: isFirst,
      turnCount: 0,
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

describe('slotPolisherAgent', () => {
  it('shouldRun on first extraction with frames', () => {
    const ctx = makeCtx([createFrameWithSlots('a', { x: 1 })], true);
    expect(slotPolisherAgent.shouldRun(ctx)).toBe(true);
  });

  it('shouldRun returns false in incremental mode', () => {
    const ctx = makeCtx([createFrameWithSlots('a', { x: 1 })], true);
    (ctx.meta as any).mode = 'incremental';
    expect(slotPolisherAgent.shouldRun(ctx)).toBe(false);
  });

  it('shouldRun returns false when no frames', () => {
    const ctx = makeCtx([], true);
    expect(slotPolisherAgent.shouldRun(ctx)).toBe(false);
  });

  it('polishes slot keys and values from LLM response', async () => {
    const ctx = makeCtx([
      createFrameWithSlots('travel', {
        travel_dates_and_season: 'spring',
        budget_amount_in_dollars: '$5000',
      }),
    ]);

    provider.enqueue(
      JSON.stringify({
        slots: { season: 'spring', budget: 5000 },
      })
    );

    const result = await slotPolisherAgent.run(ctx, provider);

    expect(result.content.frames[0].slots).toEqual({ season: 'spring', budget: 5000 });
  });

  it('falls back to original frame when LLM returns invalid JSON', async () => {
    const original = createFrameWithSlots('travel', { dest: 'Tokyo' });
    const ctx = makeCtx([original]);

    provider.enqueue('not json');

    const result = await slotPolisherAgent.run(ctx, provider);
    expect(result.content.frames[0].slots).toEqual({ dest: 'Tokyo' });
  });

  it('falls back when LLM returns empty slots', async () => {
    const original = createFrameWithSlots('travel', { dest: 'Tokyo' });
    const ctx = makeCtx([original]);

    provider.enqueue(JSON.stringify({ slots: {} }));

    const result = await slotPolisherAgent.run(ctx, provider);
    expect(result.content.frames[0].slots).toEqual({ dest: 'Tokyo' });
  });

  it('polishes each frame independently', async () => {
    const ctx = makeCtx([
      createFrameWithSlots('travel', { destination_city: 'Tokyo' }),
      createFrameWithSlots('budget', { total_budget_amount: 5000 }),
    ]);

    provider
      .enqueue(JSON.stringify({ slots: { city: 'Tokyo' } }))
      .enqueue(JSON.stringify({ slots: { amount: 5000 } }));

    const result = await slotPolisherAgent.run(ctx, provider);

    expect(result.content.frames[0].slots).toEqual({ city: 'Tokyo' });
    expect(result.content.frames[1].slots).toEqual({ amount: 5000 });
    expect(provider.calls).toHaveLength(2);
  });

  it('preserves arrays in slot values', async () => {
    const ctx = makeCtx([createFrameWithSlots('prefs', { items: ['sushi', 'ramen'] as any })]);

    provider.enqueue(JSON.stringify({ slots: { foods: ['sushi', 'ramen'] } }));

    const result = await slotPolisherAgent.run(ctx, provider);
    expect(result.content.frames[0].slots.foods).toEqual(['sushi', 'ramen']);
  });
});
