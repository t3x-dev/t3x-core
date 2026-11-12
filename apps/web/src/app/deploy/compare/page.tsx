'use client';

import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  CheckCircle2,
  ChevronDown,
  Clock,
  Eye,
  History,
  Loader2,
  Save,
  Trash2,
  Trophy,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';
import { MetricsDelta } from '@/components/optimiser/metrics/MetricsDelta';
import { ShareLinkButton } from '@/components/shared/ShareLinkButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { evaluationCompareHref, evaluationDeployHref } from '@/domain/evaluationLocation';
import { useProjects } from '@/hooks/projects/useProjects';
import { useQuery } from '@/hooks/shared/useQuery';
import {
  type ComparisonResult,
  type ConfigurationStats,
  compareConfigurations,
  createSavedComparison,
  deleteSavedComparison,
  type EngineRun,
  getConfigurations,
  getSavedComparison,
  listEngineRuns,
  listSavedComparisons,
} from '@/infrastructure';
import { cn } from '@/utils/cn';

/** Format configuration as display string */
function formatConfig(config: ConfigurationStats): string {
  return `${config.model} + ${config.prompt_version}`;
}

/** Encode config to URL param (format: "model|version") */
function encodeConfigParam(config: { model: string; prompt_version: string }): string {
  return `${config.model}|${config.prompt_version}`;
}

function configIdentity({ model, prompt_version }: ConfigurationStats) {
  return { model, prompt_version };
}

async function listConfigurationRuns(projectId: string, config: ConfigurationStats) {
  const filters = { ...configIdentity(config), project_id: projectId, limit: 10 };
  const [completed, failed] = await Promise.all([
    listEngineRuns({ ...filters, status: 'completed' }),
    listEngineRuns({ ...filters, status: 'failed' }),
  ]);
  return [...completed.runs, ...failed.runs]
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, 10);
}

/** Format latency for display */
function formatLatency(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * 95% confidence interval for a proportion (Wilson score interval).
 * Used for pass rate and other binomial data.
 * @param p - proportion (0-1)
 * @param n - sample size
 * @returns [lower, upper] 95% CI bounds
 */
function calculateProportionCI(p: number, n: number): [number, number] {
  if (n === 0) return [0, 0];
  // Z-score for 95% confidence
  const z = 1.96;
  const z2 = z * z;

  // Wilson score interval (more accurate for small n)
  const denominator = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denominator;
  const margin = (z / denominator) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));

  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

/**
 * 95% confidence interval for a mean.
 * Used for avg score and other continuous data.
 * @param mean - sample mean
 * @param n - sample size
 * @param std - standard deviation estimate (defaults to mean * 0.2)
 * @returns [lower, upper] 95% CI bounds
 */
function calculateMeanCI(mean: number, n: number, std?: number): [number, number] {
  if (n === 0) return [0, 0];
  // Use estimated std if not provided (assume CV ~20%)
  const sigma = std ?? mean * 0.2;
  const z = 1.96;
  const margin = z * (sigma / Math.sqrt(n));

  return [Math.max(0, mean - margin), mean + margin];
}

/** Format confidence interval as a display string */
function formatCI(ci: [number, number], asPercent: boolean = true): string {
  if (asPercent) {
    return `${Math.round(ci[0] * 100)}-${Math.round(ci[1] * 100)}%`;
  }
  return `${ci[0].toFixed(2)}-${ci[1].toFixed(2)}`;
}

/**
 * Extract evaluation metrics from EngineRun result
 */
function getRunMetrics(run: EngineRun): {
  passed: boolean | null;
  score: number | null;
  latencyMs: number | null;
} {
  const result = run.result as Record<string, unknown> | null;
  if (!result) {
    return { passed: null, score: null, latencyMs: null };
  }

  const runReport = result.run_report as Record<string, unknown> | undefined;
  const evalResult = (runReport?.eval_result || result.eval_result) as
    | Record<string, unknown>
    | undefined;

  const passed = (evalResult?.passed as boolean | undefined) ?? null;
  const score = (evalResult?.score as number | undefined) ?? null;

  const traceSummary = result.trace_summary as Record<string, unknown> | undefined;
  const latencyMs = (traceSummary?.latency_ms as number | undefined) ?? null;

  return { passed, score, latencyMs };
}

/**
 * Format score as percentage
 */
