import { describe, expect, test } from 'vitest';
import type { TreeNode } from '../../../semantic/types';
import { fuzzyQuoteValidatorAgent } from '../fuzzyQuoteValidator';
import type { PipelineContext } from '../../meaningPipeline';

function makeCtx(trees: TreeNode[], turns: Array<{ role: string; content: string }>): PipelineContext {
  return {
    content: { trees, relations: [] },
    turns,
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

describe('fuzzy quote validator', () => {
  test('keeps confidence when quote matches conversation', async () => {
    const tree: TreeNode = {
      key: 'trip',
      slots: { budget: '3000' },
      children: [],
      slot_quotes: { budget: '$3000 budget' },
      confidence: 0.9,
    };
    const ctx = makeCtx([tree], [
      { role: 'user', content: 'I have a $3000 budget for this trip' },
    ]);
    const result = await fuzzyQuoteValidatorAgent.run(ctx, null as any);
    expect(result.content.trees[0].confidence).toBe(0.9);
  });

  test('reduces confidence when quote does not match any turn', async () => {
    const tree: TreeNode = {
      key: 'trip',
      slots: { budget: '3000' },
      children: [],
      slot_quotes: { budget: 'completely made up text that is not in conversation' },
      confidence: 0.9,
    };
    const ctx = makeCtx([tree], [
      { role: 'user', content: 'I want to visit Beijing' },
    ]);
    const result = await fuzzyQuoteValidatorAgent.run(ctx, null as any);
    expect(result.content.trees[0].confidence).toBeLessThan(0.9);
  });

  test('handles trees without slot_quotes gracefully', async () => {
    const tree: TreeNode = {
      key: 'trip',
      slots: { dest: 'Beijing' },
      children: [],
    };
    const ctx = makeCtx([tree], [
      { role: 'user', content: 'I want to visit Beijing' },
    ]);
    const result = await fuzzyQuoteValidatorAgent.run(ctx, null as any);
    expect(result.content.trees[0].key).toBe('trip');
  });

  test('is CODE-only (usesLLM=false)', () => {
    expect(fuzzyQuoteValidatorAgent.usesLLM).toBe(false);
  });

  test('always runs when trees exist', () => {
    const ctx = makeCtx(
      [{ key: 'a', slots: {}, children: [] }],
      [{ role: 'user', content: 'hello' }]
    );
    expect(fuzzyQuoteValidatorAgent.shouldRun(ctx)).toBe(true);
  });
});
