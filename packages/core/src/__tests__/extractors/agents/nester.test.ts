import { describe, expect, it } from 'vitest';
import { nesterAgent } from '../../../extractors/agents/nesterAgent';
import { StubLLMProvider } from '../../stubs';
import { createFrameWithSlots, createRelation, createSemanticContent, resetFrameIds } from '../../factories';
import type { PipelineContext } from '../../../extractors/meaningPipeline';

function makeCtx(
  frames: ReturnType<typeof createFrameWithSlots>[],
  relations: ReturnType<typeof createRelation>[] = [],
  isFirst = true
): PipelineContext {
  return {
    turns: [],
    previousSnapshot: undefined,
    content: createSemanticContent(frames, relations),
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

const provider = new StubLLMProvider();

describe('nesterAgent', () => {
  it('shouldRun returns false when no relations', () => {
    resetFrameIds();
    const ctx = makeCtx([
      createFrameWithSlots('a', { x: 1 }),
      createFrameWithSlots('b', { y: 2 }),
      createFrameWithSlots('c', { z: 3 }),
    ]);
    expect(nesterAgent.shouldRun(ctx)).toBe(false);
  });

  it('shouldRun returns false when ≤2 frames', () => {
    resetFrameIds();
    const f1 = createFrameWithSlots('a', { x: 1 }, 'f_1');
    const f2 = createFrameWithSlots('b', { y: 2 }, 'f_2');
    const ctx = makeCtx([f1, f2], [createRelation('f_1', 'f_2', 'elaborates')]);
    expect(nesterAgent.shouldRun(ctx)).toBe(false);
  });

  it('shouldRun returns true with relations and >2 frames', () => {
    resetFrameIds();
    const f1 = createFrameWithSlots('a', {}, 'f_1');
    const f2 = createFrameWithSlots('b', {}, 'f_2');
    const f3 = createFrameWithSlots('c', {}, 'f_3');
    const ctx = makeCtx([f1, f2, f3], [createRelation('f_2', 'f_1', 'elaborates')]);
    expect(nesterAgent.shouldRun(ctx)).toBe(true);
  });

  it('nests child frames into parent slots as InlineFrame', async () => {
    resetFrameIds();
    const parent = createFrameWithSlots('travel_plan', { destination: 'Japan' }, 'f_parent');
    const child = createFrameWithSlots('activity', { name: 'temple visit' }, 'f_child');
    const other = createFrameWithSlots('budget', { amount: 5000 }, 'f_other');

    // f_child elaborates f_parent → f_child becomes nested in f_parent
    const ctx = makeCtx(
      [parent, child, other],
      [createRelation('f_child', 'f_parent', 'elaborates')]
    );

    const result = await nesterAgent.run(ctx, provider);

    // Root frames: parent + other (child is nested)
    expect(result.content.frames).toHaveLength(2);
    expect(result.content.frames[0].id).toBe('f_parent');

    // Child should be nested as InlineFrame slot
    const nestedSlot = result.content.frames[0].slots.activity as any;
    expect(nestedSlot).toBeDefined();
    expect(nestedSlot.type).toBe('activity');
    expect(nestedSlot.slots.name).toBe('temple visit');

    // Relations should be cleared (expressed via nesting)
    expect(result.content.relations).toHaveLength(0);
  });

  it('handles duplicate slot keys with suffix numbering', async () => {
    resetFrameIds();
    const parent = createFrameWithSlots('plan', { activity: 'existing' }, 'f_p');
    const child1 = createFrameWithSlots('activity', { name: 'hiking' }, 'f_c1');
    const child2 = createFrameWithSlots('activity', { name: 'diving' }, 'f_c2');
    const filler = createFrameWithSlots('other', {}, 'f_x');

    const ctx = makeCtx(
      [parent, child1, child2, filler],
      [
        createRelation('f_c1', 'f_p', 'elaborates'),
        createRelation('f_c2', 'f_p', 'elaborates'),
      ]
    );

    const result = await nesterAgent.run(ctx, provider);
    const parentResult = result.content.frames[0];

    // Original 'activity' slot preserved, children get suffixed keys
    expect(parentResult.slots.activity).toBe('existing');
    expect((parentResult.slots.activity_2 as any)?.type).toBe('activity');
    expect((parentResult.slots.activity_3 as any)?.type).toBe('activity');
  });

  it('handles cycles gracefully via visited set', async () => {
    resetFrameIds();
    const f1 = createFrameWithSlots('a', { x: 1 }, 'f_1');
    const f2 = createFrameWithSlots('b', { y: 2 }, 'f_2');
    const f3 = createFrameWithSlots('c', { z: 3 }, 'f_3');

    // Cycle: f_2 → f_1, f_1 → f_2 (via different relation)
    const ctx = makeCtx(
      [f1, f2, f3],
      [
        createRelation('f_2', 'f_1', 'elaborates'),
        createRelation('f_1', 'f_2', 'conditions'),
      ]
    );

    // Should not throw or infinite loop
    const result = await nesterAgent.run(ctx, provider);
    expect(result.content.frames.length).toBeGreaterThan(0);
  });

  it('returns unchanged content when no nesting is possible', async () => {
    resetFrameIds();
    const f1 = createFrameWithSlots('a', { x: 1 }, 'f_1');
    const f2 = createFrameWithSlots('b', { y: 2 }, 'f_2');
    const f3 = createFrameWithSlots('c', { z: 3 }, 'f_3');

    // Relations with non-nesting type
    const ctx = makeCtx(
      [f1, f2, f3],
      [{ from: 'f_1', to: 'f_2', type: 'supports' } as any]
    );

    const result = await nesterAgent.run(ctx, provider);
    // 'supports' is not in NESTING_RELATIONS, so no nesting happens
    expect(result.content.frames).toHaveLength(3);
  });
});