function formatScore(score: number | null): string {
  if (score === null) return '-';
  return `${Math.round(score * 100)}%`;
}

function ComparePageContent() {
  const params = useSearchParams();
  const projectId = params.get('project')?.trim() ?? '';
  const saved = params.get('saved');
  const router = useRouter();
  const { projects, loading, error, refresh } = useProjects(100, undefined, true);
  const listed = projects.some((project) => project.project_id === projectId);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <label className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
          Project
          <select
            className="max-w-full rounded-md border bg-background px-2 py-1.5"
            value={projectId}
            onChange={(event) =>
              router.push(
                evaluationCompareHref(event.target.value, !projectId && saved ? { saved } : {})
              )
            }
          >
            <option value="">Choose a project</option>
            {projectId && !listed && <option value={projectId}>{projectId}</option>}
            {projects.map((project) => (
              <option key={project.project_id} value={project.project_id}>
                {project.namespace ? `${project.namespace}/${project.name}` : project.name}
              </option>
            ))}
          </select>
        </label>
        {loading && <span className="text-sm text-muted-foreground">Loading projects…</span>}
        {error && (
          <Button variant="ghost" size="sm" onClick={() => void refresh()}>
            Retry project list
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1">
        {projectId ? (
          <ProjectComparison key={projectId} projectId={projectId} />
        ) : (
          <div className="space-y-2 p-6">
            <h1 className="text-lg font-medium">A/B Test Comparison</h1>
            <p className="text-sm text-muted-foreground">
              {error
                ? 'Could not load projects.'
                : !loading && projects.length === 0
                  ? 'There are no accessible projects to compare.'
                  : 'Choose a project to see its configurations and saved comparisons.'}
            </p>
            <Link href="/repositories" className="text-sm underline">
              Browse repositories
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectComparison({ projectId }: { projectId: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const savedSnapshotId = searchParams.get('saved');
  const controlParam = savedSnapshotId ? null : searchParams.get('a');
  const treatmentParam = savedSnapshotId ? null : searchParams.get('b');
  const configurationsQuery = useQuery({
    queryKey: ['evaluation-configurations', projectId],
    queryFn: () => getConfigurations(projectId),
    enabled: !savedSnapshotId,
    staleTime: 0,
  });
  const configurations = configurationsQuery.data ?? [];
  const loading = configurationsQuery.isLoading;
  const controlConfig =
    configurations.find((config) => encodeConfigParam(config) === controlParam) ?? null;
  const treatmentConfig =
    configurations.find((config) => encodeConfigParam(config) === treatmentParam) ?? null;
  const canCompare = Boolean(controlConfig && treatmentConfig && controlParam !== treatmentParam);
  const history = useQuery({
    queryKey: ['evaluation-comparison-history', projectId],
    queryFn: () => listSavedComparisons(projectId),
    staleTime: 0,
  });
  const savedComparisons = history.data ?? [];
  const snapshot = useQuery({
    queryKey: ['evaluation-comparison-snapshot', projectId, savedSnapshotId],
    queryFn: async () => {
      const saved = await getSavedComparison(savedSnapshotId as string, projectId);
      if (saved.project_id !== projectId)
        throw new Error('Saved comparison belongs to another project.');
      const result = saved.result_snapshot as Partial<ComparisonResult>;
      if (
        !result.control ||
        !result.treatment ||
        !result.comparison?.pass_rate ||
        !result.comparison.avg_score ||
        !result.comparison.avg_latency ||
        !result.comparison.avg_tokens
      ) {
        throw new Error('This saved comparison has an unsupported result format.');
      }
      return result as ComparisonResult;
    },
    enabled: Boolean(savedSnapshotId),
    staleTime: 0,
  });
  const live = useQuery({
    queryKey: ['evaluation-comparison', projectId, controlParam, treatmentParam],
    queryFn: () =>
      compareConfigurations(
        configIdentity(controlConfig as ConfigurationStats),
        configIdentity(treatmentConfig as ConfigurationStats),
        projectId
      ),
    enabled: canCompare && !configurationsQuery.error && !loading,
    staleTime: 0,
  });
  const samples = useQuery({
    queryKey: ['evaluation-comparison-runs', projectId, controlParam, treatmentParam],
    queryFn: async () => {
      const [controlRuns, treatmentRuns] = await Promise.all([
        listConfigurationRuns(projectId, controlConfig as ConfigurationStats),
        listConfigurationRuns(projectId, treatmentConfig as ConfigurationStats),
      ]);
      return { controlRuns, treatmentRuns };
    },
    enabled: canCompare && !configurationsQuery.error && !loading,
    staleTime: 0,
  });
  const { controlRuns = [], treatmentRuns = [] } = samples.data ?? {};
  const loadingRuns = samples.isLoading;
  const resultQuery = savedSnapshotId ? snapshot : live;
  const comparing = resultQuery.isLoading;
  const comparisonResult = resultQuery.error ? null : resultQuery.data;
  const [runFilter, setRunFilter] = useState<'all' | 'a' | 'b'>('all');
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveTitle, setSaveTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const canSave =
    !savedSnapshotId &&
    comparisonResult &&
    !comparing &&
    controlConfig &&
    treatmentConfig &&
    samples.data &&
    !loadingRuns &&
    !samples.error;

  async function handleSave() {
    if (!canSave || !saveTitle.trim() || saving) return;
    setSaveError('');
    setSaving(true);
    try {
      await createSavedComparison({
        project_id: projectId,
        title: saveTitle.trim(),
        control_config: configIdentity(controlConfig),
        treatment_config: configIdentity(treatmentConfig),
        control_run_ids: controlRuns.map((r) => r.run_id),
        treatment_run_ids: treatmentRuns.map((r) => r.run_id),
        result_snapshot: comparisonResult as unknown as Record<string, unknown>,
      });
      history.refetch();
      setSaveDialogOpen(false);
    } catch {
      setSaveError('Could not confirm the save. Check the project history before trying again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteSaved(id: string, event: React.MouseEvent) {
    event.stopPropagation();
    setHistoryError('');
    try {
      await deleteSavedComparison(id, projectId);
      history.refetch();
      const current = new URLSearchParams(window.location.search);
      if (current.get('project') === projectId && current.get('saved') === id) {
        router.push(evaluationCompareHref(projectId));
      }
    } catch {
      setHistoryError('Could not confirm deletion. Refresh the project history.');
    }
  }

  function selectConfig(slot: 'a' | 'b', config: ConfigurationStats) {
    const selection: Record<string, string> = {};
    if (controlParam) selection.a = controlParam;
    if (treatmentParam) selection.b = treatmentParam;
    selection[slot] = encodeConfigParam(config);
    setSaveDialogOpen(false);
    router.push(evaluationCompareHref(projectId, selection));
  }

  function swapConfigs() {
    const selection: Record<string, string> = {};
    if (treatmentParam) selection.a = treatmentParam;
    if (controlParam) selection.b = controlParam;
    setSaveDialogOpen(false);
    router.push(evaluationCompareHref(projectId, selection));
  }

  // Check if a config matches the current selection
  const isConfigSelected = (
    config: ConfigurationStats,
    selected: { model: string; prompt_version: string } | null
  ): boolean => {
    if (!selected) return false;
    return config.model === selected.model && config.prompt_version === selected.prompt_version;
  };

  // Check if treatment is the winner (significantly better in key metrics)
  const isWinner =
    comparisonResult &&
    ((comparisonResult.comparison.pass_rate.isSignificant &&
      comparisonResult.treatment.pass_rate > comparisonResult.control.pass_rate) ||
      (comparisonResult.comparison.avg_score.isSignificant &&
        comparisonResult.treatment.avg_score > comparisonResult.control.avg_score));

  // Configuration selector dropdown
  const ConfigSelector = ({
    slot,
    selectedConfig,
    label,
    badgeColor,
  }: {
    slot: 'a' | 'b';
    selectedConfig: { model: string; prompt_version: string } | null;
    label: string;
    badgeColor: string;
  }) => {
    const selectedStats = configurations.find((c) => isConfigSelected(c, selectedConfig));
    const showWinner = slot === 'b' && isWinner;

    // Calculate CIs for display
    const passRateCI = selectedStats
      ? calculateProportionCI(selectedStats.pass_rate, selectedStats.run_count)
      : null;
    const avgScoreCI = selectedStats
      ? calculateMeanCI(selectedStats.avg_score, selectedStats.run_count)
      : null;

    return (
      <Card className={cn(showWinner && 'ring-2 ring-[var(--status-success)]/50')}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Badge variant="outline" className={badgeColor}>
              {slot.toUpperCase()}
            </Badge>
            {label}
            {showWinner && (
              <Badge className="ml-auto bg-[var(--status-success-muted)] text-[var(--status-success)] border-[var(--status-success)]/30">
                <Trophy className="h-3 w-3 mr-1" />
                Winner
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-[var(--space-group)]">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                {selectedStats ? (
                  <span className="truncate">
                    {formatConfig(selectedStats)} (n={selectedStats.run_count})
                  </span>
                ) : (
                  <span className="text-muted-foreground">Select configuration...</span>
                )}
                <ChevronDown className="ml-2 h-4 w-4 shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72 max-h-64 overflow-auto">
              {configurations.length === 0 ? (
                <div className="p-2 text-sm text-muted-foreground">No configurations available</div>
              ) : (
                configurations.map((config) => (
                  <DropdownMenuItem
                    key={`${config.model}-${config.prompt_version}`}
                    disabled={
                      encodeConfigParam(config) === (slot === 'a' ? treatmentParam : controlParam)
                    }
                    onClick={() => selectConfig(slot, config)}
                    className={cn(isConfigSelected(config, selectedConfig) && 'bg-muted')}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="truncate">{formatConfig(config)}</span>
                      <span className="text-xs text-muted-foreground font-mono ml-2">
                        n={config.run_count}
                      </span>
                    </div>
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Stats display with CI */}
          {selectedStats && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Sample Size</span>
                <span className="font-mono font-medium">n = {selectedStats.run_count}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Pass Rate</span>
                <div className="text-right">
                  <span className="font-mono font-medium">
                    {Math.round(selectedStats.pass_rate * 100)}%
                  </span>
                  {passRateCI && selectedStats.run_count >= 5 && (
                    <span className="text-xs text-muted-foreground ml-1">
                      (CI: {formatCI(passRateCI)})
                    </span>
                  )}
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Avg Score</span>
                <div className="text-right">
                  <span className="font-mono font-medium">
                    {selectedStats.avg_score.toFixed(2)}
                  </span>
                  {avgScoreCI && selectedStats.run_count >= 5 && (
                    <span className="text-xs text-muted-foreground ml-1">
                      (CI: {formatCI(avgScoreCI, false)})
                    </span>
                  )}
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Avg Latency</span>
                <span className="font-mono">{formatLatency(selectedStats.avg_latency_ms)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Avg Tokens</span>
                <span className="font-mono">{Math.round(selectedStats.avg_tokens)}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="flex h-full flex-col">
      {/* Fixed Header */}
      <header className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-4 py-2">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(evaluationDeployHref(projectId))}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div className="h-4 w-px bg-[var(--stroke-divider)]" />
          <h1 className="text-[14px] font-semibold text-[var(--text-primary)]">
            {savedSnapshotId ? 'Saved Comparison' : 'A/B Test Comparison'}
          </h1>
          {savedSnapshotId && (
            <Badge variant="outline" className="text-xs">
              <Clock className="h-3 w-3 mr-1" />
              Snapshot
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Save button — only when comparing live data */}
          {canSave && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSaveError('');
                const now = new Date().toLocaleDateString();
                setSaveTitle(`${controlConfig.model} vs ${treatmentConfig.model} · ${now}`);
                setSaveDialogOpen(true);
              }}
            >
              <Save className="h-4 w-4" />
              Save
            </Button>
          )}
          {/* Share button for saved snapshots */}
          {savedSnapshotId && snapshot.data && !snapshot.error && (
            <ShareLinkButton entityType="comparison" entityId={savedSnapshotId} />
          )}
          {/* History dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <History className="h-4 w-4" />
                History
                {savedComparisons.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                    {savedComparisons.length}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80 max-h-72 overflow-auto">
              {history.isLoading ? (
                <div className="p-3 text-sm text-muted-foreground">Loading project history…</div>
              ) : history.error ? (
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    history.refetch();
                  }}
                >
                  Could not load history. Retry
                </DropdownMenuItem>
              ) : savedComparisons.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground text-center">
                  No saved comparisons yet
                </div>
              ) : (
                savedComparisons.map((sc) => (
                  <DropdownMenuItem
                    key={sc.comparison_id}
                    className={cn(
                      'flex items-center justify-between',
                      savedSnapshotId === sc.comparison_id && 'bg-muted'
                    )}
                    onClick={() =>
                      router.push(evaluationCompareHref(projectId, { saved: sc.comparison_id }))
                    }
                  >
                    <div className="flex-1 min-w-0 mr-2">
                      <div className="text-sm font-medium truncate">{sc.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(sc.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 text-destructive"
                      aria-label={`Delete comparison ${sc.title}`}
                      onClick={(e) => handleDeleteSaved(sc.comparison_id, e)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuItem>
                ))
              )}
              {savedSnapshotId && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => router.push(evaluationCompareHref(projectId))}>
                    Back to live comparison
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            size="sm"
            onClick={swapConfigs}
            disabled={!!savedSnapshotId || (!controlParam && !treatmentParam)}
          >
            <ArrowLeftRight className="h-4 w-4" />
            Swap A ⇄ B
          </Button>
        </div>
      </header>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-auto p-[var(--space-page)]">
        <div className="flex flex-col gap-[var(--space-section)]">
          {/* Save Dialog */}
          <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Save Comparison</DialogTitle>
              </DialogHeader>
              <Input
                placeholder="Comparison title"
                value={saveTitle}
                onChange={(e) => setSaveTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && saveTitle.trim()) handleSave();
                }}
              />
              {saveError && (
                <p role="alert" className="text-sm text-destructive">
                  {saveError}
                </p>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={saving || !saveTitle.trim()}>
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Loading configurations */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Configuration Selectors */}
          {!savedSnapshotId &&
            !loading &&
            !configurationsQuery.error &&
            configurations.length >= 2 && (
              <div className="grid gap-3 md:grid-cols-2">
                <ConfigSelector
                  slot="a"
                  selectedConfig={controlConfig}
                  label="Control (Baseline)"
                  badgeColor="bg-[var(--status-info-muted)] text-[var(--status-info)] border-[var(--status-info)]/30"
                />
                <ConfigSelector
                  slot="b"
                  selectedConfig={treatmentConfig}
                  label="Treatment (Variant)"
                  badgeColor="bg-[var(--status-success-muted)] text-[var(--status-success)] border-[var(--status-success)]/30"
                />
              </div>
            )}

          {/* Comparing loading state */}
          {comparing && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Calculating statistics...</span>
            </div>
          )}

          {/* Error State */}
          {(configurationsQuery.error || resultQuery.error || historyError) && (
            <Card className="border-[var(--status-error)]/30 bg-[var(--status-error-muted)]">
              <CardContent
                className="flex flex-wrap items-center gap-2 py-4 text-[var(--status-error)]"
                role="alert"
              >
                {configurationsQuery.error
                  ? 'Could not load configurations for this project.'
                  : resultQuery.error
                    ? savedSnapshotId
                      ? resultQuery.error.message
                      : 'Could not load comparison data.'
                    : historyError}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (configurationsQuery.error) configurationsQuery.refetch();
                    else if (resultQuery.error) resultQuery.refetch();
                    else {
                      setHistoryError('');
                      history.refetch();
                    }
                  }}
                >
                  Retry
                </Button>
              </CardContent>
            </Card>
          )}
          {samples.error && (
            <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
              Could not load the runs behind this comparison.
              <Button variant="outline" size="sm" onClick={samples.refetch}>
                Retry runs
              </Button>
            </div>
          )}

          {/* Comparison Results */}
          {!comparing && comparisonResult && (
            <>
              {/* Statistical Comparison Table */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-base">
                    <span>Statistical Comparison</span>
                    {isWinner && (
                      <Badge className="bg-[var(--status-success-muted)] text-[var(--status-success)] border-[var(--status-success)]/30">
                        <Trophy className="h-3 w-3 mr-1" />
                        Treatment (B) wins
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b text-left text-sm">
                          <th className="pb-3 font-medium">Metric</th>
                          <th className="pb-3 font-medium text-center">
                            <span className="inline-flex items-center gap-1">
                              <span className="h-2 w-2 rounded-full bg-[var(--status-info)]" />
                              Control (A)
                            </span>
                          </th>
                          <th className="pb-3 font-medium text-center">
                            <span className="inline-flex items-center gap-1">
                              <span className="h-2 w-2 rounded-full bg-[var(--status-success)]" />
                              Treatment (B)
                            </span>
                          </th>
                          <th className="pb-3 font-medium text-center">Delta</th>
                          <th className="pb-3 font-medium text-center">95% CI</th>
                          <th className="pb-3 font-medium text-center">p-value</th>
                          <th className="pb-3 font-medium text-center">Sig.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* Pass Rate */}
                        {(() => {
                          const controlCI = calculateProportionCI(
                            comparisonResult.control.pass_rate,
                            comparisonResult.control.run_count
                          );
                          const treatmentCI = calculateProportionCI(
                            comparisonResult.treatment.pass_rate,
                            comparisonResult.treatment.run_count
                          );
                          return (
                            <tr className="border-b">
                              <td className="py-3 text-sm font-medium">Pass Rate</td>
                              <td className="py-3 text-center">
                                <div className="font-mono text-sm">
                                  {Math.round(comparisonResult.control.pass_rate * 100)}%
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  ({formatCI(controlCI)})
                                </div>
                              </td>
                              <td className="py-3 text-center">
                                <div className="font-mono text-sm">
                                  {Math.round(comparisonResult.treatment.pass_rate * 100)}%
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  ({formatCI(treatmentCI)})
                                </div>
                              </td>
                              <td className="py-3 text-center">
                                <MetricsDelta
                                  v1={comparisonResult.control.pass_rate}
                                  v2={comparisonResult.treatment.pass_rate}
                                />
                              </td>
                              <td className="py-3 text-center font-mono text-xs text-muted-foreground">
                                {formatCI([
                                  treatmentCI[0] - controlCI[1],
                                  treatmentCI[1] - controlCI[0],
                                ])}
                              </td>
                              <td className="py-3 text-center font-mono text-xs text-muted-foreground">
                                {comparisonResult.comparison.pass_rate.pValue.toFixed(3)}
                              </td>
                              <td className="py-3 text-center">
                                {comparisonResult.comparison.pass_rate.isSignificant ? (
                                  <CheckCircle2 className="h-4 w-4 text-[var(--status-success)] mx-auto" />
                                ) : (
                                  <span className="text-xs text-muted-foreground">─</span>
                                )}
                              </td>
                            </tr>
                          );
                        })()}

                        {/* Avg Score */}
                        {(() => {
                          const controlCI = calculateMeanCI(
                            comparisonResult.control.avg_score,
                            comparisonResult.control.run_count
                          );
                          const treatmentCI = calculateMeanCI(
                            comparisonResult.treatment.avg_score,
                            comparisonResult.treatment.run_count
                          );
                          return (
                            <tr className="border-b">
                              <td className="py-3 text-sm font-medium">Avg Score</td>
                              <td className="py-3 text-center">
                                <div className="font-mono text-sm">
                                  {comparisonResult.control.avg_score.toFixed(2)}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  ({formatCI(controlCI, false)})
                                </div>
                              </td>
                              <td className="py-3 text-center">
                                <div className="font-mono text-sm">
                                  {comparisonResult.treatment.avg_score.toFixed(2)}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  ({formatCI(treatmentCI, false)})
                                </div>
                              </td>
                              <td className="py-3 text-center">
                                <MetricsDelta
                                  v1={comparisonResult.control.avg_score}
                                  v2={comparisonResult.treatment.avg_score}
                                />
                              </td>
                              <td className="py-3 text-center font-mono text-xs text-muted-foreground">
                                {formatCI(
                                  [treatmentCI[0] - controlCI[1], treatmentCI[1] - controlCI[0]],
                                  false
                                )}
                              </td>
                              <td className="py-3 text-center font-mono text-xs text-muted-foreground">
                                {comparisonResult.comparison.avg_score.pValue.toFixed(3)}
                              </td>
                              <td className="py-3 text-center">
                                {comparisonResult.comparison.avg_score.isSignificant ? (
                                  <CheckCircle2 className="h-4 w-4 text-[var(--status-success)] mx-auto" />
                                ) : (
                                  <span className="text-xs text-muted-foreground">─</span>
                                )}
                              </td>
                            </tr>
                          );
                        })()}

                        {/* Avg Latency */}
                        <tr className="border-b">
                          <td className="py-3 text-sm font-medium">Avg Latency</td>
                          <td className="py-3 text-center font-mono text-sm">
                            {formatLatency(comparisonResult.control.avg_latency_ms)}
                          </td>
                          <td className="py-3 text-center font-mono text-sm">
                            {formatLatency(comparisonResult.treatment.avg_latency_ms)}
                          </td>
                          <td className="py-3 text-center">
                            <span
                              className={cn(
                                'text-xs font-mono',
                                comparisonResult.comparison.avg_latency.delta < 0
                                  ? 'text-[var(--status-success)]'
                                  : comparisonResult.comparison.avg_latency.delta > 0
                                    ? 'text-[var(--status-error)]'
                                    : 'text-muted-foreground'
                              )}
                            >
                              {comparisonResult.comparison.avg_latency.delta > 0 ? '+' : ''}
                              {formatLatency(comparisonResult.comparison.avg_latency.delta)}
                            </span>
                          </td>
                          <td className="py-3 text-center text-xs text-muted-foreground">─</td>
                          <td className="py-3 text-center text-xs text-muted-foreground">─</td>
                          <td className="py-3 text-center text-xs text-muted-foreground">─</td>
                        </tr>

                        {/* Avg Tokens */}
                        <tr className="border-b last:border-0">
                          <td className="py-3 text-sm font-medium">Avg Tokens</td>
                          <td className="py-3 text-center font-mono text-sm">
                            {Math.round(comparisonResult.control.avg_tokens)}
                          </td>
                          <td className="py-3 text-center font-mono text-sm">
                            {Math.round(comparisonResult.treatment.avg_tokens)}
                          </td>
                          <td className="py-3 text-center">
                            <span
                              className={cn(
                                'text-xs font-mono',
                                comparisonResult.comparison.avg_tokens.delta < 0
                                  ? 'text-[var(--status-success)]'
                                  : comparisonResult.comparison.avg_tokens.delta > 0
                                    ? 'text-[var(--status-error)]'
                                    : 'text-muted-foreground'
                              )}
                            >
                              {comparisonResult.comparison.avg_tokens.delta > 0 ? '+' : ''}
                              {Math.round(comparisonResult.comparison.avg_tokens.delta)}
                            </span>
                          </td>
                          <td className="py-3 text-center text-xs text-muted-foreground">─</td>
                          <td className="py-3 text-center text-xs text-muted-foreground">─</td>
                          <td className="py-3 text-center text-xs text-muted-foreground">─</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Sample size warning */}
                  {(!comparisonResult.comparison.pass_rate.sampleSizeAdequate ||
                    !comparisonResult.comparison.avg_score.sampleSizeAdequate) && (
                    <div className="mt-4 flex items-start gap-2 rounded-md bg-[var(--status-warning-muted)] p-3 text-sm text-[var(--status-warning)]">
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>
                        Sample size may be insufficient for reliable significance detection
                        (recommended: n &ge; 30 per group)
                      </span>
                    </div>
                  )}

                  {/* Significance note */}
                  <p className="mt-4 text-xs text-muted-foreground">
                    * Statistical significance: p &lt; 0.05. Pass rate: two-proportion z-test; Avg
                    score: Welch's t-test. CI = 95% confidence interval (Wilson score for
                    proportions).
                  </p>
                </CardContent>
              </Card>

              {/* Individual Runs Section */}
              <Card className={savedSnapshotId || samples.error ? 'hidden' : undefined}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-base">
                    <span>Individual Runs</span>
                    <div className="flex gap-1">
                      <Button
                        variant={runFilter === 'all' ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setRunFilter('all')}
                      >
                        All
                      </Button>
                      <Button
                        variant={runFilter === 'a' ? 'default' : 'outline'}
                        size="sm"
                        className={cn(
                          'h-7 px-2 text-xs',
                          runFilter === 'a' &&
                            'bg-[var(--status-info)] hover:bg-[var(--status-info)]'
                        )}
                        onClick={() => setRunFilter('a')}
                      >
                        <span className="h-2 w-2 rounded-full bg-[var(--status-info)] mr-1" />A
                      </Button>
                      <Button
                        variant={runFilter === 'b' ? 'default' : 'outline'}
                        size="sm"
                        className={cn(
                          'h-7 px-2 text-xs',
                          runFilter === 'b' &&
                            'bg-[var(--status-success)] hover:bg-[var(--status-success)]'
                        )}
                        onClick={() => setRunFilter('b')}
                      >
                        <span className="h-2 w-2 rounded-full bg-[var(--status-success)] mr-1" />B
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingRuns ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      <span className="ml-2 text-sm text-muted-foreground">Loading runs...</span>
                    </div>
                  ) : (
                    (() => {
                      // Combine and filter runs based on selection
                      const taggedControlRuns = controlRuns.map((r) => ({
                        ...r,
                        group: 'a' as const,
                      }));
                      const taggedTreatmentRuns = treatmentRuns.map((r) => ({
                        ...r,
                        group: 'b' as const,
                      }));

                      let combinedRuns =
                        runFilter === 'a'
                          ? taggedControlRuns
                          : runFilter === 'b'
                            ? taggedTreatmentRuns
                            : [...taggedControlRuns, ...taggedTreatmentRuns];

                      // Sort by created_at descending
                      combinedRuns = combinedRuns.sort(
                        (a, b) =>
                          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                      );

                      // Limit to 10 runs
                      combinedRuns = combinedRuns.slice(0, 10);

                      if (combinedRuns.length === 0) {
                        return (
                          <div className="py-8 text-center text-sm text-muted-foreground">
                            No runs found for the selected configurations
                          </div>
                        );
                      }

                      return (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-12">Group</TableHead>
                              <TableHead>Run ID</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="text-right">Score</TableHead>
                              <TableHead className="text-right">Latency</TableHead>
                              <TableHead>Time</TableHead>
                              <TableHead className="w-20">Action</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {combinedRuns.map((run) => {
                              const metrics = getRunMetrics(run);
                              return (
                                <TableRow
                                  key={run.run_id}
                                  className="cursor-pointer hover:bg-muted/50"
                                  onClick={() => router.push(`/deploy/eval/${run.run_id}`)}
                                >
                                  <TableCell>
                                    <Badge
                                      variant="outline"
                                      className={cn(
                                        'text-xs',
                                        run.group === 'a'
                                          ? 'bg-[var(--status-info-muted)] text-[var(--status-info)] border-[var(--status-info)]/30'
                                          : 'bg-[var(--status-success-muted)] text-[var(--status-success)] border-[var(--status-success)]/30'
                                      )}
                                    >
                                      {run.group.toUpperCase()}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    <code className="text-xs">{run.run_id.slice(0, 12)}...</code>
                                  </TableCell>
                                  <TableCell>
                                    {metrics.passed !== null ? (
                                      <Badge
                                        variant="outline"
                                        className={cn(
                                          metrics.passed
                                            ? 'border-[var(--status-success)]/30 bg-[var(--status-success-muted)] text-[var(--status-success)]'
                                            : 'border-[var(--status-error)]/30 bg-[var(--status-error-muted)] text-[var(--status-error)]'
                                        )}
                                      >
                                        {metrics.passed ? 'passed' : 'failed'}
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-muted-foreground">
                                        {run.status}
                                      </Badge>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-sm">
                                    {metrics.score !== null ? (
                                      <span
                                        className={
                                          metrics.passed
                                            ? 'text-[var(--status-success)]'
                                            : 'text-[var(--status-error)]'
                                        }
                                      >
                                        {formatScore(metrics.score)}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground">-</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-sm text-muted-foreground">
                                    {formatLatency(metrics.latencyMs ?? 0)}
                                  </TableCell>
                                  <TableCell className="text-sm text-muted-foreground">
                                    {new Date(run.created_at).toLocaleString()}
                                  </TableCell>
                                  <TableCell>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 px-2"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        router.push(`/deploy/eval/${run.run_id}`);
                                      }}
                                    >
                                      <Eye className="h-3.5 w-3.5" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      );
                    })()
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {!savedSnapshotId && !loading && !configurationsQuery.error && !canCompare && (
            <Card>
              <CardContent className="space-y-3 py-8 text-center">
                <h2 className="text-lg font-medium">
                  {configurations.length === 0
                    ? 'No comparable runs yet'
                    : configurations.length === 1
                      ? 'One configuration available'
                      : 'Select two different configurations'}
                </h2>
                <p className="mx-auto max-w-lg text-sm text-muted-foreground">
                  {configurations.length < 2
                    ? 'Compare needs two distinct model and prompt version combinations from finished evaluation runs in this project.'
                    : 'Choose a baseline and a variant from this project.'}
                </p>
                {configurations.length < 2 && (
                  <Button asChild variant="outline">
                    <Link href={evaluationDeployHref(projectId, true)}>
                      Prepare comparison data
                    </Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// Loading fallback for Suspense
function ComparePageLoading() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      <span className="text-sm text-muted-foreground">Loading comparison...</span>
    </div>
  );
}

export default function ComparePage() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<ComparePageLoading />}>
        <ComparePageContent />
      </Suspense>
    </ErrorBoundary>
  );
}
