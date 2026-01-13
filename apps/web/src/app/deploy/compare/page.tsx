'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowLeftRight,
  CheckCircle,
  XCircle,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { getEngineRun, listEngineRuns, type EngineRun } from '@/lib/api';
import { DualChart, type DimensionScores } from '@/components/optimiser/charts/DualChart';
import { MetricsDelta } from '@/components/optimiser/metrics/MetricsDelta';

// Parse dimension scores from run result
function parseDimensionScores(run: EngineRun): DimensionScores | null {
  const result = run.result as Record<string, unknown> | null;
  if (!result) return null;

  const runReport = result.run_report as Record<string, unknown> | undefined;
  const evalResult = (runReport?.eval_result || result.eval_result) as Record<string, unknown> | undefined;

  return evalResult?.dimension_scores as DimensionScores | undefined || null;
}

// Parse score from run result
function parseScore(run: EngineRun): number | null {
  const result = run.result as Record<string, unknown> | null;
  if (!result) return null;

  const runReport = result.run_report as Record<string, unknown> | undefined;
  const evalResult = (runReport?.eval_result || result.eval_result) as Record<string, unknown> | undefined;

  return evalResult?.score as number | undefined ?? null;
}

// Parse passed status from run result
function parsePassed(run: EngineRun): boolean {
  const result = run.result as Record<string, unknown> | null;
  if (!result) return run.status === 'completed';

  const runReport = result.run_report as Record<string, unknown> | undefined;
  const evalResult = (runReport?.eval_result || result.eval_result) as Record<string, unknown> | undefined;

  return evalResult?.passed as boolean ?? run.status === 'completed';
}

// Dimension labels
const DIMENSION_LABELS: Record<keyof DimensionScores, string> = {
  task_completion: 'Task Completion',
  tool_use: 'Tool Use',
  trajectory_efficiency: 'Efficiency',
  cost_efficiency: 'Cost',
  latency: 'Latency',
};

function ComparePageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const v1Id = searchParams.get('v1');
  const v2Id = searchParams.get('v2');

  const [runV1, setRunV1] = useState<EngineRun | null>(null);
  const [runV2, setRunV2] = useState<EngineRun | null>(null);
  const [availableRuns, setAvailableRuns] = useState<EngineRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load available runs for dropdown
  useEffect(() => {
    async function loadRuns() {
      try {
        const { runs } = await listEngineRuns({ status: 'completed', limit: 50 });
        setAvailableRuns(runs);
      } catch (err) {
        console.error('Failed to load runs:', err);
      }
    }
    loadRuns();
  }, []);

  // Load selected runs
  useEffect(() => {
    async function loadSelectedRuns() {
      setLoading(true);
      setError(null);

      try {
        const [r1, r2] = await Promise.all([
          v1Id ? getEngineRun(v1Id) : Promise.resolve(null),
          v2Id ? getEngineRun(v2Id) : Promise.resolve(null),
        ]);
        setRunV1(r1);
        setRunV2(r2);
      } catch (err) {
        console.error('Failed to load runs:', err);
        setError('Failed to load run data');
      } finally {
        setLoading(false);
      }
    }

    loadSelectedRuns();
  }, [v1Id, v2Id]);

  // Update URL with selected runs
  const selectRun = (slot: 'v1' | 'v2', runId: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (runId) {
      params.set(slot, runId);
    } else {
      params.delete(slot);
    }
    router.push(`/deploy/compare?${params.toString()}`);
  };

  // Swap V1 and V2
  const swapRuns = () => {
    const params = new URLSearchParams();
    if (v2Id) params.set('v1', v2Id);
    if (v1Id) params.set('v2', v1Id);
    router.push(`/deploy/compare?${params.toString()}`);
  };

  // Parse scores
  const scoresV1 = runV1 ? parseDimensionScores(runV1) : null;
  const scoresV2 = runV2 ? parseDimensionScores(runV2) : null;
  const scoreV1 = runV1 ? parseScore(runV1) : null;
  const scoreV2 = runV2 ? parseScore(runV2) : null;
  const passedV1 = runV1 ? parsePassed(runV1) : false;
  const passedV2 = runV2 ? parsePassed(runV2) : false;

  // Can compare when both runs are selected and have dimension scores
  const canCompare = scoresV1 && scoresV2;

  // Dimension comparison data
  const dimensionComparison = useMemo(() => {
    if (!scoresV1 || !scoresV2) return [];

    return (Object.keys(DIMENSION_LABELS) as Array<keyof DimensionScores>).map((key) => ({
      key,
      label: DIMENSION_LABELS[key],
      v1: scoresV1[key],
      v2: scoresV2[key],
      delta: scoresV2[key] - scoresV1[key],
    }));
  }, [scoresV1, scoresV2]);

  // Run selector dropdown
  const RunSelector = ({
    slot,
    selectedId,
    selectedRun,
  }: {
    slot: 'v1' | 'v2';
    selectedId: string | null;
    selectedRun: EngineRun | null;
  }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="w-full justify-between">
          {selectedRun ? (
            <span className="truncate">{selectedRun.run_id}</span>
          ) : (
            <span className="text-muted-foreground">Select run...</span>
          )}
          <ChevronDown className="ml-2 h-4 w-4 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 max-h-64 overflow-auto">
        {availableRuns.length === 0 ? (
          <div className="p-2 text-sm text-muted-foreground">No completed runs</div>
        ) : (
          availableRuns.map((run) => (
            <DropdownMenuItem
              key={run.run_id}
              onClick={() => selectRun(slot, run.run_id)}
              className={cn(selectedId === run.run_id && 'bg-muted')}
            >
              <div className="flex items-center gap-2 w-full">
                {parsePassed(run) ? (
                  <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-red-500" />
                )}
                <span className="truncate flex-1">{run.run_id}</span>
                <span className="text-xs text-muted-foreground font-mono">
                  {parseScore(run) !== null ? `${Math.round(parseScore(run)! * 100)}%` : '-'}
                </span>
              </div>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

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
          <h1 className="text-lg font-semibold">Compare Runs</h1>
        </div>
        <Button variant="outline" size="sm" onClick={swapRuns} disabled={!v1Id && !v2Id}>
          <ArrowLeftRight className="h-4 w-4" />
          Swap V1 ⇄ V2
        </Button>
      </header>

      {/* Run Selectors */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* V1 Selector */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30">
                V1
              </Badge>
              Baseline
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <RunSelector slot="v1" selectedId={v1Id} selectedRun={runV1} />
            {runV1 && (
              <div className="flex items-center gap-4 text-sm">
                <Badge
                  variant="outline"
                  className={cn(
                    passedV1
                      ? 'border-green-500/30 bg-green-500/10 text-green-600'
                      : 'border-red-500/30 bg-red-500/10 text-red-600'
                  )}
                >
                  {passedV1 ? 'Passed' : 'Failed'}
                </Badge>
                <span>
                  Score:{' '}
                  <span className="font-mono font-medium">
                    {scoreV1 !== null ? `${Math.round(scoreV1 * 100)}%` : '-'}
                  </span>
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* V2 Selector */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">
                V2
              </Badge>
              Comparison
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <RunSelector slot="v2" selectedId={v2Id} selectedRun={runV2} />
            {runV2 && (
              <div className="flex items-center gap-4 text-sm">
                <Badge
                  variant="outline"
                  className={cn(
                    passedV2
                      ? 'border-green-500/30 bg-green-500/10 text-green-600'
                      : 'border-red-500/30 bg-red-500/10 text-red-600'
                  )}
                >
                  {passedV2 ? 'Passed' : 'Failed'}
                </Badge>
                <span>
                  Score:{' '}
                  <span className="font-mono font-medium">
                    {scoreV2 !== null ? `${Math.round(scoreV2 * 100)}%` : '-'}
                  </span>
                </span>
                {scoreV1 !== null && scoreV2 !== null && (
                  <MetricsDelta v1={scoreV1} v2={scoreV2} />
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Loading State */}
      {loading && (v1Id || v2Id) && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error State */}
      {error && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="py-6 text-center text-red-600">{error}</CardContent>
        </Card>
      )}

      {/* Comparison Content */}
      {!loading && canCompare && (
        <>
          {/* Dual Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Dimension Scores Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <DualChart
                scoresV1={scoresV1}
                scoresV2={scoresV2}
                labelV1={`V1: ${v1Id?.slice(0, 8)}...`}
                labelV2={`V2: ${v2Id?.slice(0, 8)}...`}
              />
            </CardContent>
          </Card>

          {/* Dimension Comparison Table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Detailed Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b text-left text-sm">
                      <th className="pb-3 font-medium">Dimension</th>
                      <th className="pb-3 font-medium text-center">
                        <span className="inline-flex items-center gap-1">
                          <span className="h-2 w-2 rounded-full bg-blue-500" />
                          V1
                        </span>
                      </th>
                      <th className="pb-3 font-medium text-center">
                        <span className="inline-flex items-center gap-1">
                          <span className="h-2 w-2 rounded-full bg-green-500" />
                          V2
                        </span>
                      </th>
                      <th className="pb-3 font-medium text-center">Delta</th>
                      <th className="pb-3 font-medium text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dimensionComparison.map((dim) => {
                      const isImproved = dim.delta > 0.001;
                      const isRegressed = dim.delta < -0.001;
                      const isSame = !isImproved && !isRegressed;

                      return (
                        <tr key={dim.key} className="border-b last:border-0">
                          <td className="py-3 text-sm">{dim.label}</td>
                          <td className="py-3 text-center font-mono text-sm">
                            {Math.round(dim.v1 * 100)}%
                          </td>
                          <td className="py-3 text-center font-mono text-sm font-medium">
                            {Math.round(dim.v2 * 100)}%
                          </td>
                          <td className="py-3 text-center">
                            <MetricsDelta v1={dim.v1} v2={dim.v2} />
                          </td>
                          <td className="py-3 text-center">
                            {isSame && (
                              <span className="text-xs text-muted-foreground">─ Same</span>
                            )}
                            {isImproved && (
                              <span className="text-xs text-green-600">▲ Improved</span>
                            )}
                            {isRegressed && (
                              <span className="text-xs text-red-600">▼ Regressed</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Empty State */}
      {!loading && !canCompare && (
        <Card>
          <CardContent className="flex h-64 flex-col items-center justify-center text-center">
            <ArrowLeftRight className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <h3 className="text-lg font-medium">Select Two Runs to Compare</h3>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Choose a baseline run (V1) and a comparison run (V2) from the dropdowns above to see a
              side-by-side comparison of their dimension scores.
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
    <Suspense fallback={<ComparePageLoading />}>
      <ComparePageContent />
    </Suspense>
  );
}
