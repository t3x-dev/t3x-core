// packages/core/src/extractors/extractionStyleConfig.ts

export type Granularity = 'concise' | 'balanced' | 'detailed';
export type QuoteLength = 'minimal' | 'contextual';
export type UpdateStance = 'conservative' | 'balanced' | 'aggressive';
export type Tier3Behavior = 'skip' | 'extract';
export type PresetName = 'concise' | 'balanced' | 'detailed';

export interface ExtractionStyleConfig {
  granularity: Granularity;
  quote_length: QuoteLength;
  update_stance: UpdateStance;
  tier3: Tier3Behavior;
}

export const PRESETS: Record<PresetName, ExtractionStyleConfig> = {
  concise: {
    granularity: 'concise',
    quote_length: 'minimal',
    update_stance: 'conservative',
    tier3: 'skip',
  },
  balanced: {
    granularity: 'balanced',
    quote_length: 'contextual',
    update_stance: 'balanced',
    tier3: 'extract',
  },
  detailed: {
    granularity: 'detailed',
    quote_length: 'contextual',
    update_stance: 'aggressive',
    tier3: 'extract',
  },
};

export const DEFAULT_STYLE: ExtractionStyleConfig = PRESETS.detailed;

/** Returns the preset name if config matches a preset exactly, else null. */
export function matchPreset(config: ExtractionStyleConfig): PresetName | null {
  for (const [name, preset] of Object.entries(PRESETS) as [PresetName, ExtractionStyleConfig][]) {
    if (
      config.granularity === preset.granularity &&
      config.quote_length === preset.quote_length &&
      config.update_stance === preset.update_stance &&
      config.tier3 === preset.tier3
    ) {
      return name;
    }
  }
  return null;
}
