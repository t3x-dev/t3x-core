import { beforeEach, describe, expect, it } from 'vitest';
import { dedupCheckerAgent } from '../../../extractors/agents/dedupCheckerAgent';
import type { PipelineContext } from '../../../extractors/meaningPipeline';
import { flattenTrees } from '../../../semantic/tree';
import { createFrameWithSlots, createSemanticContent, resetFrameIds } from '../../factories';
import { StubLLMProvider } from '../../stubs';

function makeCtx(frames: ReturnType<typeof createFrameWithSlots>[]): PipelineContext {
  return {
    turns: [],
    previousSnapshot: undefined,
    content: createSemanticContent(frames),
    topicName: null,
    conversationSummary: '',
    meta: {
      isFirstExtraction: true,
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

describe('dedupCheckerAgent', () => {
  it('shouldRun returns false when <4 frames', () => {
    const ctx = makeCtx([createFrameWithSlots('a', { x: 1 }), createFrameWithSlots('b', { y: 2 })]);
    expect(dedupCheckerAgent.shouldRun(ctx)).toBe(false);
  });

  it('shouldRun returns true when ≥4 frames', () => {
    const ctx = makeCtx([
      createFrameWithSlots('a', { x: 1 }),
      createFrameWithSlots('b', { y: 2 }),
      createFrameWithSlots('c', { z: 3 }),
      createFrameWithSlots('d', { w: 4 }),
    ]);
    expect(dedupCheckerAgent.shouldRun(ctx)).toBe(true);
  });

  it('merges frames when LLM returns merge decision', async () => {
    const ctx = makeCtx([
      createFrameWithSlots('preference', { item: 'sushi', sentiment: 'likes' }, 'f_1'),
      createFrameWithSlots('preference', { item: 'ramen', sentiment: 'loves' }, 'f_2'),
      createFrameWithSlots('budget', { amount: 5000 }, 'f_3'),
      createFrameWithSlots('travel', { dest: 'Tokyo' }, 'f_4'),
    ]);

    // LLM says merge the two 'preference' frames
    provider.enqueue(
      JSON.stringify({
        decision: 'merge',
        merged_slots: { items: ['sushi', 'ramen'], sentiment: 'positive' },
      })
    );

    const result = await dedupCheckerAgent.run(ctx, provider);

    // f_2 should be removed (merged into f_1)
    expect(flattenTrees(result.content.trees)).toHaveLength(3);
    expect(flattenTrees(result.content.trees)[0].slots.items).toEqual(['sushi', 'ramen']);
  });

  it('keeps frames separate when LLM returns keep_separate', async () => {
    const ctx = makeCtx([
      createFrameWithSlots('preference', { item: 'sushi' }, 'f_1'),
      createFrameWithSlots('preference', { item: 'hotels' }, 'f_2'),
      createFrameWithSlots('a', { x: 1 }, 'f_3'),
      createFrameWithSlots('b', { y: 2 }, 'f_4'),
    ]);

    provider.enqueue(JSON.stringify({ decision: 'keep_separate', merged_slots: null }));

    const result = await dedupCheckerAgent.run(ctx, provider);
    expect(flattenTrees(result.content.trees)).toHaveLength(4);
  });

  it('takes minimum confidence from merged frames', async () => {
    const f1 = createFrameWithSlots('pref', { a: 1 }, 'f_1');
    f1.confidence = 0.9;
    const f2 = createFrameWithSlots('pref', { b: 2 }, 'f_2');
    f2.confidence = 0.5;

    const ctx = makeCtx([
      f1,
      f2,
      createFrameWithSlots('c', {}, 'f_3'),
      createFrameWithSlots('d', {}, 'f_4'),
    ]);

    provider.enqueue(JSON.stringify({ decision: 'merge', merged_slots: { a: 1, b: 2 } }));

    const result = await dedupCheckerAgent.run(ctx, provider);
    expect(flattenTrees(result.content.trees)[0].confidence).toBe(0.5);
  });

  it('continues gracefully when LLM returns invalid JSON', async () => {
    const ctx = makeCtx([
      createFrameWithSlots('pref', { a: 1 }, 'f_1'),
      createFrameWithSlots('pref', { b: 2 }, 'f_2'),
      createFrameWithSlots('c', {}, 'f_3'),
      createFrameWithSlots('d', {}, 'f_4'),
    ]);

    provider.enqueue('not valid json at all');

    const result = await dedupCheckerAgent.run(ctx, provider);
    // Should not throw, frames unchanged
    expect(flattenTrees(result.content.trees)).toHaveLength(4);
  });

  it('tracks LLM usage in meta', async () => {
    const ctx = makeCtx([
      createFrameWithSlots('pref', { a: 1 }, 'f_1'),
      createFrameWithSlots('pref', { b: 2 }, 'f_2'),
      createFrameWithSlots('c', {}, 'f_3'),
      createFrameWithSlots('d', {}, 'f_4'),
    ]);

    provider.enqueue(JSON.stringify({ decision: 'keep_separate' }));

    const result = await dedupCheckerAgent.run(ctx, provider);
    expect(result.meta.totalUsage.inputTokens).toBeGreaterThan(0);
  });
});
