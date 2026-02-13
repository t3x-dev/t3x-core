'use client';

import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  CheckCircle2,
  ChevronDown,
  Eye,
  Loader2,
  Trophy,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { MetricsDelta } from '@/components/optimiser/metrics/MetricsDelta';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  type ComparisonResult,
  type ConfigurationStats,
  compareConfigurations,
  type EngineRun,
  getConfigurations,
  listEngineRuns,
} from '@/lib/api';
import { cn } from '@/lib/utils';

/**
 * 格式化配置为显示字符串
 * Format configuration as display string
 */
function formatConfig(config: ConfigurationStats): string {
  return `${config.model} + ${config.prompt_version}`;
}

/**
 * 解析 URL 参数为配置对象
 * Parse URL param to config object (format: "model|version")
 */
function parseConfigParam(param: string | null): { model: string; prompt_version: string } | null {
  if (!param) return null;
  const [model, version] = param.split('|');
  if (!model || !version) return null;
  return { model, prompt_version: version };
}

/**
 * 编码配置为 URL 参数
 * Encode config to URL param (format: "model|version")
 */
function encodeConfigParam(config: { model: string; prompt_version: string }): string {
  return `${config.model}|${config.prompt_version}`;
}

/**
 * 格式化延迟显示
 */
function formatLatency(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * 计算比例的 95% 置信区间 (Wilson score interval)
 * 用于 Pass Rate 等二项分布数据
 * @param p - 比例 (0-1)
 * @param n - 样本量
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
 * 计算均值的 95% 置信区间
 * 用于 Avg Score 等连续数据
 * @param mean - 均值
 * @param std - 标准差 (估计值，默认使用 mean * 0.2)
 * @param n - 样本量
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

/**
 * 格式化置信区间为字符串
 */
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
  const searchParams = useSearchParams();
  const router = useRouter();

  // Parse URL params
  const controlParam = searchParams.get('a');
  const treatmentParam = searchParams.get('b');
  const controlConfig = parseConfigParam(controlParam);
  const treatmentConfig = parseConfigParam(treatmentParam);

  // State
  const [configurations, setConfigurations] = useState<ConfigurationStats[]>([]);
  const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Individual runs state
  const [controlRuns, setControlRuns] = useState<EngineRun[]>([]);
  const [treatmentRuns, setTreatmentRuns] = useState<EngineRun[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [runFilter, setRunFilter] = useState<'all' | 'a' | 'b'>('all');

  // Load available configurations
  useEffect(() => {
    async function loadConfigurations() {
      try {
        const configs = await getConfigurations();
        setConfigurations(configs);
      } catch {
        setError('Failed to load configurations');
      } finally {
        setLoading(false);
      }
    }
    loadConfigurations();
  }, []);

  // Load comparison when both configs are selected
  useEffect(() => {
    async function loadComparison() {
      if (!controlConfig || !treatmentConfig) {
        setComparisonResult(null);
        return;
      }

      setComparing(true);
      setError(null);

      try {
        const result = await compareConfigurations(controlConfig, treatmentConfig);
        setComparisonResult(result);
      } catch {
        setError('Failed to load comparison data');
        setComparisonResult(null);
      } finally {
        setComparing(false);
      }
    }

    loadComparison();
  }, [
    controlConfig?.model,
    controlConfig?.prompt_version,
    treatmentConfig?.model,
    treatmentConfig?.prompt_version,
  ]);

  // Load individual runs when configurations are selected
  useEffect(() => {
    async function loadIndividualRuns() {
      if (!controlConfig && !treatmentConfig) {
        setControlRuns([]);
        setTreatmentRuns([]);
        return;
      }

      setLoadingRuns(true);

      try {
        const [controlResult, treatmentResult] = await Promise.all([
          controlConfig
            ? listEngineRuns({
                model: controlConfig.model,
                prompt_version: controlConfig.prompt_version,
                limit: 10,
              })
            : Promise.resolve({ runs: [] }),
          treatmentConfig
            ? listEngineRuns({
                model: treatmentConfig.model,
                prompt_version: treatmentConfig.prompt_version,
                limit: 10,
              })
            : Promise.resolve({ runs: [] }),
        ]);

        setControlRuns(controlResult.runs);
        setTreatmentRuns(treatmentResult.runs);
      } catch {
        // Individual runs load failed - empty table will be shown
      } finally {
        setLoadingRuns(false);
      }
    }

    loadIndividualRuns();
  }, [
    controlConfig?.model,
    controlConfig?.prompt_version,
    treatmentConfig?.model,
    treatmentConfig?.prompt_version,
  ]);

  // Update URL with selected config
  const selectConfig = (
    slot: 'a' | 'b',
    config: { model: string; prompt_version: string } | null
  ) => {
    const params = new URLSearchParams(searchParams.toString());
    if (config) {
      params.set(slot, encodeConfigParam(config));
    } else {
      params.delete(slot);
    }
    router.push(`/deploy/compare?${params.toString()}`);
  };

  // Swap A and B
  const swapConfigs = () => {
    const params = new URLSearchParams();
    if (treatmentParam) params.set('a', treatmentParam);
    if (controlParam) params.set('b', controlParam);
    router.push(`/deploy/compare?${params.toString()}`);
  };

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
              <Badge className="ml-auto bg-green-500/10 text-[var(--status-success)] border-green-500/30">
                <Trophy className="h-3 w-3 mr-1" />
                Winner
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
                    onClick={() =>
                      selectConfig(slot, {
                        model: config.model,
                        prompt_version: config.prompt_version,
                      })
                    }
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

  // Can compare when both configs are selected
  const canCompare = controlConfig && treatmentConfig;

  return (
    <div className="flex h-full flex-col gap-6 overflow-auto p-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/deploy')}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div className="h-4 w-px bg-border" />
          <h1 className="text-lg font-semibold">A/B Test Comparison</h1>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={swapConfigs}
          disabled={!controlParam && !treatmentParam}
        >
          <ArrowLeftRight className="h-4 w-4" />
          Swap A ⇄ B
        </Button>
      </header>

      {/* Loading configurations */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Configuration Selectors */}
      {!loading && (
        <div className="grid gap-3 md:grid-cols-2">
          <ConfigSelector
            slot="a"
            selectedConfig={controlConfig}
            label="Control (Baseline)"
            badgeColor="bg-blue-500/10 text-[var(--status-info)] border-blue-500/30"
          />
          <ConfigSelector
            slot="b"
            selectedConfig={treatmentConfig}
            label="Treatment (Variant)"
            badgeColor="bg-green-500/10 text-[var(--status-success)] border-green-500/30"
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
      {error && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="py-6 text-center text-[var(--status-error)]">{error}</CardContent>
        </Card>
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
                  <Badge className="bg-green-500/10 text-[var(--status-success)] border-green-500/30">
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
                          <span className="h-2 w-2 rounded-full bg-blue-500" />
                          Control (A)
                        </span>
                      </th>
                      <th className="pb-3 font-medium text-center">
                        <span className="inline-flex items-center gap-1">
                          <span className="h-2 w-2 rounded-full bg-green-500" />
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
                <div className="mt-4 flex items-start gap-2 rounded-md bg-yellow-500/10 p-3 text-sm text-[var(--status-warning)]">
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
                score: Welch's t-test. CI = 95% confidence interval (Wilson score for proportions).
              </p>
            </CardContent>
          </Card>

          {/* Individual Runs Section */}
          <Card>
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
                      runFilter === 'a' && 'bg-[var(--status-info)] hover:bg-[var(--status-info)]'
                    )}
                    onClick={() => setRunFilter('a')}
                  >
                    <span className="h-2 w-2 rounded-full bg-blue-400 mr-1" />A
                  </Button>
                  <Button
                    variant={runFilter === 'b' ? 'default' : 'outline'}
                    size="sm"
                    className={cn(
                      'h-7 px-2 text-xs',
                      runFilter === 'b' && 'bg-[var(--status-success)] hover:bg-[var(--status-success)]'
                    )}
                    onClick={() => setRunFilter('b')}
                  >
                    <span className="h-2 w-2 rounded-full bg-green-400 mr-1" />B
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
                    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
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
                                      ? 'bg-blue-500/10 text-[var(--status-info)] border-blue-500/30'
                                      : 'bg-green-500/10 text-[var(--status-success)] border-green-500/30'
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
                                        ? 'border-green-500/30 bg-green-500/10 text-[var(--status-success)]'
                                        : 'border-red-500/30 bg-red-500/10 text-[var(--status-error)]'
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
                                    className={metrics.passed ? 'text-[var(--status-success)]' : 'text-[var(--status-error)]'}
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

      {/* Empty State */}
      {!loading && !comparing && !canCompare && (
        <Card>
          <CardContent className="flex h-64 flex-col items-center justify-center text-center">
            <ArrowLeftRight className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <h3 className="text-lg font-medium">Select Two Configurations to Compare</h3>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Choose a control configuration (A) and a treatment configuration (B) from the
              dropdowns above to see an A/B test comparison with statistical significance.
            </p>
          </CardContent>
        </Card>
      )}
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
