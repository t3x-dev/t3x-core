'use client';

import { Activity, CheckCircle, Percent, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { EngineRun } from '@/lib/api';

interface QuickStatsBarProps {
  runs: EngineRun[];
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subValue?: string;
}

function StatCard({ icon, label, value, subValue }: StatCardProps) {
  return (
    <Card className="py-3">
      <CardContent className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
          {icon}
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-xl font-semibold">{value}</p>
          {subValue && <p className="text-xs text-muted-foreground">{subValue}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Extract evaluation data from EngineRun result
 */
function getEvalData(run: EngineRun): {
  passed: boolean | null;
  score: number | null;
  latencyMs: number | null;
  totalTokens: number | null;
} {
  const result = run.result as Record<string, unknown> | null;
  if (!result) {
    return { passed: null, score: null, latencyMs: null, totalTokens: null };
  }

  // Try to get eval_result from run_report or directly
  const runReport = result.run_report as Record<string, unknown> | undefined;
  const evalResult = (runReport?.eval_result || result.eval_result) as Record<string, unknown> | undefined;

  const passed = evalResult?.passed as boolean | undefined ?? null;
  const score = evalResult?.score as number | undefined ?? null;

  // Try to get trace summary data
  // traceSummaryJson might be stored separately or in result
  const traceSummary = result.trace_summary as Record<string, unknown> | undefined;
  const latencyMs = traceSummary?.latency_ms as number | undefined ?? null;
  const tokens = traceSummary?.tokens as Record<string, unknown> | undefined;
  const totalTokens = tokens?.total_tokens as number | undefined ?? null;

  return { passed, score, latencyMs, totalTokens };
}

export function QuickStatsBar({ runs }: QuickStatsBarProps) {
  // Calculate statistics
  const totalRuns = runs.length;

  // Count completed runs with pass/fail status
  const completedRuns = runs.filter((r) => r.status === 'completed' || r.status === 'failed');

  // Extract eval data for each run
  const evalDataList = completedRuns.map(getEvalData);

  // Count passed runs
  const passedRuns = evalDataList.filter((d) => d.passed === true).length;

  // Calculate average score (only for runs with scores)
  const scoresWithValues = evalDataList.filter((d) => d.score !== null).map((d) => d.score!);
  const avgScore = scoresWithValues.length > 0
    ? scoresWithValues.reduce((sum, s) => sum + s, 0) / scoresWithValues.length
    : null;

  // Calculate average latency (only for runs with latency data)
  const latenciesWithValues = evalDataList.filter((d) => d.latencyMs !== null).map((d) => d.latencyMs!);
  const avgLatencyMs = latenciesWithValues.length > 0
    ? latenciesWithValues.reduce((sum, l) => sum + l, 0) / latenciesWithValues.length
    : null;

  // Format latency for display
  const formatLatency = (ms: number | null): string => {
    if (ms === null) return '-';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  // Format score as percentage
  const formatScore = (score: number | null): string => {
    if (score === null) return '-';
    return `${Math.round(score * 100)}%`;
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        icon={<Activity className="h-5 w-5 text-blue-500" />}
        label="Total Runs"
        value={totalRuns}
        subValue={completedRuns.length < totalRuns ? `${completedRuns.length} completed` : undefined}
      />
      <StatCard
        icon={<CheckCircle className="h-5 w-5 text-green-500" />}
        label="Passed"
        value={passedRuns}
        subValue={completedRuns.length > 0 ? `${Math.round((passedRuns / completedRuns.length) * 100)}% pass rate` : undefined}
      />
      <StatCard
        icon={<Percent className="h-5 w-5 text-purple-500" />}
        label="Avg Score"
        value={formatScore(avgScore)}
        subValue={scoresWithValues.length > 0 ? `from ${scoresWithValues.length} runs` : undefined}
      />
      <StatCard
        icon={<Clock className="h-5 w-5 text-orange-500" />}
        label="Avg Latency"
        value={formatLatency(avgLatencyMs)}
        subValue={latenciesWithValues.length > 0 ? `from ${latenciesWithValues.length} runs` : undefined}
      />
    </div>
  );
}
