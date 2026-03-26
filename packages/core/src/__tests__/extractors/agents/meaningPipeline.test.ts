import { beforeEach, describe, expect, it } from 'vitest';
import { createMeaningPipeline } from '../../../extractors/createMeaningPipeline';
import type { MeaningAgent } from '../../../extractors/meaningPipeline';
import { MeaningPipeline } from '../../../extractors/meaningPipeline';
import { flattenTrees } from '../../../semantic/tree';
import { createTypicalContent, resetFrameIds } from '../../factories';
import { StubLLMProvider } from '../../stubs';

let provider: StubLLMProvider;

beforeEach(() => {
  provider = new StubLLMProvider();
  resetFrameIds();
});

describe('MeaningPipeline', () => {
  describe('agent execution order', () => {
    it('runs agents in registration order', async () => {
      const order: string[] = [];

      const makeAgent = (name: string): MeaningAgent => ({
        name,
        description: `test ${name}`,
        usesLLM: false,
        shouldRun: () => true,
        run: async (ctx) => {
          order.push(name);
          return ctx;
        },
      });

      const pipeline = new MeaningPipeline(provider)
        .register(makeAgent('first'))
        .register(makeAgent('second'))
        .register(makeAgent('third'));

      const content = createTypicalContent();
      await pipeline.run(content, [{ role: 'user', content: 'test' }] as any[]);

      expect(order).toEqual(['first', 'second', 'third']);
    });

    it('skips agents where shouldRun returns false', async () => {
      const order: string[] = [];

      const pipeline = new MeaningPipeline(provider)
        .register({
          name: 'always',
          description: 'always runs',
          usesLLM: false,
          shouldRun: () => true,
          run: async (ctx) => {
            order.push('always');
            return ctx;
          },
        })
        .register({
          name: 'never',
          description: 'never runs',
          usesLLM: false,
          shouldRun: () => false,
          run: async (ctx) => {
            order.push('never');
            return ctx;
          },
        });

      await pipeline.run(createTypicalContent(), [{ role: 'user', content: 'test' }] as any[]);

      expect(order).toEqual(['always']);
    });
  });

  describe('quality gate rollback', () => {
    it('rolls back when agent produces 0 frames', async () => {
      const pipeline = new MeaningPipeline(provider).register({
        name: 'wiper',
        description: 'wipes all trees',
        usesLLM: false,
        shouldRun: () => true,
        run: async (ctx) => {
          ctx.content = { trees: [], relations: [] };
          return ctx;
        },
      });

      const content = createTypicalContent();
      const result = await pipeline.run(content, [{ role: 'user', content: 'test' }] as any[]);

      // Should rollback — trees preserved
      expect(flattenTrees(result.content.trees).length).toBeGreaterThan(0);
      expect(result.meta.agentErrors.some((e) => e.error.includes('ROLLBACK'))).toBe(true);
    });

    it('rolls back when quality drops more than 20 points', async () => {
      const pipeline = new MeaningPipeline(provider).register({
        name: 'degrader',
        description: 'makes quality worse',
        usesLLM: false,
        shouldRun: () => true,
        run: async (ctx) => {
          // Add many duplicate type trees to tank the quality score
          for (let i = 0; i < 20; i++) {
            ctx.content.trees.push({
              key: `spam_${i}`,
              slots: { n: i },
              children: [],
            });
          }
          return ctx;
        },
      });

      const content = createTypicalContent();
      const result = await pipeline.run(content, [{ role: 'user', content: 'test' }] as any[]);

      // Should rollback — original frame count preserved
      expect(flattenTrees(result.content.trees).length).toBe(3); // typical content has 3
      expect(result.meta.agentErrors.some((e) => e.error.includes('ROLLBACK'))).toBe(true);
    });
  });

  describe('graceful degradation', () => {
    it('continues when an agent throws', async () => {
      const pipeline = new MeaningPipeline(provider)
        .register({
          name: 'crasher',
          description: 'throws error',
          usesLLM: false,
          shouldRun: () => true,
          run: async () => {
            throw new Error('boom');
          },
        })
        .register({
          name: 'survivor',
          description: 'runs after crash',
          usesLLM: false,
          shouldRun: () => true,
          run: async (ctx) => {
            ctx.topicName = 'survived';
            return ctx;
          },
        });

      const result = await pipeline.run(createTypicalContent(), [
        { role: 'user', content: 'test' },
      ] as any[]);

      // Crasher error logged, survivor still ran
      expect(result.meta.agentErrors).toHaveLength(1);
      expect(result.meta.agentErrors[0].agent).toBe('crasher');
      expect(result.meta.agentErrors[0].error).toBe('boom');
      expect(result.topicName).toBe('survived');
    });
  });

  describe('step snapshots', () => {
    it('records snapshot after each agent', async () => {
      const pipeline = new MeaningPipeline(provider)
        .register({
          name: 'agent_a',
          description: 'a',
          usesLLM: false,
          shouldRun: () => true,
          run: async (ctx) => ctx,
        })
        .register({
          name: 'agent_b',
          description: 'b',
          usesLLM: false,
          shouldRun: () => true,
          run: async (ctx) => ctx,
        });

      const result = await pipeline.run(createTypicalContent(), [
        { role: 'user', content: 'test' },
      ] as any[]);

      // Initial snapshot + 2 agent snapshots
      expect(result.meta.stepSnapshots).toHaveLength(3);
      expect(result.meta.stepSnapshots[0].agent).toBe('extractor_output');
      expect(result.meta.stepSnapshots[1].agent).toBe('agent_a');
      expect(result.meta.stepSnapshots[2].agent).toBe('agent_b');

      // Each snapshot has quality metrics
      for (const snap of result.meta.stepSnapshots) {
        expect(snap.quality).toBeDefined();
        expect(typeof snap.quality.score).toBe('number');
        expect(typeof snap.quality.frameCount).toBe('number');
      }
    });
  });

  describe('createMeaningPipeline factory', () => {
    it('creates pipeline with all 7 default agents', async () => {
      provider
        .enqueue(JSON.stringify({ decision: 'keep_separate' })) // dedup
        .enqueue('japan_trip_plan') // topic_namer
        .enqueue(
          JSON.stringify({ slots: { destination: 'Tokyo', duration: '2 weeks', budget: 5000 } })
        ) // slot_polisher frame 1
        .enqueue(JSON.stringify({ slots: { item: 'Japanese food', sentiment: 'likes' } })) // slot_polisher frame 2
        .enqueue(JSON.stringify({ slots: { type: 'budget', value: 'under $5000' } })) // slot_polisher frame 3
        .enqueue(JSON.stringify({ status: 'approved', issues: [] })); // reviewer

      const pipeline = createMeaningPipeline(provider);
      const content = createTypicalContent();
      const turns = [
        {
          role: 'user',
          content: 'I want to plan a 2 week trip to Tokyo under $5000. I love Japanese food.',
        },
      ] as any[];

      const result = await pipeline.run(content, turns);

      expect(flattenTrees(result.content.trees).length).toBeGreaterThan(0);
      expect(result.quality).toBeDefined();
      expect(result.quality.score).toBeGreaterThan(0);
      expect(result.meta.completedAgents.length).toBeGreaterThan(0);
    });
  });
});
