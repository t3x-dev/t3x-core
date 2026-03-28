import { describe, expect, it } from 'vitest';
import { buildYOpsPrompt } from '../../extractors/yopsPrompt';
import type { ExtractionTurn } from '../../extractors/yopsPrompt';
import type { SemanticContent } from '../../semantic/types';

const sampleTurns: ExtractionTurn[] = [
  { role: 'user', content: 'I want to travel to Tokyo next month' },
  {
    role: 'assistant',
    content: 'Great! Tokyo is wonderful in spring. Do you have a budget in mind?',
  },
  { role: 'user', content: 'Around $3000 for the whole trip' },
];

const sampleSnapshot: SemanticContent = {
  trees: [
    {
      key: 'travel_plan',
      slots: { destination: 'Tokyo', timeframe: 'next month' },
      children: [
        {
          key: 'budget',
          slots: { amount: 3000, currency: 'USD' },
          children: [],
          confidence: 0.9,
        },
      ],
      confidence: 0.95,
    },
  ],
  relations: [],
};

describe('buildYOpsPrompt', () => {
  describe('first extraction mode (no snapshot)', () => {
    it('system prompt contains YAML topic tree and slot_quotes, NOT yops:', () => {
      const result = buildYOpsPrompt({ turns: sampleTurns });
      expect(result.systemPrompt).toContain('YAML');
      expect(result.systemPrompt).toContain('topic tree');
      expect(result.systemPrompt).toContain('slot_quotes');
      expect(result.systemPrompt).not.toContain('yops:');
    });

    it('user prompt contains turns but no snapshot', () => {
      const result = buildYOpsPrompt({ turns: sampleTurns });
      expect(result.userPrompt).toContain('I want to travel to Tokyo');
      expect(result.userPrompt).toContain('[user]');
      expect(result.userPrompt).not.toContain('Snapshot');
    });

    it('user prompt asks to extract into a YAML topic tree', () => {
      const result = buildYOpsPrompt({ turns: sampleTurns });
      expect(result.userPrompt).toContain('YAML');
      expect(result.userPrompt).toContain('tree');
    });
  });

  describe('incremental mode (with snapshot)', () => {
    it('system prompt contains yops format markers', () => {
      const result = buildYOpsPrompt({
        turns: sampleTurns,
        snapshot: sampleSnapshot,
      });
      expect(result.systemPrompt).toContain('yops:');
      expect(result.systemPrompt).toContain('set:');
      expect(result.systemPrompt).toContain('add:');
      expect(result.systemPrompt).toContain('drop:');
    });

    it('system prompt does NOT contain JSON delta format markers', () => {
      const result = buildYOpsPrompt({
        turns: sampleTurns,
        snapshot: sampleSnapshot,
      });
      expect(result.systemPrompt).not.toContain('"action"');
      expect(result.systemPrompt).not.toContain('JSON Output Format');
    });

    it('system prompt contains unset operation', () => {
      const result = buildYOpsPrompt({
        turns: sampleTurns,
        snapshot: sampleSnapshot,
      });
      expect(result.systemPrompt).toContain('unset:');
    });

    it('snapshot tree appears in user prompt', () => {
      const result = buildYOpsPrompt({
        turns: sampleTurns,
        snapshot: sampleSnapshot,
      });
      expect(result.userPrompt).toContain('travel_plan:');
      expect(result.userPrompt).toContain('budget:');
      expect(result.userPrompt).toContain('"Tokyo"');
      expect(result.userPrompt).toContain('Current Snapshot');
    });

    it('user prompt references yops output', () => {
      const result = buildYOpsPrompt({
        turns: sampleTurns,
        snapshot: sampleSnapshot,
      });
      expect(result.userPrompt).toContain('yops');
    });
  });

  describe('style config is respected', () => {
    it('respects granularity override', () => {
      const result = buildYOpsPrompt({ turns: sampleTurns }, { granularity: 'concise' });
      expect(result.systemPrompt).toContain('1 Level');
      expect(result.systemPrompt).toContain('Root Only');
    });

    it('respects detailed granularity in incremental mode', () => {
      const result = buildYOpsPrompt(
        { turns: sampleTurns, snapshot: sampleSnapshot },
        { granularity: 'detailed' }
      );
      expect(result.systemPrompt).toContain('3 Levels');
    });

    it('respects tier3 skip behavior', () => {
      const result = buildYOpsPrompt({ turns: sampleTurns }, { tier3: 'skip' });
      expect(result.systemPrompt).toContain('Do NOT extract');
      expect(result.systemPrompt).not.toContain('0.4-0.5');
    });

    it('respects tier3 extract behavior in incremental mode', () => {
      const result = buildYOpsPrompt(
        { turns: sampleTurns, snapshot: sampleSnapshot },
        { tier3: 'extract' }
      );
      expect(result.systemPrompt).toContain('0.4-0.5');
    });

    it('respects contextual quote length', () => {
      const result = buildYOpsPrompt({ turns: sampleTurns }, { quote_length: 'contextual' });
      expect(result.systemPrompt).toContain('enough context');
    });

    it('respects aggressive update stance', () => {
      const result = buildYOpsPrompt(
        { turns: sampleTurns, snapshot: sampleSnapshot },
        { update_stance: 'aggressive' }
      );
      expect(result.systemPrompt).toContain('Aggressive');
    });
  });

  describe('processedTurnCount splits context vs new turns', () => {
    it('splits turns with processedTurnCount', () => {
      const result = buildYOpsPrompt({
        turns: sampleTurns,
        snapshot: sampleSnapshot,
        processedTurnCount: 2,
      });
      // First 2 turns are context
      expect(result.userPrompt).toContain('Context Turns');
      expect(result.userPrompt).toContain('NEW Turns');
      // The third turn should appear in the NEW section
      expect(result.userPrompt).toContain('Around $3000');
    });

    it('treats all turns as new when processedTurnCount is 0', () => {
      const result = buildYOpsPrompt({
        turns: sampleTurns,
        snapshot: sampleSnapshot,
        processedTurnCount: 0,
      });
      expect(result.userPrompt).toContain('New Conversation Turns');
      expect(result.userPrompt).not.toContain('Context Turns');
    });

    it('treats all turns as new when processedTurnCount is not provided', () => {
      const result = buildYOpsPrompt({
        turns: sampleTurns,
        snapshot: sampleSnapshot,
      });
      expect(result.userPrompt).toContain('New Conversation Turns');
      expect(result.userPrompt).not.toContain('Context Turns');
    });
  });

  describe('cross-tree relation types', () => {
    it('lists all 4 relation types in both modes', () => {
      const relationTypes = ['causes', 'contrasts', 'follows', 'depends'];

      const firstMode = buildYOpsPrompt({ turns: sampleTurns });
      for (const rt of relationTypes) {
        expect(firstMode.systemPrompt).toContain(rt);
      }

      const deltaMode = buildYOpsPrompt({
        turns: sampleTurns,
        snapshot: sampleSnapshot,
      });
      for (const rt of relationTypes) {
        expect(deltaMode.systemPrompt).toContain(rt);
      }
    });
  });
});
