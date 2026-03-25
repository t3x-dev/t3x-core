import { describe, expect, it } from 'vitest';
import {
  buildFrameExtractionPrompt,
  type FrameExtractionTurn,
} from '../../extractors/frameExtractionPrompt';
import type { SemanticContent, TreeNode } from '../../semantic/types';

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
  relations: [{ from: 'f_001', to: 'f_002', type: 'depends', confidence: 0.85 }],
};

const sampleTreeSnapshot: SemanticContent = {
  tree: {
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
  frames: [
    {
      id: 'travel_plan',
      type: 'travel_plan',
      slots: { destination: 'Tokyo', timeframe: 'next month' },
      confidence: 0.95,
    },
    {
      id: 'travel_plan/budget',
      type: 'budget',
      slots: { amount: 3000, currency: 'USD' },
      confidence: 0.9,
    },
  ],
  relations: [],
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
    it('system prompt instructs YAML tree output', () => {
      const result = buildFrameExtractionPrompt({ turns: sampleTurns });
      expect(result.systemPrompt).toContain('YAML');
      expect(result.systemPrompt).toContain('topic tree');
      // Should NOT mention delta/changes in first extraction mode
      expect(result.systemPrompt).not.toContain('delta');
      expect(result.systemPrompt).not.toContain('changes');
    });

    it('user prompt contains turns but no snapshot', () => {
      const result = buildFrameExtractionPrompt({ turns: sampleTurns });
      expect(result.userPrompt).toContain('I want to travel to Tokyo');
      expect(result.userPrompt).toContain('[user]');
      expect(result.userPrompt).toContain('[assistant]');
      expect(result.userPrompt).not.toContain('Snapshot');
    });

    it('user prompt asks to extract into a YAML topic tree', () => {
      const result = buildFrameExtractionPrompt({ turns: sampleTurns });
      expect(result.userPrompt).toContain('YAML');
      expect(result.userPrompt).toContain('tree');
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

    it('includes snapshot in user prompt when provided (legacy flat frames)', () => {
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

    it('includes relations in snapshot section (legacy)', () => {
      const result = buildFrameExtractionPrompt({
        turns: sampleTurns,
        snapshot: sampleSnapshot,
      });
      expect(result.userPrompt).toContain('depends');
      expect(result.userPrompt).toContain('f_001');
      expect(result.userPrompt).toContain('f_002');
    });

    it('serializes tree-native snapshot as YAML tree', () => {
      const result = buildFrameExtractionPrompt({
        turns: sampleTurns,
        snapshot: sampleTreeSnapshot,
      });
      // Tree-native snapshot should show tree structure, not flat frames
      expect(result.userPrompt).toContain('travel_plan:');
      expect(result.userPrompt).toContain('budget:');
      expect(result.userPrompt).toContain('"Tokyo"');
      // Should not contain frame-style "- id:" prefix
      expect(result.userPrompt).not.toContain('- id:');
    });

    it('user prompt asks for delta output with tree paths', () => {
      const result = buildFrameExtractionPrompt({
        turns: sampleTurns,
        snapshot: sampleSnapshot,
      });
      expect(result.userPrompt).toContain('delta');
      // Tree-native path instructions
      expect(result.userPrompt).toContain('parent_path');
      expect(result.userPrompt).toContain('target_path');
      // Update/remove guidance in user prompt
      expect(result.userPrompt).toContain('update');
      expect(result.userPrompt).toContain('remove');
    });

    it('system prompt contains parent_path and target_path', () => {
      const result = buildFrameExtractionPrompt({
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

      const firstMode = buildFrameExtractionPrompt({ turns: sampleTurns });
      for (const rt of relationTypes) {
        expect(firstMode.systemPrompt).toContain(rt);
      }
      // Should NOT contain "elaborates" in tree-native system prompts
      expect(firstMode.systemPrompt).not.toContain('elaborates');

      const deltaMode = buildFrameExtractionPrompt({
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
      const result = buildFrameExtractionPrompt({ turns: sampleTurns });
      expect(result.systemPrompt).toContain('YAML');
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
