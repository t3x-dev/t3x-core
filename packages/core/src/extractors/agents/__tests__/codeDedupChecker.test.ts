import { describe, expect, test } from 'vitest';
import type { TreeNode } from '../../../semantic/types';
import type { PipelineContext } from '../../meaningPipeline';
import { dedupCheckerAgent } from '../dedupCheckerAgent';

function makeCtx(trees: TreeNode[]): PipelineContext {
  return {
    content: { trees, relations: [] },
    turns: [],
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

describe('code dedup checker', () => {
  test('does not run with fewer than 2 trees', () => {
    const ctx = makeCtx([tree('a', { x: '1' })]);
    expect(dedupCheckerAgent.shouldRun(ctx)).toBe(false);
  });

  test('runs with 2+ trees', () => {
    const ctx = makeCtx([tree('a', { x: '1' }), tree('b', { y: '2' })]);
    expect(dedupCheckerAgent.shouldRun(ctx)).toBe(true);
  });

  test('merges trees with identical keys', async () => {
    const ctx = makeCtx([
      tree('budget', { flights: '1000', rail: '420' }),
      tree('budget', { food: '30', activities: '200' }),
      tree('route', { cities: 'Tokyo' }),
      tree('dates', { start: 'Apr 20' }),
    ]);
    const result = await dedupCheckerAgent.run(ctx, null as any);
    const keys = result.content.trees.map((t) => t.key);
    expect(keys.filter((k) => k === 'budget')).toHaveLength(1);
    const merged = result.content.trees.find((t) => t.key === 'budget')!;
    expect(Object.keys(merged.slots)).toContain('flights');
    expect(Object.keys(merged.slots)).toContain('food');
  });

  test('keeps trees with different keys', async () => {
    const ctx = makeCtx([
      tree('budget', { flights: '1000' }),
      tree('route', { cities: 'Tokyo' }),
      tree('food', { dish: 'ramen' }),
      tree('dates', { start: 'Apr 20' }),
    ]);
    const result = await dedupCheckerAgent.run(ctx, null as any);
    expect(result.content.trees).toHaveLength(4);
  });

  test('is CODE-only (usesLLM=false)', () => {
    expect(dedupCheckerAgent.usesLLM).toBe(false);
  });
});
