/**
 * Integration Test: Extraction → Pipeline → Commit-ready Content
 *
 * Validates the full flow from conversation turns through frame extraction
 * and meaning pipeline to commit-ready SemanticContent.
 */

import { describe, expect, it } from 'vitest';
import { createMeaningPipeline } from '../../extractors/createMeaningPipeline';
import type { SemanticContent } from '../../semantic/types';
import { StubLLMProvider } from '../stubs';

describe('extraction-to-commit integration', () => {
  it('pipeline produces valid SemanticContent from raw frames', async () => {
    const provider = new StubLLMProvider();

    // Simulate extractor output: raw frames before pipeline processing
    const rawContent: SemanticContent = {
      frames: [
        {
          id: 'f_001',
          type: 'travel_planning',
          slots: {
            destination: 'Tokyo',
            duration: '2 weeks',
            budget_amount: '$5000',
          },
        },
        {
          id: 'f_002',
          type: 'preference',
          slots: {
            item: 'Japanese food',
            sentiment: 'likes',
          },
        },
        {
          id: 'f_003',
          type: 'constraint',
          slots: {
            type: 'budget',
            value: 'under $5000',
          },
        },
      ],
      relations: [
        { from: 'f_002', to: 'f_001', type: 'elaborates' },
        { from: 'f_003', to: 'f_001', type: 'depends' },
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
    // dedup_checker won't run (<4 frames), topic_evolver won't run (first extraction)
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
    expect(result.content.frames.length).toBeGreaterThan(0);
    expect(result.quality).toBeDefined();
    expect(result.quality.score).toBeGreaterThan(0);

    // Pipeline should have completed some agents
    expect(result.meta.completedAgents.length).toBeGreaterThan(0);

    // Content should be valid SemanticContent
    for (const frame of result.content.frames) {
      expect(frame.id).toBeDefined();
      expect(frame.type).toBeDefined();
      expect(frame.slots).toBeDefined();
      expect(typeof frame.type).toBe('string');
      expect(typeof frame.slots).toBe('object');
    }

    // Topic name should be set (first extraction)
    expect(result.topicName).toBeDefined();

    // Step snapshots should record progression
    expect(result.meta.stepSnapshots.length).toBeGreaterThan(1);
  });

  it('pipeline handles empty input gracefully', async () => {
    const provider = new StubLLMProvider();
    const pipeline = createMeaningPipeline(provider);

    const emptyContent: SemanticContent = { frames: [], relations: [] };
    const result = await pipeline.run(emptyContent, [{ role: 'user', content: 'hello' }] as any[]);

    // No frames → content stays empty, some agents may run but produce no change
    expect(result.content.frames).toHaveLength(0);
  });

  it('pipeline delta update preserves existing content', async () => {
    const provider = new StubLLMProvider();

    const existingSnapshot: SemanticContent = {
      frames: [{ id: 'f_001', type: 'travel_plan', slots: { dest: 'Tokyo' } }],
      relations: [],
    };

    const updatedContent: SemanticContent = {
      frames: [
        { id: 'f_001', type: 'travel_plan', slots: { dest: 'Tokyo', duration: '2 weeks' } },
        { id: 'f_002', type: 'budget', slots: { amount: 5000 } },
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

    // Should still have frames
    expect(result.content.frames.length).toBeGreaterThan(0);
    // Not first extraction
    expect(result.meta.isFirstExtraction).toBe(false);
  });
});
