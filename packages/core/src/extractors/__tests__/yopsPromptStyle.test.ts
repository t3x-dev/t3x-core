import { describe, expect, it } from 'vitest';
import type { ExtractionTurn } from '../extractionPrompt';
import { PRESETS } from '../extractionStyleConfig';
import { buildYOpsPrompt } from '../yopsPrompt';

const baseTurns: ExtractionTurn[] = [
  { role: 'user', content: 'I want to plan a trip to Tokyo' },
  { role: 'assistant', content: 'Great choice! Tokyo has amazing food and culture.' },
];

describe('buildYOpsPrompt — style integration', () => {
  describe('granularity', () => {
    it('concise style produces conclusions + why coverage guidance', () => {
      const { systemPrompt } = buildYOpsPrompt({ turns: baseTurns }, { style: PRESETS.concise });
      expect(systemPrompt).toContain('Conclusions + Why');
      expect(systemPrompt).toContain('30%');
    });

    it('balanced style produces decisions + options + steps coverage guidance', () => {
      const { systemPrompt } = buildYOpsPrompt({ turns: baseTurns }, { style: PRESETS.balanced });
      expect(systemPrompt).toContain('Decisions + Options + Steps');
    });

    it('detailed style produces everything including reasoning guidance', () => {
      const { systemPrompt } = buildYOpsPrompt({ turns: baseTurns }, { style: PRESETS.detailed });
      expect(systemPrompt).toContain('Everything Including Reasoning');
    });
  });

  describe('tier3', () => {
    it('all presets include AI content by default', () => {
      const { systemPrompt: concise } = buildYOpsPrompt(
        { turns: baseTurns },
        { style: PRESETS.concise }
      );
      const { systemPrompt: detailed } = buildYOpsPrompt(
        { turns: baseTurns },
        { style: PRESETS.detailed }
      );
      expect(concise).toContain('TIER 3');
      expect(concise).toContain('TIER 4');
      expect(detailed).toContain('TIER 3');
      expect(detailed).toContain('TIER 4');
    });

    it('skip mode tells LLM to not extract AI content when set explicitly', () => {
      const { systemPrompt } = buildYOpsPrompt(
        { turns: baseTurns },
        { style: { ...PRESETS.balanced, tier3: 'skip' } }
      );
      expect(systemPrompt).toContain('Do NOT extract');
    });
  });

  describe('quote_length', () => {
    it('all presets use representative quotes for click-to-highlight', () => {
      for (const preset of Object.values(PRESETS)) {
        const { systemPrompt } = buildYOpsPrompt({ turns: baseTurns }, { style: preset });
        expect(systemPrompt).toContain('REPRESENTATIVE');
      }
    });
  });

  describe('update_stance', () => {
    it('conservative stance is included in prompt', () => {
      const { systemPrompt } = buildYOpsPrompt({ turns: baseTurns }, { style: PRESETS.concise });
      expect(systemPrompt).toContain('Conservative');
    });

    it('aggressive stance is included in prompt', () => {
      const { systemPrompt } = buildYOpsPrompt({ turns: baseTurns }, { style: PRESETS.detailed });
      expect(systemPrompt).toContain('Aggressive');
    });
  });

  describe('defaults', () => {
    it('uses balanced style when no style provided', () => {
      const { systemPrompt } = buildYOpsPrompt({ turns: baseTurns });
      expect(systemPrompt).toContain('Decisions + Options + Steps');
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
        { style: PRESETS.concise }
      );
      expect(systemPrompt).toContain('Conclusions + Why');
    });
  });

  describe('dsl alignment', () => {
    const snapshot = {
      trees: [{ key: 'trip', slots: { destination: 'Tokyo' }, children: [] }],
      relations: [],
    };

    it('documents real op signatures for advanced ops', () => {
      const { systemPrompt } = buildYOpsPrompt({
        turns: baseTurns,
        snapshot,
        processedTurnCount: 0,
      });

      expect(systemPrompt).toContain('`nest: { path, keys, under }`');
      expect(systemPrompt).toContain('`fold: { path }`');
      expect(systemPrompt).toContain('`merge: { path, keys, into }`');
      expect(systemPrompt).toContain('`assert: { path, equals|exists|type }`');
    });

    it('does not describe drifted signatures for advanced ops', () => {
      const { systemPrompt } = buildYOpsPrompt({
        turns: baseTurns,
        snapshot,
        processedTurnCount: 0,
      });

      expect(systemPrompt).not.toContain('`nest: { path, under }`');
      expect(systemPrompt).not.toContain('`fold: { paths, into }`');
      expect(systemPrompt).not.toContain('`merge: { from, into }`');
      expect(systemPrompt).not.toContain('`assert: { path, operator, value }`');
    });

    it('presents core mutation ops as the default extraction subset', () => {
      const { systemPrompt } = buildYOpsPrompt({
        turns: baseTurns,
        snapshot,
        processedTurnCount: 0,
      });

      expect(systemPrompt).toContain('Most common (use first)');
      expect(systemPrompt).toContain('`define: { path }`');
      expect(systemPrompt).toContain('`set: { path, value }`');
      expect(systemPrompt).toContain('`populate: { path, values }`');
      expect(systemPrompt).toContain('`unset: { path }`');
      expect(systemPrompt).toContain('`drop: { path }`');
      expect(systemPrompt).toContain('`append: { path, value }`');
      expect(systemPrompt).toContain(
        '**IMPORTANT: Prefer updating existing structure over adding new nodes.**'
      );
    });
  });
});
