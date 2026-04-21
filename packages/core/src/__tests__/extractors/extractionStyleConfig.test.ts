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
