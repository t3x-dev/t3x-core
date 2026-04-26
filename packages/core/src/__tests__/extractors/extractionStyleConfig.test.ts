// packages/core/src/__tests__/extractors/extractionStyleConfig.test.ts
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STYLE,
  type ExtractionStyleConfig,
  matchPreset,
  PRESETS,
  styleSummaryLine,
} from '../../extractors/extractionStyleConfig';

describe('ExtractionStyleConfig', () => {
  it('DEFAULT_STYLE equals balanced preset', () => {
    expect(DEFAULT_STYLE).toEqual(PRESETS.balanced);
  });

  it('all presets have valid fields', () => {
    for (const [_name, preset] of Object.entries(PRESETS)) {
      expect(preset.granularity).toBeDefined();
      expect(preset.quote_length).toBeDefined();
      expect(preset.update_stance).toBeDefined();
      expect(preset.tier3).toBeDefined();
    }
  });

  it('matchPreset returns preset name when config matches', () => {
    expect(matchPreset(PRESETS.concise)).toBe('concise');
    expect(matchPreset(PRESETS.balanced)).toBe('balanced');
    expect(matchPreset(PRESETS.detailed)).toBe('detailed');
  });

  it('matchPreset returns null for custom config', () => {
    const custom: ExtractionStyleConfig = {
      granularity: 'concise',
      quote_length: 'contextual',
      update_stance: 'conservative',
      tier3: 'extract',
    };
    expect(matchPreset(custom)).toBeNull();
  });

  it('matchPreset distinguishes a custom max_items from the built-in preset cap', () => {
    // Regression: before max_items was added to the comparison, a
    // custom config that differed ONLY by the cap was reported as
    // the built-in preset. Deterministic budget behaviour diverges
    // (e.g. concise + max_items=10 keeps 10 items vs the preset's
    // 6), so the helper must not lie about the match.
    const conciseWithCustomCap: ExtractionStyleConfig = {
      granularity: 'concise',
      quote_length: 'representative',
      update_stance: 'conservative',
      tier3: 'extract',
      max_items: 10, // PRESETS.concise.max_items is 6
    };
    expect(matchPreset(conciseWithCustomCap)).toBeNull();

    const balancedWithCustomCap: ExtractionStyleConfig = {
      granularity: 'balanced',
      quote_length: 'representative',
      update_stance: 'balanced',
      tier3: 'extract',
      max_items: 50, // PRESETS.balanced.max_items is 20
    };
    expect(matchPreset(balancedWithCustomCap)).toBeNull();
  });

  it('matchPreset still matches detailed when max_items is undefined on both sides', () => {
    // Defence: PRESETS.detailed has no max_items (capture nuance —
    // no cap). A config matching the four core fields without a
    // cap must still resolve to the 'detailed' preset name, not
    // null, because `undefined === undefined` holds.
    const detailedNoCap: ExtractionStyleConfig = {
      granularity: 'detailed',
      quote_length: 'representative',
      update_stance: 'aggressive',
      tier3: 'extract',
    };
    expect(matchPreset(detailedNoCap)).toBe('detailed');
  });

  it('matchPreset distinguishes detailed-with-cap from preset detailed (no cap)', () => {
    // The inverse: detailed + an explicit cap is NOT the built-in
    // detailed preset, since the deterministic selection step
    // would now run.
    const detailedWithCap: ExtractionStyleConfig = {
      granularity: 'detailed',
      quote_length: 'representative',
      update_stance: 'aggressive',
      tier3: 'extract',
      max_items: 100,
    };
    expect(matchPreset(detailedWithCap)).toBeNull();
  });
});

describe('styleSummaryLine', () => {
  it('returns concise summary for concise preset', () => {
    const line = styleSummaryLine(PRESETS.concise);
    expect(line).toContain('concise');
    expect(line).toContain('30%');
  });

  it('returns balanced summary for balanced preset', () => {
    const line = styleSummaryLine(PRESETS.balanced);
    expect(line).toContain('balanced');
  });

  it('returns detailed summary for detailed preset', () => {
    const line = styleSummaryLine(PRESETS.detailed);
    expect(line).toContain('detailed');
  });

  it('returns custom summary for non-preset config', () => {
    const line = styleSummaryLine({
      granularity: 'concise',
      quote_length: 'contextual',
      update_stance: 'aggressive',
      tier3: 'extract',
    });
    expect(line).toContain('custom');
    expect(line).toContain('concise');
  });
});
