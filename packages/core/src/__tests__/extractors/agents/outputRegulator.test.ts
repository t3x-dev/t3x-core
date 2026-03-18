import { describe, expect, it } from 'vitest';
import { outputRegulatorAgent } from '../../../extractors/agents/outputRegulatorAgent';
import type { PipelineContext } from '../../../extractors/meaningPipeline';
import { createFrameWithSlots, createSemanticContent, resetFrameIds } from '../../factories';
import { StubLLMProvider } from '../../stubs';

function makeCtx(
  frames: ReturnType<typeof createFrameWithSlots>[],
  relations: any[] = []
): PipelineContext {
  return {
    turns: [],
    previousSnapshot: undefined,
    content: createSemanticContent(frames, relations),
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

const provider = new StubLLMProvider();

describe('outputRegulatorAgent', () => {
  it('shouldRun returns false when no duplicate types', () => {
    resetFrameIds();
    const ctx = makeCtx([
      createFrameWithSlots('travel', { dest: 'Tokyo' }),
      createFrameWithSlots('budget', { amount: 5000 }),
    ]);
    expect(outputRegulatorAgent.shouldRun(ctx)).toBe(false);
  });

  it('shouldRun returns true when duplicate types exist', () => {
    resetFrameIds();
    const ctx = makeCtx([
      createFrameWithSlots('city', { name: 'Tokyo' }),
      createFrameWithSlots('city', { name: 'Kyoto' }),
    ]);
    expect(outputRegulatorAgent.shouldRun(ctx)).toBe(true);
  });

  it('merges duplicate frame types into array-valued "items" slot', async () => {
    resetFrameIds();
    const ctx = makeCtx([
      createFrameWithSlots('city_recommendation', { city: 'Tokyo', reason: 'culture' }, 'f_001'),
      createFrameWithSlots('city_recommendation', { city: 'Kyoto', reason: 'temples' }, 'f_002'),
      createFrameWithSlots('budget', { amount: 5000 }, 'f_003'),
    ]);

    const result = await outputRegulatorAgent.run(ctx, provider);

    expect(result.content.frames).toHaveLength(2);
    // First frame should be merged with plural type
    const merged = result.content.frames[0];
    expect(merged.type).toBe('city_recommendations');
    expect(merged.id).toBe('f_001'); // keeps first frame's ID
    expect(Array.isArray(merged.slots.items)).toBe(true);
    expect((merged.slots.items as any[]).length).toBe(2);
    // Second frame is budget (untouched)
    expect(result.content.frames[1].type).toBe('budget');
  });

  it('preserves minimum confidence from merged frames', async () => {
    resetFrameIds();
    const f1 = createFrameWithSlots('rec', { a: 1 }, 'f_1');
    f1.confidence = 0.8;
    const f2 = createFrameWithSlots('rec', { b: 2 }, 'f_2');
    f2.confidence = 0.6;

    const ctx = makeCtx([f1, f2]);
    const result = await outputRegulatorAgent.run(ctx, provider);

    expect(result.content.frames[0].confidence).toBe(0.6);
  });

  it('does not pluralize types already ending in s', async () => {
    resetFrameIds();
    const ctx = makeCtx([
      createFrameWithSlots('recommendations', { a: 1 }, 'f_1'),
      createFrameWithSlots('recommendations', { b: 2 }, 'f_2'),
    ]);

    const result = await outputRegulatorAgent.run(ctx, provider);
    expect(result.content.frames[0].type).toBe('recommendations');
  });

  it('removes relations pointing to merged-away frames', async () => {
    resetFrameIds();
    const ctx = makeCtx(
      [
        createFrameWithSlots('city', { name: 'Tokyo' }, 'f_1'),
        createFrameWithSlots('city', { name: 'Kyoto' }, 'f_2'),
        createFrameWithSlots('budget', { amount: 5000 }, 'f_3'),
      ],
      [
        { from: 'f_1', to: 'f_3', type: 'elaborates' },
        { from: 'f_2', to: 'f_3', type: 'elaborates' }, // f_2 will be merged away
      ]
    );

    const result = await outputRegulatorAgent.run(ctx, provider);
    // f_2 is gone, so relation from f_2 should be removed
    expect(result.content.relations).toHaveLength(1);
    expect(result.content.relations[0].from).toBe('f_1');
  });
});
