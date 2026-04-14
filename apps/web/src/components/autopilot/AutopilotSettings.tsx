'use client';

import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useAutopilot } from '@/hooks/shared/useAutopilot';
import { cn } from '@/utils/cn';
import type { AdaptiveResult, AutopilotConfig } from '@/types/api';

export function AutopilotSettings({ projectId }: { projectId: string }) {
  const [config, setConfig] = useState<AutopilotConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [adaptiveResult, setAdaptiveResult] = useState<AdaptiveResult | null>(null);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { loadConfig, saveConfig, loadAdaptiveThreshold } = useAutopilot();

  // Load config and adaptive data on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [cfg, adaptive] = await Promise.all([
          loadConfig(projectId),
          loadAdaptiveThreshold(projectId).catch(() => null),
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
  }, [projectId, loadConfig, loadAdaptiveThreshold]);

  // Debounced save helper
  const debouncedSave = useCallback(
    (updated: Partial<AutopilotConfig>) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          setSaving(true);
          const saved = await saveConfig(projectId, updated);
          setConfig(saved);
          toast.success('Autopilot settings saved');
        } catch (_err) {
          toast.error('Failed to save settings');
        } finally {
          setSaving(false);
        }
      }, 400);
    },
    [projectId, saveConfig]
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
    // Apply adaptive suggestions (cosine threshold delta)
    // Future: implement specific adaptive actions
  }, [adaptiveResult, config]);

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
            Automatically commit knowledge when thresholds are met
          </span>
        </label>
        <Switch
          id="autopilot-enabled"
          checked={config.enabled}
          onCheckedChange={(v) => handleChange('enabled', v)}
        />
      </div>

      {/* Min Nodes */}
      <div className="space-y-2">
        <Label htmlFor="min-nodes" className="text-sm text-[var(--text-primary)]">
          Minimum Frames
        </Label>
        <Input
          id="min-nodes"
          type="number"
          min={1}
          value={config.min_nodes}
          onChange={(e) => {
            const val = Number.parseInt(e.target.value, 10);
            if (!Number.isNaN(val) && val >= 1) {
              handleChange('min_nodes', val);
            }
          }}
          className="max-w-[120px]"
        />
        <p className="text-xs text-[var(--text-tertiary)]">
          Minimum number of nodes required to trigger an auto-commit
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
          {adaptiveResult?.adaptive
            ? (() => {
                const stats = adaptiveResult.stats as Record<string, unknown> | undefined;
                const totalCount = (stats?.total as number) ?? 0;
                const editRate =
                  totalCount > 0 ? ((stats?.edited as number) ?? 0) / totalCount : null;
                const byType = (stats?.by_type as Record<string, { accept_rate?: number }>) ?? {};
                const { suppressedTypes, cosineThresholdDelta } =
                  adaptiveResult.adaptive;

                return (
                  <div className="space-y-3">
                    {/* Feedback sample count */}
                    {totalCount > 0 && (
                      <p className="text-xs text-[var(--text-tertiary)]">
                        Based on {totalCount} feedback action{totalCount !== 1 ? 's' : ''}
                      </p>
                    )}

                    {/* Cosine delta with reasoning */}
                    <div className="text-sm">
                      <span className="text-[var(--text-tertiary)]">Cosine threshold:</span>{' '}
                      <span className="font-mono text-[var(--text-primary)]">
                        {cosineThresholdDelta > 0 ? '+' : ''}
                        {cosineThresholdDelta.toFixed(3)}
                      </span>
                      {editRate != null && (
                        <span className="text-[var(--text-tertiary)]">
                          {' '}
                          (edit rate {Math.round(editRate * 100)}%)
                        </span>
                      )}
                    </div>

                    {/* Suppressed types */}
                    {suppressedTypes.length > 0 && (
                      <div className="text-sm">
                        <span className="text-[var(--text-tertiary)]">Suppressed types:</span>{' '}
                        <span className="text-[var(--text-primary)]">
                          {suppressedTypes.join(', ')}
                        </span>
                      </div>
                    )}

                    <Button variant="outline" size="sm" onClick={handleApplyAdaptive}>
                      Apply Suggestions
                    </Button>

                    {/* Rule explanation */}
                    <p className="text-xs text-[var(--text-tertiary)] mt-2">
                      Types with accept rate below 50% and 20+ samples are disabled.
                    </p>
                  </div>
                );
              })()
            : (() => {
                const count =
                  ((adaptiveResult?.stats as Record<string, unknown>)?.total as number) ?? 0;
                const threshold = 10;

                return (
                  <div className="space-y-2">
                    <p className="text-sm text-[var(--text-tertiary)]">
                      {adaptiveResult?.message ||
                        'Need more feedback data to compute adaptive thresholds.'}
                    </p>
                    {count > 0 && count < threshold && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs text-[var(--text-tertiary)]">
                          <span>
                            {count}/{threshold} feedback actions
                          </span>
                        </div>
                        <div className="h-1.5 bg-[var(--surface-app)] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[var(--accent-blue)]"
                            style={{ width: `${Math.round((count / threshold) * 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
        </CardContent>
      </Card>
    </div>
  );
}
