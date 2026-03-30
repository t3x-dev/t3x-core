// packages/core/src/__tests__/extractors/promptSegments.test.ts
import { describe, expect, it } from 'vitest';
import { PRESETS } from '../../extractors/extractionStyleConfig';
import { buildExtractionPrompt } from '../../extractors/extractionPrompt';

describe('Prompt segment composition', () => {
  const baseTurns = [
    { role: 'user' as const, content: 'I want to open a coffee shop' },
    { role: 'assistant' as const, content: 'Great idea! Where would you like it?' },
  ];

  describe('granularity', () => {
    it('concise: includes 1 Level and 3-5 slots', () => {
      const { systemPrompt } = buildExtractionPrompt({ turns: baseTurns }, PRESETS.concise);
      expect(systemPrompt).toContain('1 Level');
      expect(systemPrompt).toContain('3-5 slots');
      expect(systemPrompt).not.toContain('2 Levels');
    });

    it('balanced: includes 3 Levels and comprehensive extraction (default)', () => {
      const { systemPrompt } = buildExtractionPrompt({ turns: baseTurns }, PRESETS.balanced);
      expect(systemPrompt).toContain('3 Levels');
      expect(systemPrompt).toContain('Extract ALL substantive information');
    });

    it('detailed: includes 3 Levels and 1-3 slots for grandchildren', () => {
      const { systemPrompt } = buildExtractionPrompt({ turns: baseTurns }, PRESETS.detailed);
      expect(systemPrompt).toContain('3 Levels');
      expect(systemPrompt).toContain('1-3 slots');
    });
  });

  describe('tier3', () => {
    it('skip: tells LLM not to extract TIER 3', () => {
      const { systemPrompt } = buildExtractionPrompt(
        { turns: baseTurns },
        PRESETS.concise // tier3: 'skip'
      );
      expect(systemPrompt).toContain('Do NOT extract');
      expect(systemPrompt).not.toContain('0.4-0.5');
    });

    it('extract: includes TIER 3 with confidence range', () => {
      const { systemPrompt } = buildExtractionPrompt(
        { turns: baseTurns },
        PRESETS.balanced // tier3: 'extract'
      );
      expect(systemPrompt).toContain('0.4-0.5');
    });
  });

  describe('quote_length', () => {
    it('minimal: includes shortest substring rule', () => {
      const { systemPrompt } = buildExtractionPrompt(
        { turns: baseTurns },
        PRESETS.concise // quote_length: 'minimal'
      );
      expect(systemPrompt).toContain('MINIMAL');
    });

    it('contextual: includes context guidance', () => {
      const { systemPrompt } = buildExtractionPrompt(
        { turns: baseTurns },
        PRESETS.detailed // quote_length: 'contextual'
      );
      expect(systemPrompt).toContain('context');
      expect(systemPrompt).not.toContain('MINIMAL');
    });
  });

  describe('update_stance', () => {
    it('conservative: includes conservative rules', () => {
      const { systemPrompt } = buildExtractionPrompt(
        { turns: baseTurns },
        PRESETS.concise // update_stance: 'conservative'
      );
      expect(systemPrompt).toContain('Conservative');
    });

    it('balanced: no extra update stance section', () => {
      const { systemPrompt } = buildExtractionPrompt(
        { turns: baseTurns },
        PRESETS.balanced // update_stance: 'balanced'
      );
      expect(systemPrompt).not.toContain('Update Stance');
    });

    it('aggressive: includes aggressive rules', () => {
      const { systemPrompt } = buildExtractionPrompt(
        { turns: baseTurns },
        PRESETS.detailed // update_stance: 'aggressive'
      );
      expect(systemPrompt).toContain('Aggressive');
    });
  });

  describe('backward compatibility', () => {
    it('no style param produces same output as detailed', () => {
      const withoutStyle = buildExtractionPrompt({ turns: baseTurns });
      const withDetailed = buildExtractionPrompt({ turns: baseTurns }, PRESETS.detailed);
      expect(withoutStyle.systemPrompt).toEqual(withDetailed.systemPrompt);
      expect(withoutStyle.userPrompt).toEqual(withDetailed.userPrompt);
    });
  });

  describe('delta mode segments', () => {
    const snapshot = {
      trees: [{ key: 'coffee_shop', slots: { location: 'Portland' }, children: [] }],
      relations: [],
    };

    it('delta mode also uses style segments', () => {
      const { systemPrompt } = buildExtractionPrompt(
        { turns: baseTurns, snapshot },
        PRESETS.concise
      );
      // Tree depth content for concise
      expect(systemPrompt).toContain('1 Level');
      expect(systemPrompt).toContain('Do NOT extract');
    });
  });
});
