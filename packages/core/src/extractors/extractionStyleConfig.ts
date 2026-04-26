// packages/core/src/extractors/extractionStyleConfig.ts

export type Granularity = 'concise' | 'balanced' | 'detailed';
export type QuoteLength = 'minimal' | 'representative' | 'contextual';
export type UpdateStance = 'conservative' | 'balanced' | 'aggressive';
export type Tier3Behavior = 'skip' | 'extract';
export type PresetName = 'concise' | 'balanced' | 'detailed';

export interface ExtractionStyleConfig {
  granularity: Granularity;
  quote_length: QuoteLength;
  update_stance: UpdateStance;
  tier3: Tier3Behavior;
  /**
   * Deterministic ceiling on draft items — cap is applied at the
   * canonical-draft layer (post-lift, pre-compile) by selecting the
   * top-N items by confidence and dropping the rest with a warning.
   *
   * Operates on **items**, not compiled YOps. An item compiles into a
   * group of dependent ops (define + populate + nested children); cap
   * by item so each surviving item produces a complete, dependency-
   * correct op group.
   *
   * `undefined` means no cap (Detailed). The prompt is the soft layer;
   * this is the hard one.
   */
  max_items?: number;
}

export const PRESETS: Record<PresetName, ExtractionStyleConfig> = {
  concise: {
    granularity: 'concise',
    quote_length: 'representative',
    update_stance: 'conservative',
    tier3: 'extract',
    max_items: 6,
  },
  balanced: {
    granularity: 'balanced',
    quote_length: 'representative',
    update_stance: 'balanced',
    tier3: 'extract',
    max_items: 20,
  },
  detailed: {
    granularity: 'detailed',
    quote_length: 'representative',
    update_stance: 'aggressive',
    tier3: 'extract',
    // No cap — capture nuance.
  },
};

export const DEFAULT_STYLE: ExtractionStyleConfig = PRESETS.balanced;

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

/** Returns a one-line human-readable summary of the extraction style. */
export function styleSummaryLine(config: ExtractionStyleConfig): string {
  const preset = matchPreset(config);
  if (preset === 'concise') {
    return 'Extraction mode: concise — key points from user + LLM (~30% coverage), flat tree';
  }
  if (preset === 'balanced') {
    return 'Extraction mode: balanced — all substantive content from user + LLM (~70-80% coverage)';
  }
  if (preset === 'detailed') {
    return 'Extraction mode: detailed — everything including nuance (~95% coverage), deep tree';
  }
  return `Extraction mode: custom — granularity=${config.granularity}, quotes=${config.quote_length}, stance=${config.update_stance}, ai_content=${config.tier3}`;
}
