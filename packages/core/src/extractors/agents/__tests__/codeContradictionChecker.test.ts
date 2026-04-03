import { describe, expect, test } from 'vitest';
import type { TreeNode } from '../../../semantic/types';
import type { PipelineContext } from '../../meaningPipeline';
import { contradictionCheckerAgent } from '../contradictionCheckerAgent';

function makeCtx(trees: TreeNode[], userMessages: string[]): PipelineContext {
  return {
    content: { trees, relations: [] },
    turns: userMessages.map((content) => ({ role: 'user' as const, content })),
    meta: {
      mode: 'full',
      completedAgents: [],
      agentErrors: [],
      stepSnapshots: [],
      totalUsage: { inputTokens: 0, outputTokens: 0 },
    },
    quality: { score: 50, frameCount: trees.length, maxDepth: 1, duplicateTypes: 0 },
  } as PipelineContext;
}

function tree(key: string, slots: Record<string, string>): TreeNode {
  return { key, slots, children: [] };
}

describe('code contradiction checker', () => {
  test('flags slots matching "avoid X" pattern', async () => {
    const ctx = makeCtx(
      [tree('route', { cities: 'Tokyo, Osaka', activities: 'temple visit' })],
      ['I want to avoid Osaka']
    );
    const result = await contradictionCheckerAgent.run(ctx, null as any);
    const route = result.content.trees.find((t) => t.key === 'route')!;
    expect(route.slots.cities).toBeDefined();
    expect(route.slots._conflicts).toBeDefined();
  });

  test('does NOT delete any slots or trees', async () => {
    const ctx = makeCtx(
      [tree('food', { dish: 'peanut noodles', drink: 'tea' })],
      ['I have a peanut allergy']
    );
    const result = await contradictionCheckerAgent.run(ctx, null as any);
    const food = result.content.trees.find((t) => t.key === 'food')!;
    expect(Object.keys(food.slots)).toContain('dish');
    expect(Object.keys(food.slots)).toContain('drink');
    expect(result.content.trees).toHaveLength(1);
  });

  test('does nothing when no negative keywords found', async () => {
    const ctx = makeCtx(
      [tree('trip', { dest: 'Beijing', budget: '3000' })],
      ['I want to visit Beijing with a 3000 dollar budget']
    );
    const result = await contradictionCheckerAgent.run(ctx, null as any);
    const trip = result.content.trees.find((t) => t.key === 'trip')!;
    expect(trip.slots._conflicts).toBeUndefined();
  });

  test('is CODE-only (usesLLM=false)', () => {
    expect(contradictionCheckerAgent.usesLLM).toBe(false);
  });

  test('skips in incremental mode', () => {
    const ctx = makeCtx([], []);
    ctx.meta.mode = 'incremental';
    expect(contradictionCheckerAgent.shouldRun(ctx)).toBe(false);
  });
});
