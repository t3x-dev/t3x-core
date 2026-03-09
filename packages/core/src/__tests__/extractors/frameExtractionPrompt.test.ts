import { describe, expect, it } from 'vitest';
import {
  buildFrameExtractionPrompt,
  type FrameExtractionTurn,
} from '../../extractors/frameExtractionPrompt';
import type { SemanticContent } from '../../semantic/types';

const sampleTurns: FrameExtractionTurn[] = [
  { role: 'user', content: 'I want to travel to Tokyo next month' },
  {
    role: 'assistant',
    content: 'Great! Tokyo is wonderful in spring. Do you have a budget in mind?',
  },
  { role: 'user', content: 'Around $3000 for the whole trip' },
];

const sampleSnapshot: SemanticContent = {
  frames: [
    {
      id: 'f_001',
      type: 'travel_plan',
      slots: { destination: 'Tokyo', timeframe: 'next month' },
      confidence: 0.95,
    },
    {
      id: 'f_002',
      type: 'budget_constraint',
      slots: { amount: 3000, currency: 'USD' },
      confidence: 0.9,
    },
  ],
  relations: [{ from: 'f_001', to: 'f_002', type: 'conditions', confidence: 0.85 }],
};

describe('buildFrameExtractionPrompt', () => {
  describe('returns system and user prompts', () => {
    it('returns an object with systemPrompt and userPrompt', () => {
      const result = buildFrameExtractionPrompt({ turns: sampleTurns });
      expect(result).toHaveProperty('systemPrompt');
      expect(result).toHaveProperty('userPrompt');
      expect(typeof result.systemPrompt).toBe('string');
      expect(typeof result.userPrompt).toBe('string');
    });
  });

  describe('first extraction mode (no snapshot)', () => {
    it('system prompt instructs full frame output', () => {
      const result = buildFrameExtractionPrompt({ turns: sampleTurns });
      expect(result.systemPrompt).toContain('frames');
      expect(result.systemPrompt).toContain('relations');
      // Should NOT mention delta/changes in first extraction mode
      expect(result.systemPrompt).not.toContain('delta');
      expect(result.systemPrompt).not.toContain('changes');
    });

    it('user prompt contains turns but no snapshot', () => {
      const result = buildFrameExtractionPrompt({ turns: sampleTurns });
      expect(result.userPrompt).toContain('I want to travel to Tokyo');
      expect(result.userPrompt).toContain('[user]');
      expect(result.userPrompt).toContain('[assistant]');
      expect(result.userPrompt).not.toContain('快照');
      expect(result.userPrompt).not.toContain('snapshot');
    });

    it('user prompt asks to extract all frames and relations', () => {
      const result = buildFrameExtractionPrompt({ turns: sampleTurns });
      expect(result.userPrompt).toContain('frames');
      expect(result.userPrompt).toContain('relations');
    });
  });

  describe('delta mode (with snapshot)', () => {
    it('system prompt instructs delta output', () => {
      const result = buildFrameExtractionPrompt({
        turns: sampleTurns,
        snapshot: sampleSnapshot,
      });
      expect(result.systemPrompt).toContain('delta');
    });

    it('includes snapshot in user prompt when provided', () => {
      const result = buildFrameExtractionPrompt({
        turns: sampleTurns,
        snapshot: sampleSnapshot,
      });
      // Should contain snapshot data as YAML-like text
      expect(result.userPrompt).toContain('travel_plan');
      expect(result.userPrompt).toContain('budget_constraint');
      expect(result.userPrompt).toContain('f_001');
      expect(result.userPrompt).toContain('f_002');
    });

    it('includes relations in snapshot section', () => {
      const result = buildFrameExtractionPrompt({
        turns: sampleTurns,
        snapshot: sampleSnapshot,
      });
      expect(result.userPrompt).toContain('conditions');
      expect(result.userPrompt).toContain('f_001');
      expect(result.userPrompt).toContain('f_002');
    });

    it('includes max frame id hint for new frames', () => {
      const result = buildFrameExtractionPrompt({
        turns: sampleTurns,
        snapshot: sampleSnapshot,
      });
      // Max existing id is f_002 → next should be f_003
      expect(result.userPrompt).toContain('f_003');
    });

    it('user prompt asks for delta output', () => {
      const result = buildFrameExtractionPrompt({
        turns: sampleTurns,
        snapshot: sampleSnapshot,
      });
      expect(result.userPrompt).toContain('changes');
      expect(result.userPrompt).toContain('new_relations');
    });
  });

  describe('system prompt includes all 6 relation types', () => {
    it('lists all relation types in both modes', () => {
      const relationTypes = [
        'causes',
        'conditions',
        'contrasts',
        'elaborates',
        'follows',
        'depends',
      ];

      const firstMode = buildFrameExtractionPrompt({ turns: sampleTurns });
      for (const rt of relationTypes) {
        expect(firstMode.systemPrompt).toContain(rt);
      }

      const deltaMode = buildFrameExtractionPrompt({
        turns: sampleTurns,
        snapshot: sampleSnapshot,
      });
      for (const rt of relationTypes) {
        expect(deltaMode.systemPrompt).toContain(rt);
      }
    });
  });

  describe('next frame ID calculation', () => {
    it('calculates next id from max existing id', () => {
      const snapshot: SemanticContent = {
        frames: [
          { id: 'f_010', type: 'test', slots: { a: 'b' } },
          { id: 'f_005', type: 'test2', slots: { c: 'd' } },
        ],
        relations: [],
      };
      const result = buildFrameExtractionPrompt({ turns: sampleTurns, snapshot });
      // Max is f_010, next should be f_011
      expect(result.userPrompt).toContain('f_011');
    });

    it('handles empty frames in snapshot', () => {
      const snapshot: SemanticContent = { frames: [], relations: [] };
      const result = buildFrameExtractionPrompt({ turns: sampleTurns, snapshot });
      // No frames → next should be f_001
      expect(result.userPrompt).toContain('f_001');
    });
  });

  describe('system prompt includes JSON output format', () => {
    it('specifies JSON output in first extraction mode', () => {
      const result = buildFrameExtractionPrompt({ turns: sampleTurns });
      expect(result.systemPrompt).toContain('JSON');
    });

    it('specifies JSON output in delta mode', () => {
      const result = buildFrameExtractionPrompt({
        turns: sampleTurns,
        snapshot: sampleSnapshot,
      });
      expect(result.systemPrompt).toContain('JSON');
    });
  });
});
