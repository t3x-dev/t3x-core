import { beforeEach, describe, expect, it } from 'vitest';
import { reviewerAgent } from '../../../extractors/agents/reviewerAgent';
import { StubLLMProvider } from '../../stubs';
import { createFrameWithSlots, createSemanticContent, resetFrameIds } from '../../factories';
import type { PipelineContext } from '../../../extractors/meaningPipeline';

function makeCtx(frames: ReturnType<typeof createFrameWithSlots>[]): PipelineContext {
  return {
    turns: [],
    previousSnapshot: undefined,
    content: createSemanticContent(frames),
    topicName: null,
    conversationSummary: 'User planning a trip to Japan',
    meta: {
      isFirstExtraction: true,
      turnCount: 3,
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

describe('reviewerAgent', () => {
  it('shouldRun when frames exist', () => {
    const ctx = makeCtx([createFrameWithSlots('a', { x: 1 })]);
    expect(reviewerAgent.shouldRun(ctx)).toBe(true);
  });

  it('shouldRun returns false when no frames', () => {
    const ctx = makeCtx([]);
    expect(reviewerAgent.shouldRun(ctx)).toBe(false);
  });

  it('returns unchanged context when review is approved', async () => {
    const ctx = makeCtx([
      createFrameWithSlots('japan_trip', { dest: 'Tokyo' }, 'f_1'),
    ]);

    provider.enqueue(JSON.stringify({ status: 'approved', issues: [] }));

    const result = await reviewerAgent.run(ctx, provider);
    expect(result.content.frames[0].type).toBe('japan_trip');
  });

  it('renames root frame when reviewer suggests rename_root', async () => {
    const ctx = makeCtx([
      createFrameWithSlots('conversation', { dest: 'Tokyo' }, 'f_1'),
    ]);

    provider.enqueue(JSON.stringify({
      status: 'needs_fixes',
      issues: ['Root topic name is too generic'],
      fixes: { rename_root: 'japan_travel_plan' },
    }));

    const result = await reviewerAgent.run(ctx, provider);
    expect(result.content.frames[0].type).toBe('japan_travel_plan');
    expect(result.topicName).toBe('japan_travel_plan');
  });

  it('renames slots across all frames', async () => {
    const ctx = makeCtx([
      createFrameWithSlots('trip', { dest: 'Tokyo', dur: '2w' }, 'f_1'),
      createFrameWithSlots('budget', { dest: 'related', amt: 5000 }, 'f_2'),
    ]);

    provider.enqueue(JSON.stringify({
      status: 'needs_fixes',
      issues: ['Slot names too abbreviated'],
      fixes: {
        rename_slots: { dest: 'destination', dur: 'duration', amt: 'amount' },
      },
    }));

    const result = await reviewerAgent.run(ctx, provider);
    expect(result.content.frames[0].slots.destination).toBe('Tokyo');
    expect(result.content.frames[0].slots.duration).toBe('2w');
    expect(result.content.frames[1].slots.destination).toBe('related');
    expect(result.content.frames[1].slots.amount).toBe(5000);
    // Old keys should not exist
    expect(result.content.frames[0].slots.dest).toBeUndefined();
  });

  it('merges frames when reviewer suggests merge_frames', async () => {
    const ctx = makeCtx([
      createFrameWithSlots('pref', { food: 'sushi' }, 'f_1'),
      createFrameWithSlots('pref', { drink: 'sake' }, 'f_2'),
      createFrameWithSlots('budget', { amount: 5000 }, 'f_3'),
    ]);

    provider.enqueue(JSON.stringify({
      status: 'needs_fixes',
      issues: ['Duplicate preference frames'],
      fixes: { merge_frames: [['f_1', 'f_2']] },
    }));

    const result = await reviewerAgent.run(ctx, provider);
    // f_2 merged into f_1 and removed
    expect(result.content.frames).toHaveLength(2);
    expect(result.content.frames[0].slots.food).toBe('sushi');
    expect(result.content.frames[0].slots.drink).toBe('sake');
  });

  it('handles invalid JSON from LLM gracefully', async () => {
    const ctx = makeCtx([createFrameWithSlots('a', { x: 1 }, 'f_1')]);

    provider.enqueue('This is not valid JSON');

    const result = await reviewerAgent.run(ctx, provider);
    // Should not throw, frames unchanged
    expect(result.content.frames[0].type).toBe('a');
  });

  it('does not overwrite existing slots during merge', async () => {
    const ctx = makeCtx([
      createFrameWithSlots('pref', { food: 'sushi', shared: 'original' }, 'f_1'),
      createFrameWithSlots('pref', { drink: 'sake', shared: 'duplicate' }, 'f_2'),
    ]);

    provider.enqueue(JSON.stringify({
      status: 'needs_fixes',
      fixes: { merge_frames: [['f_1', 'f_2']] },
    }));

    const result = await reviewerAgent.run(ctx, provider);
    // 'shared' should keep f_1's value (not overwritten by f_2)
    expect(result.content.frames[0].slots.shared).toBe('original');
    expect(result.content.frames[0].slots.drink).toBe('sake');
  });
});
