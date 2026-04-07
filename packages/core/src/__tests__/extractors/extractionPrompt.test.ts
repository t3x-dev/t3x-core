import { describe, expect, it } from 'vitest';
import {
  buildExtractionPrompt,
  type ExtractionTurn,
} from '../../extractors/extractionPrompt';
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

describe('buildExtractionPrompt', () => {
  describe('returns system and user prompts', () => {
    it('returns an object with systemPrompt and userPrompt', () => {
      const result = buildExtractionPrompt({ turns: sampleTurns });
      expect(result).toHaveProperty('systemPrompt');
      expect(result).toHaveProperty('userPrompt');
      expect(typeof result.systemPrompt).toBe('string');
      expect(typeof result.userPrompt).toBe('string');
    });
  });

  describe('first extraction mode (no snapshot)', () => {
    it('system prompt instructs YAML tree output', () => {
      const result = buildExtractionPrompt({ turns: sampleTurns });
      expect(result.systemPrompt).toContain('YAML');
      expect(result.systemPrompt).toContain('topic tree');
      expect(result.systemPrompt).not.toContain('delta');
      expect(result.systemPrompt).not.toContain('changes');
    });

    it('user prompt contains turns but no snapshot', () => {
      const result = buildExtractionPrompt({ turns: sampleTurns });
      expect(result.userPrompt).toContain('I want to travel to Tokyo');
      expect(result.userPrompt).toContain('[user]');
      expect(result.userPrompt).toContain('[assistant]');
      expect(result.userPrompt).not.toContain('Snapshot');
    });

    it('user prompt asks to extract into a YAML topic tree', () => {
      const result = buildExtractionPrompt({ turns: sampleTurns });
      expect(result.userPrompt).toContain('YAML');
      expect(result.userPrompt).toContain('tree');
    });
  });

  describe('delta mode (with snapshot)', () => {
    it('system prompt instructs incremental changes output', () => {
      const result = buildExtractionPrompt({
        turns: sampleTurns,
        snapshot: sampleSnapshot,
      });
      expect(result.systemPrompt).toContain('CHANGES');
    });

    it('includes snapshot in user prompt with tree structure', () => {
      const result = buildExtractionPrompt({
        turns: sampleTurns,
        snapshot: sampleSnapshot,
      });
      expect(result.userPrompt).toContain('travel_plan');
      expect(result.userPrompt).toContain('budget');
    });

    it('serializes tree-native snapshot as YAML tree', () => {
      const result = buildExtractionPrompt({
        turns: sampleTurns,
        snapshot: sampleSnapshot,
      });
      expect(result.userPrompt).toContain('travel_plan:');
      expect(result.userPrompt).toContain('budget:');
      expect(result.userPrompt).toContain('"Tokyo"');
      expect(result.userPrompt).not.toContain('- id:');
    });

    it('user prompt asks for changes output with tree paths', () => {
      const result = buildExtractionPrompt({
        turns: sampleTurns,
        snapshot: sampleSnapshot,
      });
      expect(result.userPrompt).toContain('changes');
      expect(result.userPrompt).toContain('parent_path');
      expect(result.userPrompt).toContain('target_path');
      expect(result.userPrompt).toContain('update');
      expect(result.userPrompt).toContain('remove');
    });

    it('system prompt contains parent_path and target_path', () => {
      const result = buildExtractionPrompt({
        turns: sampleTurns,
        snapshot: sampleSnapshot,
      });
      expect(result.systemPrompt).toContain('parent_path');
      expect(result.systemPrompt).toContain('target_path');
    });
  });

  describe('system prompt includes 4 cross-tree relation types', () => {
    it('lists all 4 cross-tree relation types in both modes', () => {
      const relationTypes = ['causes', 'contrasts', 'follows', 'depends'];

      const firstMode = buildExtractionPrompt({ turns: sampleTurns });
      for (const rt of relationTypes) {
        expect(firstMode.systemPrompt).toContain(rt);
      }
      expect(firstMode.systemPrompt).not.toContain('elaborates');

      const deltaMode = buildExtractionPrompt({
        turns: sampleTurns,
        snapshot: sampleSnapshot,
      });
      for (const rt of relationTypes) {
        expect(deltaMode.systemPrompt).toContain(rt);
      }
      expect(deltaMode.systemPrompt).not.toContain('elaborates');
    });
  });

  describe('system prompt output format', () => {
    it('specifies YAML output in first extraction mode', () => {
      const result = buildExtractionPrompt({ turns: sampleTurns });
      expect(result.systemPrompt).toContain('YAML');
    });

    it('specifies JSON output in delta mode', () => {
      const result = buildExtractionPrompt({
        turns: sampleTurns,
        snapshot: sampleSnapshot,
      });
      expect(result.systemPrompt).toContain('JSON');
    });
  });
});
