// packages/core/src/__tests__/extractors/promptSegments.test.ts
import { describe, expect, it } from 'vitest';
import { PRESETS } from '../../extractors/extractionStyleConfig';
import { buildFrameExtractionPrompt } from '../../extractors/frameExtractionPrompt';

describe('Prompt segment composition', () => {
  const baseTurns = [
    { role: 'user' as const, content: 'I want to open a coffee shop' },
    { role: 'assistant' as const, content: 'Great idea! Where would you like it?' },
  ];

  describe('granularity', () => {
    it('concise: includes 3-5 frame range and 1-3 slots', () => {
      const { systemPrompt } = buildFrameExtractionPrompt({ turns: baseTurns }, PRESETS.concise);
      expect(systemPrompt).toContain('3-5');
      expect(systemPrompt).toContain('1-3');
      expect(systemPrompt).not.toContain('3-8');
    });

    it('balanced: includes 3-8 frame range and 1-4 slots (default)', () => {
      const { systemPrompt } = buildFrameExtractionPrompt({ turns: baseTurns }, PRESETS.balanced);
      expect(systemPrompt).toContain('3-8');
      expect(systemPrompt).toContain('1-4');
    });

    it('detailed: includes 5-12 frame range and 2-6 slots', () => {
      const { systemPrompt } = buildFrameExtractionPrompt({ turns: baseTurns }, PRESETS.detailed);
      expect(systemPrompt).toContain('5-12');
      expect(systemPrompt).toContain('2-6');
    });
  });

  describe('tier3', () => {
    it('skip: tells LLM not to extract TIER 3', () => {
      const { systemPrompt } = buildFrameExtractionPrompt(
        { turns: baseTurns },
        PRESETS.concise // tier3: 'skip'
      );
      expect(systemPrompt).toContain('Do NOT extract');
      expect(systemPrompt).not.toContain('0.4-0.5');
    });

    it('extract: includes TIER 3 with confidence range', () => {
      const { systemPrompt } = buildFrameExtractionPrompt(
        { turns: baseTurns },
        PRESETS.balanced // tier3: 'extract'
      );
      expect(systemPrompt).toContain('0.4-0.5');
    });
  });

  describe('quote_length', () => {
    it('minimal: includes shortest substring rule', () => {
      const { systemPrompt } = buildFrameExtractionPrompt(
        { turns: baseTurns },
        PRESETS.balanced // quote_length: 'minimal'
      );
      expect(systemPrompt).toContain('MINIMAL');
    });

    it('contextual: includes context guidance', () => {
      const { systemPrompt } = buildFrameExtractionPrompt(
        { turns: baseTurns },
        PRESETS.detailed // quote_length: 'contextual'
      );
      expect(systemPrompt).toContain('context');
      expect(systemPrompt).not.toContain('MINIMAL');
    });
  });

  describe('update_stance', () => {
    it('conservative: includes conservative rules', () => {
      const { systemPrompt } = buildFrameExtractionPrompt(
        { turns: baseTurns },
        PRESETS.concise // update_stance: 'conservative'
      );
      expect(systemPrompt).toContain('Conservative');
    });

    it('balanced: no extra update stance section', () => {
      const { systemPrompt } = buildFrameExtractionPrompt(
        { turns: baseTurns },
        PRESETS.balanced // update_stance: 'balanced'
      );
      expect(systemPrompt).not.toContain('Update Stance');
    });

    it('aggressive: includes aggressive rules', () => {
      const { systemPrompt } = buildFrameExtractionPrompt(
        { turns: baseTurns },
        PRESETS.detailed // update_stance: 'aggressive'
      );
      expect(systemPrompt).toContain('Aggressive');
    });
  });

  describe('backward compatibility', () => {
    it('no style param produces same output as balanced', () => {
      const withoutStyle = buildFrameExtractionPrompt({ turns: baseTurns });
      const withBalanced = buildFrameExtractionPrompt({ turns: baseTurns }, PRESETS.balanced);
      expect(withoutStyle.systemPrompt).toEqual(withBalanced.systemPrompt);
      expect(withoutStyle.userPrompt).toEqual(withBalanced.userPrompt);
    });
  });

  describe('delta mode segments', () => {
    const snapshot = {
      frames: [{ id: 'f_001', type: 'coffee_shop', slots: { location: 'Portland' } }],
      relations: [],
    };

    it('delta mode also uses style segments', () => {
      const { systemPrompt } = buildFrameExtractionPrompt(
        { turns: baseTurns, snapshot },
        PRESETS.concise
      );
      expect(systemPrompt).toContain('3-5');
      expect(systemPrompt).toContain('Do NOT extract');
    });
  });
});
