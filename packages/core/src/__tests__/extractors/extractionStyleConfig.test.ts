// packages/core/src/__tests__/extractors/extractionStyleConfig.test.ts
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STYLE,
  type ExtractionStyleConfig,
  matchPreset,
  PRESETS,
  type PresetName,
} from '../../extractors/extractionStyleConfig';

describe('ExtractionStyleConfig', () => {
  it('DEFAULT_STYLE equals detailed preset', () => {
    expect(DEFAULT_STYLE).toEqual(PRESETS.detailed);
  });

  it('all presets have valid fields', () => {
    for (const [name, preset] of Object.entries(PRESETS)) {
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
