'use client';

import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  type AdaptiveResult,
  type AutopilotConfig,
  getAdaptiveThreshold,
  getAutopilotConfig,
  updateAutopilotConfig,
} from '@/lib/api/autopilot';
import { cn } from '@/lib/utils';

export function AutopilotSettings({ projectId }: { projectId: string }) {
  const [config, setConfig] = useState<AutopilotConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [adaptiveResult, setAdaptiveResult] = useState<AdaptiveResult | null>(null);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load config and adaptive data on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [cfg, adaptive] = await Promise.all([
          getAutopilotConfig(projectId),
          getAdaptiveThreshold(projectId).catch(() => null),
        ]);
        if (cancelled) return;
        setConfig(cfg);
        setAdaptiveResult(adaptive);
      } catch (_err) {
        // UI shows fallback message when config is null
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [projectId]);

  // Debounced save helper
  const debouncedSave = useCallback(
    (updated: Partial<AutopilotConfig>) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          setSaving(true);
          const saved = await updateAutopilotConfig(projectId, updated);
          setConfig(saved);
          toast.success('Autopilot settings saved');
        } catch (_err) {
          toast.error('Failed to save settings');
        } finally {
          setSaving(false);
        }
      }, 400);
    },
    [projectId]
  );

  const handleChange = useCallback(
    <K extends keyof AutopilotConfig>(field: K, value: AutopilotConfig[K]) => {
      setConfig((prev) => {
        if (!prev) return prev;
        const updated = { ...prev, [field]: value };
        debouncedSave(updated);
        return updated;
      });
    },
    [debouncedSave]
  );

  const handleApplyAdaptive = useCallback(async () => {
    if (!adaptiveResult?.adaptive || !config) return;
    const delta = adaptiveResult.adaptive.cosineThresholdDelta;
    const newConfidence = Math.max(0, Math.min(1, config.min_confidence + delta));
    const rounded = Math.round(newConfidence * 20) / 20; // round to nearest 0.05
    handleChange('min_confidence', rounded);
  }, [adaptiveResult, config, handleChange]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--text-tertiary)]" />
      </div>
    );
  }

  if (!config) {
    return (
      <p className="text-sm text-[var(--text-tertiary)]">Failed to load autopilot configuration.</p>
    );
  }

  return (
    <div className="space-y-6">
      {/* Saving indicator */}
      {saving && <p className="text-xs text-[var(--text-tertiary)]">Saving...</p>}

      {/* Enabled toggle */}
      <div className="flex items-center justify-between">
        <label htmlFor="autopilot-enabled" className="flex flex-col gap-1">
          <span className="text-sm font-medium text-[var(--text-primary)]">Enable Autopilot</span>
          <span className="text-xs text-[var(--text-tertiary)]">
            Automatically commit knowledge when confidence thresholds are met
          </span>
        </label>
        <Switch
          id="autopilot-enabled"
          checked={config.enabled}
          onCheckedChange={(v) => handleChange('enabled', v)}
        />
      </div>

      {/* Min Confidence slider */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm text-[var(--text-primary)]">Minimum Confidence</Label>
          <span className="text-sm font-mono text-[var(--text-secondary)]">
            {config.min_confidence.toFixed(2)}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={config.min_confidence}
          onChange={(e) => handleChange('min_confidence', Number(e.target.value))}
          className={cn(
            'w-full h-2 rounded-lg appearance-none cursor-pointer',
            'bg-[var(--surface-app)] accent-[var(--accent-blue)]'
          )}
        />
        <div className="flex justify-between text-xs text-[var(--text-tertiary)]">
          <span>0</span>
          <span>1</span>
        </div>
      </div>

      {/* Min Sentences */}
      <div className="space-y-2">
        <Label htmlFor="min-sentences" className="text-sm text-[var(--text-primary)]">
          Minimum Sentences
        </Label>
        <Input
          id="min-sentences"
          type="number"
          min={1}
          value={config.min_sentences}
          onChange={(e) => {
            const val = Number.parseInt(e.target.value, 10);
            if (!Number.isNaN(val) && val >= 1) {
              handleChange('min_sentences', val);
            }
          }}
          className="max-w-[120px]"
        />
        <p className="text-xs text-[var(--text-tertiary)]">
          Minimum number of sentences required to trigger an auto-commit
        </p>
      </div>

      {/* Auto-create Leaf toggle */}
      <div className="flex items-center justify-between">
        <label htmlFor="auto-create-leaf" className="flex flex-col gap-1">
          <span className="text-sm font-medium text-[var(--text-primary)]">Auto-create Leaf</span>
          <span className="text-xs text-[var(--text-tertiary)]">
            Automatically create a leaf node after auto-commit
          </span>
        </label>
        <Switch
          id="auto-create-leaf"
          checked={config.auto_create_leaf}
          onCheckedChange={(v) => handleChange('auto_create_leaf', v)}
        />
      </div>

      {/* Target Branch */}
      <div className="space-y-2">
        <Label htmlFor="target-branch" className="text-sm text-[var(--text-primary)]">
          Target Branch
        </Label>
        <Input
          id="target-branch"
          type="text"
          value={config.target_branch}
          onChange={(e) => handleChange('target_branch', e.target.value)}
          className="max-w-[240px]"
        />
        <p className="text-xs text-[var(--text-tertiary)]">
          Branch where auto-committed knowledge will be stored
        </p>
      </div>

      {/* Adaptive Threshold Card */}
      <Card className="border-[var(--stroke-divider)]">
        <CardHeader>
          <CardTitle className="text-sm">Adaptive Threshold</CardTitle>
        </CardHeader>
        <CardContent>
          {adaptiveResult?.adaptive ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-[var(--text-tertiary)]">Cosine delta:</span>{' '}
                  <span className="font-mono text-[var(--text-primary)]">
                    {adaptiveResult.adaptive.cosineThresholdDelta > 0 ? '+' : ''}
                    {adaptiveResult.adaptive.cosineThresholdDelta.toFixed(3)}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--text-tertiary)]">Suppressed types:</span>{' '}
                  <span className="text-[var(--text-primary)]">
                    {adaptiveResult.adaptive.suppressedTypes.length > 0
                      ? adaptiveResult.adaptive.suppressedTypes.join(', ')
                      : 'None'}
                  </span>
                </div>
              </div>

              {Object.keys(adaptiveResult.adaptive.confidenceMultipliers).length > 0 && (
                <div className="text-sm">
                  <span className="text-[var(--text-tertiary)]">Confidence multipliers:</span>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {Object.entries(adaptiveResult.adaptive.confidenceMultipliers).map(
                      ([key, val]) => (
                        <span
                          key={key}
                          className="inline-flex items-center rounded bg-[var(--surface-app)] px-2 py-0.5 text-xs font-mono"
                        >
                          {key}: {val.toFixed(2)}
                        </span>
                      )
                    )}
                  </div>
                </div>
              )}

              <Button variant="outline" size="sm" onClick={handleApplyAdaptive}>
                Apply Suggestions
              </Button>
            </div>
          ) : (
            <p className="text-sm text-[var(--text-tertiary)]">
              {adaptiveResult?.message || 'Need more feedback data to compute adaptive thresholds.'}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
