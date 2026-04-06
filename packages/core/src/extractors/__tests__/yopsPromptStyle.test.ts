import { describe, expect, it } from 'vitest';
import { buildYOpsPrompt } from '../yopsPrompt';
import { PRESETS } from '../extractionStyleConfig';

const baseTurns = [
  { role: 'user', content: 'I want to plan a trip to Tokyo' },
  { role: 'assistant', content: 'Great choice! Tokyo has amazing food and culture.' },
];

describe('buildYOpsPrompt — style integration', () => {
  describe('granularity', () => {
    it('concise style produces flat depth guidance', () => {
      const { systemPrompt } = buildYOpsPrompt({ turns: baseTurns }, PRESETS.concise);
      expect(systemPrompt).toContain('1\u20132 Levels');
      expect(systemPrompt).toContain('FLAT');
    });

    it('balanced style produces 2-3 level depth guidance', () => {
      const { systemPrompt } = buildYOpsPrompt({ turns: baseTurns }, PRESETS.balanced);
      expect(systemPrompt).toContain('2\u20133 Levels');
    });

    it('detailed style produces 2-5 level depth guidance', () => {
      const { systemPrompt } = buildYOpsPrompt({ turns: baseTurns }, PRESETS.detailed);
      expect(systemPrompt).toContain('2\u20135 Levels');
    });
  });

  describe('tier3', () => {
    it('all presets include AI content by default', () => {
      const { systemPrompt: concise } = buildYOpsPrompt({ turns: baseTurns }, PRESETS.concise);
      const { systemPrompt: detailed } = buildYOpsPrompt({ turns: baseTurns }, PRESETS.detailed);
      expect(concise).toContain('TIER 3');
      expect(concise).toContain('TIER 4');
      expect(detailed).toContain('TIER 3');
      expect(detailed).toContain('TIER 4');
    });

    it('skip mode tells LLM to not extract AI content when set explicitly', () => {
      const { systemPrompt } = buildYOpsPrompt({ turns: baseTurns }, { ...PRESETS.balanced, tier3: 'skip' });
      expect(systemPrompt).toContain('Do NOT extract');
    });
  });

  describe('quote_length', () => {
    it('minimal style instructs shortest substring', () => {
      const { systemPrompt } = buildYOpsPrompt({ turns: baseTurns }, PRESETS.concise);
      expect(systemPrompt).toContain('MINIMAL');
    });

    it('contextual style instructs full context', () => {
      const { systemPrompt } = buildYOpsPrompt({ turns: baseTurns }, PRESETS.detailed);
      expect(systemPrompt).toContain('FULL CONTEXT');
    });
  });

  describe('update_stance', () => {
    it('conservative stance is included in prompt', () => {
      const { systemPrompt } = buildYOpsPrompt({ turns: baseTurns }, PRESETS.concise);
      expect(systemPrompt).toContain('Conservative');
    });

    it('aggressive stance is included in prompt', () => {
      const { systemPrompt } = buildYOpsPrompt({ turns: baseTurns }, PRESETS.detailed);
      expect(systemPrompt).toContain('Aggressive');
    });
  });

  describe('defaults', () => {
    it('uses detailed style when no style provided', () => {
      const { systemPrompt } = buildYOpsPrompt({ turns: baseTurns });
      expect(systemPrompt).toContain('2\u20135 Levels');
      expect(systemPrompt).toContain('TIER 4');
    });
  });

  describe('incremental mode', () => {
    it('includes style segments in incremental mode too', () => {
      const snapshot = {
        trees: [{ key: 'trip', slots: { destination: 'Tokyo' }, children: [] }],
        relations: [],
      };
      const { systemPrompt } = buildYOpsPrompt(
        { turns: baseTurns, snapshot, processedTurnCount: 0 },
        PRESETS.concise,
      );
      expect(systemPrompt).toContain('1\u20132 Levels');
    });
  });
});
