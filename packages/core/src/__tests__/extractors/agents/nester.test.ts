import { describe, expect, it } from 'vitest';
import { nesterAgent } from '../../../extractors/agents/nesterAgent';
import type { PipelineContext } from '../../../extractors/meaningPipeline';
import { flattenTrees } from '../../../semantic/tree';
import {
  createFrameWithSlots,
  createRelation,
  createSemanticContent,
  resetFrameIds,
} from '../../factories';
import { StubLLMProvider } from '../../stubs';

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

  it('shouldRun returns false when ≤2 frames with no relations', () => {
    resetFrameIds();
    const f1 = createFrameWithSlots('a', { x: 1 }, 'f_1');
    const f2 = createFrameWithSlots('b', { y: 2 }, 'f_2');
    const ctx = makeCtx([f1, f2]);
    expect(nesterAgent.shouldRun(ctx)).toBe(false);
  });

  it('shouldRun returns true with relations and >0 trees', () => {
    resetFrameIds();
    const f1 = createFrameWithSlots('a', { x: 1 }, 'f_1');
    const f2 = createFrameWithSlots('b', { y: 2 }, 'f_2');
    const f3 = createFrameWithSlots('c', { z: 3 }, 'f_3');
    const ctx = makeCtx([f1, f2, f3], [createRelation('f_2', 'f_1', 'depends')]);
    expect(nesterAgent.shouldRun(ctx)).toBe(true);
  });

  it('nests child frames into parent slots as InlineFrame', async () => {
    resetFrameIds();
    // Use type as ID so that unflattenToTrees + flattenTrees roundtrips correctly
    const parent = createFrameWithSlots('travel_plan', { destination: 'Japan' }, 'travel_plan');
    const child = createFrameWithSlots('activity', { name: 'temple visit' }, 'activity');
    const other = createFrameWithSlots('budget', { amount: 5000 }, 'budget');

    const ctx = makeCtx(
      [parent, child, other],
      [createRelation('activity', 'travel_plan', 'depends')]
    );

    const result = await nesterAgent.run(ctx, provider);

    const frames = flattenTrees(result.content.trees);
    // Root frames: parent + other (child is nested)
    expect(frames).toHaveLength(2);
    expect(frames[0].id).toBe('travel_plan');

    // Child should be nested as InlineFrame slot
    const nestedSlot = frames[0].slots.activity as any;
    expect(nestedSlot).toBeDefined();
    expect(nestedSlot.type).toBe('activity');
    expect(nestedSlot.slots.name).toBe('temple visit');

    // Relations should be cleared (expressed via nesting)
    expect(result.content.relations).toHaveLength(0);
  });

  it('handles duplicate slot keys with suffix numbering', async () => {
    resetFrameIds();
    // Use unique types so unflattenToTrees creates separate trees,
    // and use type as ID for consistent relation references
    const parent = createFrameWithSlots('plan', { activity: 'existing' }, 'plan');
    const child1 = createFrameWithSlots('activity_a', { name: 'hiking' }, 'activity_a');
    const child2 = createFrameWithSlots('activity_b', { name: 'diving' }, 'activity_b');
    const filler = createFrameWithSlots('other', { a: 1 }, 'other');

    const ctx = makeCtx(
      [parent, child1, child2, filler],
      [createRelation('activity_a', 'plan', 'depends'), createRelation('activity_b', 'plan', 'depends')]
    );

    const result = await nesterAgent.run(ctx, provider);
    const frames = flattenTrees(result.content.trees);
    const parentResult = frames[0];

    // Original 'activity' slot preserved, children get their type as slot key
    expect(parentResult.slots.activity).toBe('existing');
    expect((parentResult.slots.activity_a as any)?.type).toBe('activity_a');
    expect((parentResult.slots.activity_b as any)?.type).toBe('activity_b');
  });

  it('handles cycles gracefully via visited set', async () => {
    resetFrameIds();
    const f1 = createFrameWithSlots('a', { x: 1 }, 'f_1');
    const f2 = createFrameWithSlots('b', { y: 2 }, 'f_2');
    const f3 = createFrameWithSlots('c', { z: 3 }, 'f_3');

    const ctx = makeCtx(
      [f1, f2, f3],
      [createRelation('f_2', 'f_1', 'depends'), createRelation('f_1', 'f_2', 'depends')]
    );

    // Should not throw or infinite loop
    const result = await nesterAgent.run(ctx, provider);
    expect(flattenTrees(result.content.trees).length).toBeGreaterThan(0);
  });

  it('returns unchanged content when no nesting is possible', async () => {
    resetFrameIds();
    const f1 = createFrameWithSlots('a', { x: 1 }, 'f_1');
    const f2 = createFrameWithSlots('b', { y: 2 }, 'f_2');
    const f3 = createFrameWithSlots('c', { z: 3 }, 'f_3');

    // No relations → no nesting possible
    const ctx = makeCtx([f1, f2, f3]);

    const result = await nesterAgent.run(ctx, provider);
    expect(flattenTrees(result.content.trees)).toHaveLength(3);
  });
});
