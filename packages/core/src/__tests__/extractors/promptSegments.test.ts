// packages/core/src/__tests__/extractors/promptSegments.test.ts
import { describe, expect, it } from 'vitest';
import { buildExtractionPrompt } from '../../extractors/extractionPrompt';
import { PRESETS } from '../../extractors/extractionStyleConfig';

describe('Prompt segment composition', () => {
  const baseTurns = [
    { role: 'user' as const, content: 'I want to open a coffee shop' },
    { role: 'assistant' as const, content: 'Great idea! Where would you like it?' },
  ];

  describe('granularity', () => {
    it('concise: includes conclusions + why coverage guidance', () => {
      const { systemPrompt } = buildExtractionPrompt({ turns: baseTurns }, PRESETS.concise);
      expect(systemPrompt).toContain('Conclusions + Why');
      expect(systemPrompt).toContain('30%');
    });

    it('balanced: includes decisions + options + steps guidance', () => {
      const { systemPrompt } = buildExtractionPrompt({ turns: baseTurns }, PRESETS.balanced);
      expect(systemPrompt).toContain('Decisions + Options + Steps');
      expect(systemPrompt).toContain('EVERY fact');
    });

    it('detailed: includes everything including reasoning guidance', () => {
      const { systemPrompt } = buildExtractionPrompt({ turns: baseTurns }, PRESETS.detailed);
      expect(systemPrompt).toContain('Everything Including Reasoning');
      expect(systemPrompt).toContain('MUST contain MORE content');
    });
  });

  describe('tier3', () => {
    it('skip: tells LLM not to extract TIER 3', () => {
      const { systemPrompt } = buildExtractionPrompt(
        { turns: baseTurns },
        { ...PRESETS.concise, tier3: 'skip' } // explicit skip
      );
      expect(systemPrompt).toContain('Do NOT extract');
      expect(systemPrompt).not.toContain('0.4-0.5');
    });

    it('extract: includes TIER 3 with score range', () => {
      const { systemPrompt } = buildExtractionPrompt(
        { turns: baseTurns },
        PRESETS.balanced // tier3: 'extract'
      );
      expect(systemPrompt).toContain('0.4-0.5');
    });
  });

  describe('quote_length', () => {
    it('all presets use representative quotes (for click-to-highlight)', () => {
      for (const preset of Object.values(PRESETS)) {
        const { systemPrompt } = buildExtractionPrompt({ turns: baseTurns }, preset);
        expect(systemPrompt).toContain('REPRESENTATIVE');
      }
    });

    it('minimal option still works when set explicitly', () => {
      const { systemPrompt } = buildExtractionPrompt(
        { turns: baseTurns },
        { ...PRESETS.concise, quote_length: 'minimal' }
      );
      expect(systemPrompt).toContain('MINIMAL');
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
    it('no style param produces same output as balanced (default)', () => {
      const withoutStyle = buildExtractionPrompt({ turns: baseTurns });
      const withBalanced = buildExtractionPrompt({ turns: baseTurns }, PRESETS.balanced);
      expect(withoutStyle.systemPrompt).toEqual(withBalanced.systemPrompt);
      expect(withoutStyle.userPrompt).toEqual(withBalanced.userPrompt);
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
      // Coverage content for concise
      expect(systemPrompt).toContain('Conclusions + Why');
      expect(systemPrompt).toContain('30%');
    });
  });
});
