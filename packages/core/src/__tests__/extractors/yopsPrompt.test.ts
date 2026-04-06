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
        },
      ],
    },
  ],
  relations: [],
};

describe('buildYOpsPrompt', () => {
  describe('first extraction mode (no snapshot)', () => {
    it('system prompt mentions extraction and yops format', () => {
      const result = buildYOpsPrompt({ turns: sampleTurns });
      expect(result.systemPrompt).toContain('extraction');
      expect(result.systemPrompt).toContain('define');
      expect(result.systemPrompt).toContain('populate');
      expect(result.systemPrompt).toContain('source');
      expect(result.systemPrompt).toContain('yops:');
    });

    it('user prompt contains turns', () => {
      const result = buildYOpsPrompt({ turns: sampleTurns });
      expect(result.userPrompt).toContain('I want to travel to Tokyo');
      expect(result.userPrompt).toContain('[user]');
    });

    it('user prompt does not contain snapshot', () => {
      const result = buildYOpsPrompt({ turns: sampleTurns });
      expect(result.userPrompt).not.toContain('Current Tree');
    });
  });

  describe('incremental mode (with snapshot)', () => {
    it('system prompt contains incremental operations', () => {
      const result = buildYOpsPrompt({
        turns: sampleTurns,
        snapshot: sampleSnapshot,
      });
      expect(result.systemPrompt).toContain('set');
      expect(result.systemPrompt).toContain('define');
      expect(result.systemPrompt).toContain('populate');
      expect(result.systemPrompt).toContain('drop');
      expect(result.systemPrompt).toContain('unset');
    });

    it('snapshot tree appears in user prompt', () => {
      const result = buildYOpsPrompt({
        turns: sampleTurns,
        snapshot: sampleSnapshot,
      });
      expect(result.userPrompt).toContain('travel_plan:');
      expect(result.userPrompt).toContain('budget:');
      expect(result.userPrompt).toContain('"Tokyo"');
      expect(result.userPrompt).toContain('Current Tree');
    });
  });

  describe('processedTurnCount splits context vs new turns', () => {
    it('splits turns with processedTurnCount', () => {
      const result = buildYOpsPrompt({
        turns: sampleTurns,
        snapshot: sampleSnapshot,
        processedTurnCount: 2,
      });
      expect(result.userPrompt).toContain('Context');
      expect(result.userPrompt).toContain('NEW');
      expect(result.userPrompt).toContain('Around $3000');
    });

    it('treats all turns as new when processedTurnCount is 0', () => {
      const result = buildYOpsPrompt({
        turns: sampleTurns,
        snapshot: sampleSnapshot,
        processedTurnCount: 0,
      });
      expect(result.userPrompt).toContain('Conversation');
    });
  });
});
