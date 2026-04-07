'use client';

import type {
  ExtractionStyleConfig,
  Granularity,
  PresetName,
  QuoteLength,
  Tier3Behavior,
  UpdateStance,
} from '@t3x-dev/core';
import { matchPreset, PRESETS } from '@t3x-dev/core';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const PRESET_DESCRIPTIONS: Record<PresetName, string> = {
  concise: 'Key facts only (~30%). Quick summary for busy readers.',
  balanced: 'All substantive content (~70-80%). Nothing important is lost. Default.',
  detailed: 'Everything including nuance (~95%). Complete mirror of the conversation.',
};

interface ExtractionStylePanelProps {
  value: ExtractionStyleConfig | null;
  onChange: (style: ExtractionStyleConfig | null) => void;
  /** If true, show "Use global default" toggle */
  showGlobalToggle?: boolean;
}

export function ExtractionStylePanel({
  value,
  onChange,
  showGlobalToggle,
}: ExtractionStylePanelProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const useGlobal = showGlobalToggle && value === null;
  const current = value ?? PRESETS.balanced;
  const currentPreset = matchPreset(current);

  const handlePresetChange = (preset: PresetName) => {
    onChange(PRESETS[preset]);
  };

  const handleDimensionChange = (key: keyof ExtractionStyleConfig, val: string) => {
    onChange({ ...current, [key]: val });
  };

  return (
    <section className="mb-8">
      <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1">Extraction Style</h2>
      <p className="text-xs text-[var(--text-tertiary)] mb-3">
        Controls how much detail is extracted from conversations.
      </p>

      {showGlobalToggle && (
        <div className="flex items-center gap-2 mb-3">
          <button
            type="button"
            onClick={() => onChange(useGlobal ? PRESETS.balanced : null)}
            className={cn(
              'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
              useGlobal ? 'bg-[var(--accent-commit)]' : 'bg-[var(--stroke-divider)]'
            )}
          >
            <span
              className={cn(
                'inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform',
                useGlobal ? 'translate-x-4' : 'translate-x-1'
              )}
            />
          </button>
          <span className="text-xs text-[var(--text-secondary)]">Use global default</span>
        </div>
      )}

      <div className={cn(useGlobal && 'opacity-40 pointer-events-none')}>
        {/* Preset buttons */}
        <div className="flex gap-2 mb-2">
          {(['concise', 'balanced', 'detailed'] as PresetName[]).map((name) => (
            <Button
              key={name}
              variant={currentPreset === name ? 'default' : 'outline'}
              size="sm"
              onClick={() => handlePresetChange(name)}
            >
              {name.charAt(0).toUpperCase() + name.slice(1)}
            </Button>
          ))}
          {currentPreset === null && (
            <Button variant="default" size="sm" disabled>
              Custom
            </Button>
          )}
        </div>
        <p className="text-xs text-[var(--text-tertiary)] mb-3">
          {currentPreset ? PRESET_DESCRIPTIONS[currentPreset] : 'Custom configuration.'}
        </p>

        {/* Advanced toggle */}
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-2"
        >
          {showAdvanced ? '▾ Advanced' : '▸ Advanced'}
        </button>

        {showAdvanced && (
          <div className="space-y-3 rounded-lg border border-[var(--stroke-divider)] p-3">
            {/* Granularity */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--text-secondary)]">Granularity</span>
              <div className="flex gap-1">
                {(['concise', 'balanced', 'detailed'] as Granularity[]).map((v) => (
                  <Button
                    key={v}
                    variant={current.granularity === v ? 'default' : 'outline'}
                    size="sm"
                    className="text-xs h-6 px-2"
                    onClick={() => handleDimensionChange('granularity', v)}
                  >
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </Button>
                ))}
              </div>
            </div>
            {/* Quote Length */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--text-secondary)]">Quote Length</span>
              <div className="flex gap-1">
                {(['minimal', 'representative', 'contextual'] as QuoteLength[]).map((v) => (
                  <Button
                    key={v}
                    variant={current.quote_length === v ? 'default' : 'outline'}
                    size="sm"
                    className="text-xs h-6 px-2"
                    onClick={() => handleDimensionChange('quote_length', v)}
                  >
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </Button>
                ))}
              </div>
            </div>
            {/* Update Stance */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--text-secondary)]">Update Stance</span>
              <div className="flex gap-1">
                {(['conservative', 'balanced', 'aggressive'] as UpdateStance[]).map((v) => (
                  <Button
                    key={v}
                    variant={current.update_stance === v ? 'default' : 'outline'}
                    size="sm"
                    className="text-xs h-6 px-2"
                    onClick={() => handleDimensionChange('update_stance', v)}
                  >
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </Button>
                ))}
              </div>
            </div>
            {/* TIER 3 */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--text-secondary)]">AI Suggestions</span>
              <div className="flex gap-1">
                {(['skip', 'extract'] as Tier3Behavior[]).map((v) => (
                  <Button
                    key={v}
                    variant={current.tier3 === v ? 'default' : 'outline'}
                    size="sm"
                    className="text-xs h-6 px-2"
                    onClick={() => handleDimensionChange('tier3', v)}
                  >
                    {v === 'skip' ? 'Skip' : 'Extract'}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
