/**
 * Integration Test: Extraction → Pipeline → Commit-ready Content
 *
 * Validates the full flow from conversation turns through frame extraction
 * and meaning pipeline to commit-ready SemanticContent.
 */

import { describe, expect, it } from 'vitest';
import { createMeaningPipeline } from '../../extractors/createMeaningPipeline';
import { flattenTrees } from '../../semantic/tree';
import type { SemanticContent } from '../../semantic/types';
import { StubLLMProvider } from '../stubs';

describe('extraction-to-commit integration', () => {
  it('pipeline produces valid SemanticContent from raw trees', async () => {
    const provider = new StubLLMProvider();

    // Simulate extractor output: raw trees before pipeline processing
    const rawContent: SemanticContent = {
      trees: [
        {
          key: 'travel_planning',
          slots: {
            destination: 'Tokyo',
            duration: '2 weeks',
            budget_amount: '$5000',
          },
          children: [],
        },
        {
          key: 'preference',
          slots: {
            item: 'Japanese food',
            sentiment: 'likes',
          },
          children: [],
        },
        {
          key: 'constraint',
          slots: {
            type: 'budget',
            value: 'under $5000',
          },
          children: [],
        },
      ],
      relations: [
        { from: 'preference', to: 'travel_planning', type: 'depends' },
        { from: 'constraint', to: 'travel_planning', type: 'depends' },
      ],
    };

    const turns = [
      {
        role: 'user',
        content:
          'I want to plan a 2-week trip to Tokyo. Budget is under $5000. I love Japanese food.',
      },
      { role: 'assistant', content: 'Great! Tokyo is wonderful. Let me help you plan.' },
    ];

    // Enqueue responses for LLM agents
    provider
      .enqueue('tokyo_trip_plan') // topic_namer
      .enqueue(
        JSON.stringify({ slots: { destination: 'Tokyo', duration: '2 weeks', budget: 5000 } })
      ) // slot_polisher frame 1
      .enqueue(JSON.stringify({ slots: { item: 'Japanese food', sentiment: 'likes' } })) // slot_polisher frame 2
      .enqueue(JSON.stringify({ slots: { type: 'budget', value: 'under $5000' } })) // slot_polisher frame 3
      .enqueue(JSON.stringify({ status: 'approved', issues: [] })); // reviewer

    const pipeline = createMeaningPipeline(provider);
    const result = await pipeline.run(rawContent, turns as any[]);

    // Validate output structure
    const frames = flattenTrees(result.content.trees);
    expect(frames.length).toBeGreaterThan(0);
    expect(result.quality).toBeDefined();
    expect(result.quality.score).toBeGreaterThan(0);

    // Pipeline should have completed some agents
    expect(result.meta.completedAgents.length).toBeGreaterThan(0);

    // Content should be valid tree structure
    for (const tree of result.content.trees) {
      expect(tree.key).toBeDefined();
      expect(tree.slots).toBeDefined();
      expect(typeof tree.key).toBe('string');
      expect(typeof tree.slots).toBe('object');
    }

    // Topic name should be set (first extraction)
    expect(result.topicName).toBeDefined();

    // Step snapshots should record progression
    expect(result.meta.stepSnapshots.length).toBeGreaterThan(1);
  });

  it('pipeline handles empty input gracefully', async () => {
    const provider = new StubLLMProvider();
    const pipeline = createMeaningPipeline(provider);

    const emptyContent: SemanticContent = { trees: [], relations: [] };
    const result = await pipeline.run(emptyContent, [{ role: 'user', content: 'hello' }] as any[]);

    // No trees → content stays empty
    expect(flattenTrees(result.content.trees)).toHaveLength(0);
  });

  it('pipeline delta update preserves existing content', async () => {
    const provider = new StubLLMProvider();

    const existingSnapshot: SemanticContent = {
      trees: [{ key: 'travel_plan', slots: { dest: 'Tokyo' }, children: [] }],
      relations: [],
    };

    const updatedContent: SemanticContent = {
      trees: [
        { key: 'travel_plan', slots: { dest: 'Tokyo', duration: '2 weeks' }, children: [] },
        { key: 'budget', slots: { amount: 5000 }, children: [] },
      ],
      relations: [],
    };

    // topic_evolver runs on delta (not first extraction)
    provider
      .enqueue('tokyo_trip_plan') // topic_evolver
      .enqueue(JSON.stringify({ status: 'approved' })); // reviewer

    const pipeline = createMeaningPipeline(provider);
    const result = await pipeline.run(
      updatedContent,
      [{ role: 'user', content: 'My budget is $5000' }] as any[],
      existingSnapshot
    );

    // Should still have trees
    expect(flattenTrees(result.content.trees).length).toBeGreaterThan(0);
    // Not first extraction
    expect(result.meta.isFirstExtraction).toBe(false);
  });
});
